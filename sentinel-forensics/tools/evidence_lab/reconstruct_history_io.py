"""Anchored read-only file lifetimes for a bounded continuation family.

No hashes, JSON, SQL or artifact semantics live here. All component traversal is
relative to held directory descriptors and never follows symlinks. Callers own
the meaning of the bytes and must call close, including on failed workflows.
"""
from contextlib import contextmanager
import os
from pathlib import Path
import re
import stat
import sys

from core import IngestError, fingerprint

MAX_PAGES = 15  # At most fifteen prior siblings plus the current output page.
MAX_ENTRIES = 4096
MAX_COMPONENTS = 16
PAGE_NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}')
DIRECTORY_FLAGS = (os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0)
                   | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_CLOEXEC', 0))


def require(value, code):
    if not value:
        raise IngestError(code)


def identity(st):
    return st.st_dev, st.st_ino


def component(value):
    require(isinstance(value, str) and value not in ('', '.', '..')
            and '/' not in value and '\\' not in value and '\0' not in value
            and len(os.fsencode(value)) <= 255, 'tls_history_io_component_invalid')
    return value


def relative_parts(value):
    require(isinstance(value, str) and len(os.fsencode(value)) <= 4096,
            'tls_history_io_member_path_invalid')
    path = Path(value)
    require(not path.is_absolute() and path.as_posix() == value,
            'tls_history_io_member_path_invalid')
    parts = tuple(component(part) for part in value.split('/'))
    require(0 < len(parts) <= MAX_COMPONENTS, 'tls_history_io_member_depth')
    return parts


def absolute_directory(path):
    """Open a lexical absolute directory without following any ancestor link."""
    path = Path(path)
    require(path.is_absolute() and path.anchor == os.sep and Path(os.path.abspath(path)) == path,
            'tls_history_io_family_path_invalid')
    parts = tuple(component(part) for part in path.parts[1:])
    fd = None
    try:
        fd = os.open(path.anchor, DIRECTORY_FLAGS)
        for part in parts:
            following = os.open(part, DIRECTORY_FLAGS, dir_fd=fd)
            previous, fd = fd, following
            os.close(previous)
        return fd
    except (OSError, ValueError, RuntimeError):
        if fd is not None:
            try:
                os.close(fd)
            except OSError:
                pass
        raise IngestError('tls_history_io_family_unavailable') from None


def close_resources(stream, descriptors):
    """Close each owned handle once; an uncertain numeric FD is never retried."""
    error = None
    if stream is not None:
        try:
            stream.close()
        except BaseException as exc:
            error = exc
    for descriptor in reversed(descriptors):
        try:
            os.close(descriptor)
        except BaseException as exc:
            if error is None:
                error = exc
    if error is not None:
        if isinstance(error, Exception):
            raise IngestError('tls_history_io_close_failed') from None
        raise error


