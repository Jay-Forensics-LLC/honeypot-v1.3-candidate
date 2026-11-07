"""Measured local resource gates; process exit is not a missing live RSS waiver."""
import errno
import os
from pathlib import Path
import resource
import signal
import stat
import subprocess
import threading
import time
from core import IngestError
STATUS_READ_ATTEMPTS,STATUS_RETRY_SECONDS=3,0.001
SAMPLE_SECONDS=0.05
def require(value,code):
    if not value: raise IngestError(code)

class ResourceSamplingFailure(IngestError):
    def __init__(self, code, stage, *, exception=None, state=None,
                 rss_fields=None, attempts=None):
        super().__init__(code)
        self.details = {'code':code,'stage':stage,
            'exception_type':type(exception).__name__ if exception is not None else type(self).__name__,
            'errno':getattr(exception,'errno',None),'state':state,
            'rss_field_count':rss_fields,'attempts':attempts}

def proc_absent(pid, tid=None):
    """Only explicit ENOENT/ESRCH proves disappearance; permissions never do."""
    path = Path('/proc')/str(pid)
    if tid is not None: path = path/'task'/str(tid)
    try:
        path.stat()
        return False
    except OSError as exc:
        if exc.errno in (errno.ENOENT,errno.ESRCH): return True
        raise ResourceSamplingFailure('process_presence_unavailable','presence',exception=exc) from None

def proc_identity(pid):
    try:
        with (Path('/proc')/str(pid)/'stat').open() as stream: raw = stream.read(65537)
    except OSError as exc:
        if exc.errno in (errno.ENOENT,errno.ESRCH) and proc_absent(pid): return None
        raise ResourceSamplingFailure('process_identity_unavailable','identity',exception=exc) from None
    try:
        require(len(raw) <= 65536,'process_identity_size_budget')
        fields = raw.rsplit(')',1)[1].split()
        state,start = fields[0],int(fields[19])
        require(len(state) == 1 and state in 'RSDZTtXxKWPI' and start >= 0,
                'process_identity_fields_invalid')
        return start,state
    except (ValueError,IndexError,IngestError):
        raise ResourceSamplingFailure('process_identity_fields_invalid','identity') from None

def proc_status(pid):
    try:
        with (Path('/proc')/str(pid)/'status').open() as stream: raw = stream.read(65537)
    except OSError as exc:
        if exc.errno in (errno.ENOENT,errno.ESRCH) and proc_absent(pid): return None
        raise ResourceSamplingFailure('process_status_unavailable','status',exception=exc) from None
    try:
        lines = raw.splitlines()
        states = [line.split()[1] for line in lines if line.startswith('State:')]
        rss = [line.split() for line in lines if line.startswith('VmRSS:')]
        require(len(raw) <= 65536 and len(states) == 1 and len(rss) <= 1,
                'process_status_fields_invalid')
        state = states[0]
        require(len(state) == 1 and state in 'RSDZTtXxKWPI','process_state_invalid')
        if not rss: return state,None,0
        require(len(rss[0]) == 3 and rss[0][2] == 'kB','process_rss_units_invalid')
        value = int(rss[0][1])*1024
        require(value >= 0,'process_rss_negative')
        return state,value,1
    except (ValueError,IndexError,IngestError):
        raise ResourceSamplingFailure('process_status_fields_invalid','status') from None

def measured_process_rss(pid, *, identity=proc_identity, status=proc_status,
                         pause=time.sleep, check=lambda:None, statistics=None,
                         confirm_terminal=None):
    """R/no-RSS never means zero; require real RSS or positive termination."""
    statistics = statistics if statistics is not None else {"positive_terminal_observations":0,"missing_rss_rereads":0}
    first = identity(pid)
    if first is None or first[1] in 'ZXx':
        statistics['positive_terminal_observations'] += 1
        return None,first
    last = None
    for attempt in range(1,STATUS_READ_ATTEMPTS+1):
        check()
        snapshot = status(pid)
        current = identity(pid)
        if current is None or current[0] != first[0] or current[1] in 'ZXx':
            statistics['positive_terminal_observations'] += 1
            return None,first
        if snapshot is not None:
            state,rss,count = snapshot
            if state in 'ZXx':
                statistics['positive_terminal_observations'] += 1
                return None,first
            if rss is not None:
                return rss,first
            last = state,count
        # A missing status snapshot is accepted only after identity confirms
        # disappearance. Otherwise it is missing LIVE metadata and must retry.
        if attempt < STATUS_READ_ATTEMPTS:
            statistics['missing_rss_rereads'] += 1
            pause(STATUS_RETRY_SECONDS)
    failure=ResourceSamplingFailure('live_process_memory_unavailable','status',
        state=last[0] if last else None,rss_fields=last[1] if last else 0,
        attempts=STATUS_READ_ATTEMPTS)
    if confirm_terminal is not None and confirm_terminal(pid,first,failure):
        statistics['positive_terminal_observations'] += 1
        return None,first
    raise failure

def terminal_process(pid, first):
    current = proc_identity(pid)
    return current is None or current[1] in 'ZXx' or (first is not None and current[0] != first[0])

