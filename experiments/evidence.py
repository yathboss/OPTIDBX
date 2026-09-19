"""Frozen criteria, paired comparisons and atomic local evidence artifacts."""
import json
import os
import random
import re
from pathlib import Path
from statistics import mean

from workload.measurements import percentile

CRITERIA = {'minimum_pairs': 5, 'minimum_measurement_seconds': 180,
            'minimum_warmup_seconds': 30, 'minimum_successful_queries': 30,
            'throughput_improvement_percent': 10, 'maximum_p95_degradation_percent': 5,
            'throughput_regression_percent': 5, 'bootstrap_resamples': 5000}


def interval(values):
    rng = random.Random(2026)
    estimates = [mean(rng.choices(values, k=len(values))) for _ in range(CRITERIA['bootstrap_resamples'])]
    return {'mean_percent': mean(values),
            'interval_95': [percentile(estimates, .025), percentile(estimates, .975)]}


def evaluate(runs, config):
    result = {'verdict': 'NOT_EVALUATED', 'reason': 'No completed comparison yet.',
              'completed_pairs': 0, 'throughput_change': None, 'p95_change': None,
              'method': 'Paired percentile bootstrap, 5000 resamples, 95% interval; exploratory for small samples.'}
    if not runs:
        return result
    result.update(verdict='INCONCLUSIVE', reason='More complete, valid paired runs are required.')
    paired = {}
    for row in runs:
        if row.get('status') != 'COMPLETED':
            return result
        if row['mode'] in paired.setdefault(row['pair'], {}):
            return result
        paired[row['pair']][row['mode']] = row
    pairs = [pair for pair in paired.values() if set(pair) == {'baseline', 'adaptive'}]
    result['completed_pairs'] = len(pairs)
    if len(pairs) != config.get('repetitions', 5):
        return result
    throughput, latency = [], []
    for pair in pairs:
        before, after = (pair[mode]['metrics'] for mode in ('baseline', 'adaptive'))
        if any(not m.get('throughput_qps') or not m.get('p95_latency_ms') or m.get('overflow')
               or m.get('successful_queries', 0) < CRITERIA['minimum_successful_queries']
               for m in (before, after)):
            result['reason'] = 'Missing, insufficient or overflowed workload measurements.'
            return result
        throughput.append((after['throughput_qps'] / before['throughput_qps'] - 1) * 100)
        latency.append((after['p95_latency_ms'] / before['p95_latency_ms'] - 1) * 100)
    result['throughput_change'], result['p95_change'] = interval(throughput), interval(latency)
    if (len(pairs) < CRITERIA['minimum_pairs']
            or config.get('warmup_seconds', 0) < CRITERIA['minimum_warmup_seconds']
            or any(row['metrics']['elapsed_seconds'] < CRITERIA['minimum_measurement_seconds'] for row in runs)):
        result['reason'] = 'Pilot only: at least 5 pairs, 30s warm-up and 180s measurement per run are required.'
        return result
    higher_errors = any(pair['adaptive']['metrics'].get('error_rate', 0) >
                        pair['baseline']['metrics'].get('error_rate', 0) for pair in pairs)
    if (result['throughput_change']['interval_95'][1] < -CRITERIA['throughput_regression_percent']
            or result['p95_change']['interval_95'][0] > CRITERIA['maximum_p95_degradation_percent'] or higher_errors):
        result.update(verdict='REGRESSION_OBSERVED', reason='Throughput, tail latency or error rate regressed under the frozen criteria.')
    elif (result['throughput_change']['interval_95'][0] >= CRITERIA['throughput_improvement_percent']
          and result['p95_change']['interval_95'][1] <= CRITERIA['maximum_p95_degradation_percent']
          and any(action.get('verified_applied_value') is not None for pair in pairs
                  for action in pair['adaptive'].get('actions', []))):
        result.update(verdict='IMPROVEMENT_SUPPORTED', reason='Repeated measured improvement met the frozen criteria for this workload and host.')
    else:
        result['reason'] = 'Intervals do not establish the required benefit, or no automatic change was applied.'
    return result


class EvidenceStore:
    def __init__(self, directory='.optidbx/benchmarks'):
        self.directory = Path(directory)

    def _path(self, identifier):
        if not re.fullmatch(r'[a-zA-Z0-9-]{1,64}', identifier):
            raise ValueError('Invalid benchmark identifier')
        return self.directory / f'{identifier}.json'

    def save(self, record):
        path = self._path(record['id'])
        self.directory.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix('.tmp')
        with temp.open('w', encoding='utf-8') as handle:
            json.dump(record, handle, allow_nan=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)

    def get(self, identifier):
        return json.loads(self._path(identifier).read_text(encoding='utf-8'))

    def list(self):
        results = []
        for path in sorted(self.directory.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)[:100]:
            results.append(self.get(path.stem))
        return results
