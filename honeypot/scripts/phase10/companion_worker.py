"""Fixed isolated launcher for a trusted, separately installed offline analyzer."""
import os
from pathlib import Path
import resource
import runpy
import sys


def main():
    if os.geteuid() == 0 or sys.platform != 'linux' or sys.version_info < (3, 11) or len(sys.argv) != 4:
        return 2
    os.umask(0o077)
    for kind, maximum in ((resource.RLIMIT_AS, 512 * 1024**2), (resource.RLIMIT_CPU, 110),
                          (resource.RLIMIT_NOFILE, 64), (resource.RLIMIT_FSIZE, 64 * 1024**2),
                          (resource.RLIMIT_CORE, 0)):
        _, hard = resource.getrlimit(kind)
        bound = maximum if hard == resource.RLIM_INFINITY else min(maximum, hard)
        resource.setrlimit(kind, (bound, bound))
    analyzer, source, output = (Path(value) for value in sys.argv[1:])
    # -I omits the current directory. Only the explicitly configured companion's
    # source directory is added; the captured file is always treated as data.
    sys.path.insert(0, str(analyzer.parent))
    sys.argv = [str(analyzer), str(source), '--output', str(output)]
    runpy.run_path(str(analyzer), run_name='__main__')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