def tree_rss(check=lambda:None,statistics=None,roots=None,skip_children_of=(),
             confirm_terminal=None):
    """Bounded retry for observed exec/exit transitions, never missing live RSS."""
    pending, seen, total = list(roots) if roots is not None else [os.getpid()],set(),0
    while pending:
        pid = pending.pop()
        if pid in seen: continue
        require(len(seen) < 128,'process_tree_cardinality_budget')
        seen.add(pid)
        base = Path('/proc')/str(pid)
        rss,first = measured_process_rss(pid,check=check,statistics=statistics,
                                       confirm_terminal=confirm_terminal)
        if rss is None: continue
        total += rss
        if pid in skip_children_of:continue
        try:
            for task in (base/'task').iterdir():
                try:
                    pending.extend(map(int,(task/'children').read_text().split()))
                except OSError as exc:
                    if exc.errno in (errno.ENOENT,errno.ESRCH) and (
                            proc_absent(pid,int(task.name)) or terminal_process(pid,first)):
                        continue
                    raise ResourceSamplingFailure('thread_children_unavailable','children',exception=exc) from None
        except ResourceSamplingFailure:
            raise
        except OSError as exc:
            if exc.errno in (errno.ENOENT,errno.ESRCH) and terminal_process(pid,first): continue
            raise ResourceSamplingFailure('process_tasks_unavailable','tasks',exception=exc) from None
        except ValueError:
            raise ResourceSamplingFailure('thread_children_invalid','children') from None
    return total