class FamilyFiles:
    """One task's family/page anchors and temporarily held member streams."""
    def __init__(self, family, guard=lambda: None):
        require(all(hasattr(os, name) for name in ('O_PATH', 'O_DIRECTORY', 'O_NOFOLLOW')),
                'tls_history_io_linux_required')
        require(callable(guard), 'tls_history_io_guard_invalid')
        self.family, self.guard = Path(family), guard
        self._pages = {}
        self._members = {}
        self._entries = set()
        self._fd = None
        self._closed = False
        self.guard()
        self._fd = absolute_directory(self.family)
        try:
            self._identity = identity(os.fstat(self._fd))
            self.check()
        except BaseException:
            try:
                self.close()
            except BaseException:
                pass
            raise

    def check(self):
        require(not self._closed and self._fd is not None, 'tls_history_io_closed')
        self.guard()
        current = None
        try:
            current = absolute_directory(self.family)
            named = os.fstat(current)
            opened = os.fstat(self._fd)
            require(identity(named) == identity(opened) == self._identity,
                    'tls_history_io_family_changed')
            for name, (descriptor, expected) in self._pages.items():
                self.guard()
                named = os.stat(name, dir_fd=self._fd, follow_symlinks=False)
                opened = os.fstat(descriptor)
                require(stat.S_ISDIR(named.st_mode) and stat.S_ISDIR(opened.st_mode)
                        and identity(named) == identity(opened) == expected,
                        'tls_history_io_page_changed')
        except (OSError, ValueError):
            raise IngestError('tls_history_io_directory_changed') from None
        finally:
            if current is not None:
                os.close(current)

    def register_page(self, name):
        require(isinstance(name, str) and PAGE_NAME.fullmatch(name),
                'tls_history_io_page_name_invalid')
        self.check()
        if name in self._pages:
            return self.family / name
        require(len(self._pages) < MAX_PAGES, 'tls_history_io_page_budget')
        descriptor = None
        try:
            descriptor = os.open(name, DIRECTORY_FLAGS, dir_fd=self._fd)
            opened = os.fstat(descriptor)
            named = os.stat(name, dir_fd=self._fd, follow_symlinks=False)
            require(stat.S_ISDIR(named.st_mode) and identity(named) == identity(opened),
                    'tls_history_io_page_changed')
            self._pages[name] = descriptor, identity(opened)
            self.check()
            descriptor = None
        except (OSError, ValueError):
            raise IngestError('tls_history_io_page_unavailable') from None
        finally:
            if descriptor is not None:
                if name in self._pages and self._pages[name][0] == descriptor:
                    self._pages.pop(name)
                os.close(descriptor)
        return self.family / name

    def _member_parts(self, path):
        path = Path(path)
        require(path.is_absolute() and Path(os.path.abspath(path)) == path,
                'tls_history_io_member_path_invalid')
        try:
            relative = path.relative_to(self.family)
        except ValueError:
            raise IngestError('tls_history_io_member_outside_family') from None
        parts = relative.parts
        require(len(parts) >= 2 and parts[0] in self._pages,
                'tls_history_io_page_not_registered')
        return (parts[0], *relative_parts('/'.join(parts[1:])))

    def _close_member(self, member):
        if member['closed']:
            return
        member['closed'] = True
        close_resources(member['stream'], member['fds'])

    def _validate_member(self, member):
        self.check()
        for parent, name, descriptor, expected in member['directories']:
            named = os.stat(name, dir_fd=parent, follow_symlinks=False)
            opened = os.fstat(descriptor)
            require(stat.S_ISDIR(named.st_mode) and identity(named) == identity(opened) == expected,
                    'tls_history_io_member_directory_changed')
        named = os.stat(member['leaf'], dir_fd=member['parent'], follow_symlinks=False)
        opened = os.fstat(member['stream'].fileno())
        require(stat.S_ISREG(named.st_mode) and stat.S_ISREG(opened.st_mode)
                and named.st_nlink == opened.st_nlink == 1
                and fingerprint(named) == fingerprint(opened) == member['initial'],
                'tls_history_io_member_changed')

    @contextmanager
    def stream(self, path):
        self.check()
        parts = self._member_parts(path)
        member = {'stream': None, 'fds': [], 'directories': [], 'closed': False}
        try:
            parent = self._pages[parts[0]][0]
            for name in parts[1:-1]:
                opened = os.open(name, DIRECTORY_FLAGS, dir_fd=parent)
                member['fds'].append(opened)
                st = os.fstat(opened)
                named = os.stat(name, dir_fd=parent, follow_symlinks=False)
                require(stat.S_ISDIR(named.st_mode) and identity(named) == identity(st),
                        'tls_history_io_member_directory_changed')
                member['directories'].append((parent, name, opened, identity(st)))
                parent = opened
            # O_PATH pins the final inode without opening a FIFO or device for
            # reading. Only a proven ordinary single-link inode is reopened.
            pinned = os.open(parts[-1], os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
            member['fds'].append(pinned)
            initial = os.fstat(pinned)
            require(stat.S_ISREG(initial.st_mode) and initial.st_nlink == 1,
                    'tls_history_io_member_not_regular_or_hardlinked')
            read_fd = os.open('/proc/self/fd/' + str(pinned), os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC)
            try:
                member['stream'] = os.fdopen(read_fd, 'rb')
            except BaseException:
                os.close(read_fd)
                raise
            member.update(parent=parent, leaf=parts[-1], initial=fingerprint(initial))
            self._validate_member(member)
            self._members[id(member)] = member
        except (OSError, ValueError):
            self._close_member(member)
            raise IngestError('tls_history_io_member_unavailable') from None
        except BaseException:
            self._close_member(member)
            raise
        try:
            yield member['stream'], initial
        finally:
            active_error = sys.exc_info()[0] is not None
            error = None
            try:
                self._validate_member(member)
            except (OSError, ValueError):
                error = IngestError('tls_history_io_member_changed')
            except BaseException as exc:
                error = exc
            try:
                self._members.pop(id(member), None)
                self._close_member(member)
            except BaseException as exc:
                if error is None:
                    error = exc
            if error is not None and not active_error:
                raise error

    def inventory(self, folder, allowed_dirs):
        self.check()
        folder = Path(folder)
        require(folder.parent == self.family and folder.name in self._pages,
                'tls_history_io_inventory_page_invalid')
        require(isinstance(allowed_dirs, (set, frozenset, list, tuple))
                and len(allowed_dirs) <= MAX_ENTRIES, 'tls_history_io_allowed_directory_budget')
        allowed = {'/'.join(relative_parts(name)) for name in allowed_dirs}
        result, visits = set(), 0

        def walk(descriptor, prefix):
            nonlocal visits
            self.guard()
            before = os.fstat(descriptor)
            scan_fd = os.open('.', DIRECTORY_FLAGS, dir_fd=descriptor)
            try:
                with os.scandir(scan_fd) as entries:
                    for entry in entries:
                        self.guard()
                        name = component(entry.name)
                        relative = prefix + name
                        relative_parts(relative)
                        visits += 1
                        require(visits <= MAX_ENTRIES, 'tls_history_io_inventory_budget')
                        key = folder.name, relative
                        if key not in self._entries:
                            require(len(self._entries) < MAX_ENTRIES, 'tls_history_io_inventory_budget')
                            self._entries.add(key)
                        current = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
                        if stat.S_ISDIR(current.st_mode):
                            require(relative in allowed, 'tls_history_io_unknown_directory')
                            child = os.open(name, DIRECTORY_FLAGS, dir_fd=descriptor)
                            try:
                                require(identity(os.fstat(child)) == identity(current),
                                        'tls_history_io_inventory_changed')
                                walk(child, relative + '/')
                                named = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
                                require(stat.S_ISDIR(named.st_mode) and identity(named) == identity(current),
                                        'tls_history_io_inventory_changed')
                            finally:
                                os.close(child)
                        else:
                            require(stat.S_ISREG(current.st_mode) and current.st_nlink == 1,
                                    'tls_history_io_inventory_not_regular')
                            if relative != 'SHA256SUMS':
                                result.add(relative)
                require(fingerprint(os.fstat(descriptor)) == fingerprint(before),
                        'tls_history_io_inventory_changed')
            finally:
                os.close(scan_fd)
        try:
            walk(self._pages[folder.name][0], '')
            self.check()
        except (OSError, ValueError):
            raise IngestError('tls_history_io_inventory_changed') from None
        return result

    def close(self):
        if self._closed:
            return
        self._closed = True
        members, self._members = list(self._members.values()), {}
        descriptors = [self._fd] if self._fd is not None else []
        descriptors += [value[0] for value in self._pages.values()]
        self._fd, self._pages = None, {}
        error = None
        for member in members:
            try:
                self._close_member(member)
            except BaseException as exc:
                if error is None:
                    error = exc
        try:
            close_resources(None, descriptors)
        except BaseException as exc:
            if error is None:
                error = exc
        if error is not None:
            raise error
