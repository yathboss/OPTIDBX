"""Single-host paired experiment coordinator around the existing safe workload owner."""
import hashlib
import platform
import random
import subprocess
import threading
import time
from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Literal

from experiments.evidence import CRITERIA, EvidenceStore, evaluate
from workload.runner import QUERY


class BenchmarkRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    profile: Literal['LOW', 'MEDIUM', 'HIGH'] = 'LOW'
    repetitions: int = Field(default=5, strict=True, ge=1, le=10)
    warmup_seconds: int = Field(default=30, strict=True, ge=0, le=120)
    measurement_seconds: int = Field(default=180, strict=True, ge=30, le=480)
    initial_parallelism: int = Field(default=2, strict=True, ge=1, le=8)


def utc():
    return datetime.now(UTC).isoformat()


class BenchmarkService:
    def __init__(self, manager, store=None):
        self.manager = manager
        self.runtime = manager.runtime
        self.store = store or EvidenceStore()
        self.lock = threading.RLock()
        self.cancel_event = threading.Event()
        self.thread = None
        self.record = None
        # A process restart cannot resume the original owned sessions.
        for record in self.store.list():
            if record['status'] in ('RUNNING', 'CANCELLING'):
                record.update(status='INTERRUPTED', error='API restarted; original comparison cannot resume.',
                              ended_at=utc())
                record['evaluation'] = {'verdict': 'INCONCLUSIVE', 'reason': record['error']}
                self.store.save(record)

    def _save(self):
        with self.lock:
            self.store.save(deepcopy(self.record))

    def status(self):
        with self.lock:
            return deepcopy(self.record)

    def start(self, request):
        request = BenchmarkRequest.model_validate(request)
        with self.manager.lock, self.lock:
            if self.manager.running or self.manager.connections or self.manager.reservation:
                raise ValueError('Stop the existing workload or comparison first')
            if self.runtime.lifecycle.status()['state'] != 'MONITORING':
                raise ValueError('Wait for cooldown or resolve recovery first')
            if request.initial_parallelism not in self.runtime.config.safe_values.max_parallel_workers_per_gather:
                raise ValueError('Initial parallelism is not in the shared whitelist')
            identifier, seed = str(uuid4()), random.SystemRandom().randrange(2**32)
            rng = random.Random(seed)
            order = []
            for pair in range(request.repetitions):
                modes = ['baseline', 'adaptive']
                rng.shuffle(modes)
                order.extend({'pair': pair, 'mode': mode} for mode in modes)
            try:
                revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True,
                                                    timeout=3).strip()
            except (OSError, subprocess.SubprocessError):
                revision = 'unavailable'
            self.record = {'id': identifier, 'status': 'RUNNING', 'started_at': utc(),
                'config': request.model_dump(), 'criteria': deepcopy(CRITERIA), 'order': order,
                'seed': seed, 'runs': [], 'progress': {'phase': 'PREPARING'}, 'error': None,
                'evaluation': evaluate([], request.model_dump()),
                'manifest': {'source': 'REAL_OWNED_WORKLOAD', 'revision': revision,
                    'platform': platform.platform(), 'python': platform.python_version(),
                    'query_sha256': hashlib.sha256(QUERY.encode()).hexdigest(),
                    'query': QUERY, 'shared_config': self.runtime.config.model_dump(mode='json'),
                    'measurement': 'Client-observed query round trip including action barrier waits; completed queries fully inside the fixed window; warm-up excluded.'}}
            self._save()  # Must be durable before starting a workload.
            self.manager.reservation = identifier
            self.cancel_event.clear()
            self.thread = threading.Thread(target=self._run, daemon=True, name='PerformanceEvidence')
            self.thread.start()
            return self.status()

    def cancel(self):
        with self.lock:
            if self.record and self.record['status'] == 'RUNNING':
                self.cancel_event.set()
                self.record['status'] = 'CANCELLING'
            return self.status()

    def _progress(self, **fields):
        with self.lock:
            self.record['progress'].update(fields)

    def _wait(self, seconds, phase):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if self.cancel_event.is_set():
                raise InterruptedError('Comparison cancelled by user')
            if self.manager.error:
                raise RuntimeError(self.manager.error)
            if self.runtime.lifecycle.status()['recovery_required']:
                raise RuntimeError('Rollback unresolved; comparison stopped for recovery')
            self._progress(phase=phase, remaining_seconds=max(0, round(deadline - time.monotonic(), 1)),
                           measurements=self.manager.status().get('measurements'),
                           tuner_state=self.runtime.lifecycle.status()['state'])
            self.cancel_event.wait(min(.5, max(0, deadline - time.monotonic())))

    def _cooldown(self):
        deadline = time.monotonic() + self.runtime.config.tuning.cooldown_seconds + 20
        while self.runtime.lifecycle.status()['state'] != 'MONITORING':
            if time.monotonic() > deadline:
                raise RuntimeError('Action cooldown/recovery did not finish')
            self._wait(.5, 'COOLDOWN')

    def _run(self):
        identifier = self.record['id']
        cfg = self.record['config']
        try:
            # Read the same dataset fingerprint once; no data/schema mutation.
            from db_monitor.storage import get_connection
            conn = get_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute('SELECT version(), current_database(), count(*) FROM pgbench_accounts')
                    version, database, rows = cur.fetchone()
                with self.lock:
                    self.record['manifest'].update(postgresql=version, database=database, dataset_rows=rows)
            finally:
                conn.close()
            self._save()
            for position, spec in enumerate(self.record['order']):
                if self.cancel_event.is_set():
                    raise InterruptedError('Comparison cancelled by user')
                self._cooldown()
                self._progress(**spec, run_number=position + 1, total_runs=len(self.record['order']), phase='STARTING')
                self.manager.start(cfg['profile'], cfg['warmup_seconds'] + cfg['measurement_seconds'],
                    owner=identifier, initial_parallelism=cfg['initial_parallelism'],
                    warmup_seconds=cfg['warmup_seconds'])
                experiment_id = self.manager.experiment_id
                self._wait(cfg['warmup_seconds'], 'WARMUP')
                with self.runtime._lock:
                    self.runtime.engine.invalidate('Benchmark measurement beginning')
                    self.runtime._history.clear()
                    self.runtime.set_mode('auto' if spec['mode'] == 'adaptive' else 'recommendation')
                self._wait(max(0, self.manager.measurements.end - time.monotonic()), 'MEASURING')
                metrics = self.manager.measurements.summary(time.monotonic())
                self.manager.stop(owner=identifier)
                if self.manager.error or self.manager.connections:
                    raise RuntimeError(self.manager.error or 'Original sessions remain open')
                actions = [action for action in self.runtime.get_action_history()
                           if action.get('experiment_id') == experiment_id]
                if spec['mode'] == 'baseline' and actions:
                    raise RuntimeError('Baseline was modified; evidence invalid')
                with self.lock:
                    self.record['runs'].append({**spec, 'experiment_id': experiment_id, 'metrics': metrics,
                        'actions': actions, 'status': 'COMPLETED', 'ended_at': utc()})
                self._save()
            with self.lock:
                self.record['evaluation'] = evaluate(self.record['runs'], cfg)
                self.record['status'] = 'COMPLETED'
        except Exception as exc:
            with self.lock:
                self.record.update(status='CANCELLED' if isinstance(exc, InterruptedError) else 'FAILED',
                                   error=f'{type(exc).__name__}: {exc}')
                self.record['evaluation'] = {'verdict': 'INCONCLUSIVE', 'reason': self.record['error']}
        finally:
            try:
                self.manager.stop(owner=identifier)
            except Exception as exc:
                with self.lock:
                    self.record.update(status='FAILED', error=f'Cleanup failed: {exc}')
                    self.record['evaluation'] = {'verdict': 'INCONCLUSIVE', 'reason': self.record['error']}
            with self.lock:
                self.record['ended_at'] = utc()
                self.record['progress']['phase'] = self.record['status']
                try:
                    self._save()
                except Exception as exc:
                    self.record.update(status='FAILED', error=f'Evidence storage failed: {type(exc).__name__}')
                    self.record['evaluation'] = {'verdict': 'INCONCLUSIVE', 'reason': self.record['error']}
            with self.manager.lock:
                self.manager.reservation = None