class Budget:
    """One reconstruction owns its output tree and measured descendants."""
    def __init__(self,output,limits):
        self.output,self.limits=output,limits
        self.started=time.monotonic();self.decoder_deadline=None
        self.cpu_started=time.process_time()
        self.child_cpu_started=resource.getrusage(resource.RUSAGE_CHILDREN)
        self.failure=None;self.failure_details=None
        self.peaks={'own_lifetime_rss_bytes':0,'sampled_tree_rss_bytes':0,'scratch_bytes':0}
        self.transitions={'positive_terminal_observations':0,'missing_rss_rereads':0}
        self.completion_details=[]
        self.stopping=threading.Event();self.thread=None
        self.process_lock=threading.Lock();self.processes={};self.process_identities={}

    def register(self,process):
        self.guard()
        require(callable(getattr(process,'signal_owned_group',None)),
                'tls_owned_process_interface_required')
        first=proc_identity(process.pid)
        with self.process_lock:
            require(not self.processes,'tls_decoder_already_registered')
            self.processes[process.pid]=process
            self.process_identities[process.pid]=first

    def unregister(self,process):
        with self.process_lock:
            self.processes.pop(process.pid,None)
            self.process_identities.pop(process.pid,None)

    def lifetime_memory_gate(self):
        self.guard()
        require(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss*1024+
                self.peaks['own_lifetime_rss_bytes']<=self.limits['rss_bytes'],
                'tls_conservative_lifetime_memory_budget')

    def confirm_owned_completion(self,pid,first,failure,processes,identities,deadline):
        """Missing RSS needs positive exact-child reaping, never an extra retry.

        The snapshot keeps the original Popen alive across unregister races.
        Only the remainder of this one 50ms sampling interval is available.
        """
        process,registered=processes.get(pid),identities.get(pid)
        if process is None or registered is None or first[0]!=registered[0]:return False
        self.guard()
        require(len(self.completion_details)<32,'tls_completion_diagnostic_budget')
        detail=dict(failure.details,confirmation='pending')
        self.completion_details.append(detail)
        remaining=deadline-time.monotonic()
        if remaining<=0:
            detail['confirmation']='interval_expired';return False
        try:code=process.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            self.guard();detail['confirmation']='still_live';return False
        self.guard()
        if time.monotonic()>deadline:
            detail['confirmation']='interval_expired';return False
        require(type(code) is int and process.returncode==code,'tls_owned_reaping_unavailable')
        current=proc_identity(pid)
        if current is not None and current[0]==registered[0] and current[1] not in 'ZXx':
            detail['confirmation']='identity_still_live';return False
        try:os.killpg(pid,0)
        except OSError as exc:
            if exc.errno!=errno.ESRCH:
                raise ResourceSamplingFailure('owned_group_presence_unavailable',
                    'owned_completion',exception=exc) from None
        else:
            detail['confirmation']='group_still_live';return False
        self.lifetime_memory_gate()
        self.guard()
        if time.monotonic()>deadline:
            detail['confirmation']='interval_expired';return False
        detail['confirmation']='original_child_reaped_and_group_absent'
        return True

    def kill_registered(self):
        with self.process_lock:processes=list(self.processes.values())
        active=False
        for process in processes:
            active=process.signal_owned_group(signal.SIGTERM) or active
        if not active:return
        time.sleep(0.1)
        for process in processes:
            process.signal_owned_group(signal.SIGKILL)

    def guard(self):
        if time.monotonic()-self.started>=self.limits['timeout_seconds']:
            self.failure='tls_total_time_budget'
        if self.decoder_deadline is not None and time.monotonic()>=self.decoder_deadline:
            self.failure='tls_decoder_time_budget'
        self.peaks['own_lifetime_rss_bytes']=max(self.peaks['own_lifetime_rss_bytes'],
            resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024)
        if self.peaks['own_lifetime_rss_bytes']>self.limits['rss_bytes']:
            self.failure='tls_own_memory_budget'
        if self.failure:raise IngestError(self.failure)

    def scratch(self):
        logical=allocated=0
        for base,dirs,files in os.walk(self.output):
            for name in dirs+files:
                path=Path(base)/name
                try:st=path.lstat()
                except FileNotFoundError:continue
                require(not stat.S_ISLNK(st.st_mode),'tls_output_symlink')
                logical+=st.st_size;allocated+=st.st_blocks*512
        descriptors=list(Path('/proc/self/fd').iterdir())
        require(len(descriptors)<=256,'tls_resource_fd_budget')
        unlinked={}
        for fd in descriptors:
            try:st=fd.stat()
            except FileNotFoundError:continue
            if stat.S_ISREG(st.st_mode) and st.st_nlink==0:
                key=st.st_dev,st.st_ino
                unlinked[key]=max(unlinked.get(key,0),st.st_size,st.st_blocks*512)
        return max(logical,allocated)+sum(unlinked.values())+65536

    def sample(self):
        deadline=time.monotonic()+SAMPLE_SECONDS
        self.guard()
        with self.process_lock:
            processes=dict(self.processes);identities=dict(self.process_identities)
        self.peaks['sampled_tree_rss_bytes']=max(self.peaks['sampled_tree_rss_bytes'],
            tree_rss(check=self.guard,statistics=self.transitions,roots=[os.getpid()]+list(processes),
                     skip_children_of={os.getpid()},confirm_terminal=lambda pid,first,failure:
                         self.confirm_owned_completion(pid,first,failure,processes,identities,deadline)))
        self.peaks['scratch_bytes']=max(self.peaks['scratch_bytes'],self.scratch())
        require(self.peaks['sampled_tree_rss_bytes']<=self.limits['rss_bytes'],'tls_process_tree_memory_budget')
        require(self.peaks['scratch_bytes']<=self.limits['scratch_bytes'],'tls_scratch_budget')

    def begin_decoder(self):
        self.guard();self.decoder_deadline=time.monotonic()+self.limits['decoder_seconds']

    def end_decoder(self):
        self.guard();self.decoder_deadline=None

    def start(self):
        def watch():
            while not self.stopping.wait(SAMPLE_SECONDS):
                try:self.sample()
                except BaseException as exc:
                    self.failure=self.failure or (str(exc) if isinstance(exc,IngestError)
                        and not isinstance(exc,ResourceSamplingFailure) else 'tls_resource_sampling_failed')
                    self.failure_details=exc.details if isinstance(exc,ResourceSamplingFailure) else {
                        'code':str(exc) if isinstance(exc,IngestError) else 'resource_sample_unavailable',
                        'stage':'resource_monitor','exception_type':type(exc).__name__,
                        'errno':getattr(exc,'errno',None)}
                    try:self.kill_registered()
                    except BaseException:pass
                    return
        self.sample();self.thread=threading.Thread(target=watch);self.thread.start()

    def finish(self):
        self.stopping.set()
        if self.thread is not None:self.thread.join()
        self.guard()
        with self.process_lock:require(not self.processes,'tls_decoder_remaining')
        self.lifetime_memory_gate()
        self.sample()
        return self.snapshot()

    def snapshot(self):
        children=resource.getrusage(resource.RUSAGE_CHILDREN)
        own_cpu=time.process_time()-self.cpu_started
        child_user=children.ru_utime-self.child_cpu_started.ru_utime
        child_system=children.ru_stime-self.child_cpu_started.ru_stime
        return {'wall_seconds':time.monotonic()-self.started,'peaks':dict(self.peaks),
            'producer_cpu_seconds':own_cpu,'child_user_cpu_seconds':child_user,
            'child_system_cpu_seconds':child_system,'combined_cpu_seconds':own_cpu+child_user+child_system,
            'child_lifetime_peak_rss_bytes':children.ru_maxrss*1024,
            'sampling_transitions':dict(self.transitions),
            'sampling_terminal_confirmations':list(self.completion_details),
            'sampling_failure':self.failure_details,
            'limitations':['RSS/disk samples have a nominal 50ms wait between scans; scan cost and bounded terminal confirmation can extend that cadence. These measured gates are not OS quotas or a guarantee of every transient allocation.',
                'After three missing-RSS reads, only an exact registered child positively reaped with terminal original identity and absent owned group within the remaining sample interval can be excluded; its reaped lifetime peak remains gated.',
                'Metric snapshots precede terminal serialization/checksum writes; final guards are also enforced and can only downgrade completion.',
                'The current producer process includes its embedding application; conservative child lifetime maxima may include previously reaped children. Use a fresh CLI for independently measured task budgets.',
                'Own open/unlinked SQLite files and a64KiB trusted-Lua reserve are included; decoder descriptor visibility may be unavailable.']}

    def stop(self):
        self.stopping.set()
        if self.thread is not None:self.thread.join()
        self.kill_registered()
