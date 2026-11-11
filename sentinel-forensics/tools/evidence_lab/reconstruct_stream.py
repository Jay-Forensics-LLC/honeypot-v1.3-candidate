"""Bounded source-record stream for optional offline TLS reconstruction.

Caller supplies one independently bound closed classic-PCAP source and COMPLETE
whole-cohort plan, owns its read-only descriptor, and performs full source hashes
and fingerprints before/after. This adapter cannot establish plan completeness,
original ordinal numbering, acquisition authenticity or full-source integrity.
Only exact source record bytes enter the derivative stream. Original locators
remain private metadata; no endpoint values or payload files are written here.
One feeder thread owns this object. Inject only trusted existing parser/guards.
"""
from dataclasses import dataclass, asdict
import hashlib
import io
import re
from reconstruct_profile import STANDARD, envelope

MAX_READ = 1024 * 1024
MAX_FRAMES = 16384
MAX_COHORTS = 4
MAX_BATCH_BYTES = 16 * 1024 * 1024
MAX_RECORD_BYTES = MAX_READ + 16
CLASSIC_MAGICS = {b'\xd4\xc3\xb2\xa1', b'\xa1\xb2\xc3\xd4',
                  b'\x4d\x3c\xb2\xa1', b'\xa1\xb2\x3c\x4d'}


class CohortStreamError(ValueError):
    """Fixed diagnostic codes only; never include source values."""


def require(condition, code):
    if not condition:
        raise CohortStreamError(code)


@dataclass(frozen=True)
class PacketReference:
    ordinal: int
    packet_number: int
    offset: int
    length: int
    sha256: str
    cohort: int


def classic_validator(reader_factory, classic_parser):
    """Adapt existing core.Reader/capture.classic; no new production parser."""
    def validate(header, record=None):
        try:
            reader = reader_factory(io.BytesIO(header + (record or b'')))
            packets = iter(classic_parser(reader))
            first = next(packets, None)
            if record is None:
                require(first is None, 'classic_header_invalid')
                return None
            require(first is not None and first.length == len(record),
                    'classic_record_length_mismatch')
            require(next(packets, None) is None, 'multiple_records_in_reference')
            return first
        except CohortStreamError:
            raise
        except Exception:
            raise CohortStreamError('classic_framing_invalid') from None
    return validate


class ClassicCohortStream:
    """Bounded read(n) input for oracle.decoder_process anonymous-pipe feeder.

    The named profile's byte cap includes the original 24-byte header. The
    default remains 16 MiB/16,384 frames; solo allows 32 MiB/32,768 frames in one cohort.
    A repeated byte-identical
    packet at another locator is preserved. Repeated/overlapping locators reject.
    Parser-provided packet offset/ordinal are virtual and never used as provenance.
    """
    def __init__(self, source, *, source_id, source_size, header, references,
                 validator, guard=None, profile=STANDARD):
        self.source = source
        self.source_id = source_id
        self.source_size = source_size
        self.validator = validator
        self.guard = guard or (lambda: None)
        self.envelope = envelope(profile)
        self.failed = None
        self._hash = hashlib.sha256()
        self.emitted_bytes = 0
        self._next = 0
        self._buffer = b''
        require(type(source_id) is int and source_id > 0, 'invalid_source_id')
        require(type(source_size) is int and 24 <= source_size < 2**63,
                'invalid_source_size')
        require(type(header) is bytes and len(header) == 24, 'invalid_header_size')
        require(header[:4] in CLASSIC_MAGICS, 'unsupported_capture_format')
        require(callable(validator) and callable(self.guard), 'invalid_validator_or_guard')
        self.header = header
        validator(header, None)
        selected, cohorts, previous, total = [], set(), None, 24
        for ref in references:
            require(len(selected) < self.envelope['frames'], 'frame_budget_exceeded')
            require(type(ref) is PacketReference, 'invalid_reference_shape')
            require(all(type(value) is int and value > 0 for value in
                        (ref.ordinal, ref.packet_number, ref.cohort)),
                    'invalid_reference_number')
            require(type(ref.offset) is int and 24 <= ref.offset < source_size,
                    'invalid_reference_offset')
            require(type(ref.length) is int and 16 <= ref.length <= MAX_RECORD_BYTES
                    and ref.offset + ref.length <= source_size,
                    'invalid_reference_length_or_range')
            require(type(ref.sha256) is str and
                    re.fullmatch(r'[0-9a-f]{64}', ref.sha256) is not None,
                    'invalid_reference_hash')
            if previous is not None:
                require(ref.offset >= previous.offset + previous.length and
                        ref.ordinal > previous.ordinal and
                        ref.packet_number > previous.packet_number,
                        'reference_order_overlap_or_duplicate')
            total += ref.length
            require(total <= self.envelope['bytes'], 'batch_byte_budget_exceeded')
            cohorts.add(ref.cohort)
            require(len(cohorts) <= self.envelope['cohorts'], 'cohort_budget_exceeded')
            selected.append(ref)
            previous = ref
        require(bool(selected), 'empty_cohort_plan')
        self.references = tuple(selected)
        self.total_bytes = total
        self.cohort_count = len(cohorts)
        try:
            self.guard()
            require(source.seek(0, 2) == source_size, 'source_size_mismatch')
            source.seek(0)
            require(self._exact(24) == header, 'source_header_mismatch')
        except CohortStreamError:
            raise
        except Exception:
            raise CohortStreamError('source_io_or_guard_failed') from None
        self._buffer = header

    def _exact(self, length):
        parts, remaining = [], length
        while remaining:
            self.guard()
            value = self.source.read(min(remaining, MAX_READ))
            require(type(value) is bytes and 0 < len(value) <= min(remaining, MAX_READ),
                    'source_truncated_or_invalid_read')
            parts.append(value)
            remaining -= len(value)
        return b''.join(parts)

    def _load_record(self):
        ref = self.references[self._next]
        require(self.source.seek(ref.offset) == ref.offset, 'source_seek_failed')
        record = self._exact(ref.length)
        require(hashlib.sha256(record).hexdigest() == ref.sha256,
                'source_record_hash_mismatch')
        packet = self.validator(self.header, record)
        require(packet is not None and packet.length == ref.length and
                packet.sha256 == ref.sha256, 'source_record_metadata_mismatch')
        self._next += 1
        self._buffer = record

    def read(self, size):
        require(type(size) is int and 0 <= size <= MAX_READ, 'read_size_budget')
        require(self.failed is None, self.failed or 'stream_failed')
        if not size:
            return b''
        try:
            self.guard()
            result = bytearray()
            while len(result) < size:
                if not self._buffer:
                    if self._next == len(self.references):
                        break
                    self._load_record()
                count = min(size - len(result), len(self._buffer))
                result.extend(self._buffer[:count])
                self._buffer = self._buffer[count:]
            value = bytes(result)
            self._hash.update(value)
            self.emitted_bytes += len(value)
            return value
        except CohortStreamError as exc:
            self.failed = str(exc)
            raise
        except Exception:
            self.failed = 'source_io_or_guard_failed'
            raise CohortStreamError(self.failed) from None

    @property
    def complete(self):
        return self.failed is None and self.emitted_bytes == self.total_bytes

    @property
    def derivative_sha256(self):
        """Complete derivative-stream hash only; NEVER a full source hash."""
        return self._hash.hexdigest() if self.complete else None

    def frame_reference(self, frame):
        require(type(frame) is int and 1 <= frame <= len(self.references),
                'unknown_mini_frame')
        return {'source_id': self.source_id, 'mini_frame': frame,
                **asdict(self.references[frame - 1])}
