import React from 'react';
import { History, Check, X, Clock, AlertTriangle, AlertOctagon } from 'lucide-react';

const formatMetric = (val, fraction = 1) => {
  if (val === null || val === undefined || !Number.isFinite(val)) return '--';
  return Number(val).toFixed(fraction);
};

export default function TuningHistoryTable({ history = [] }) {
  const [bottleneckFilter, setBottleneckFilter] = React.useState('ALL');

  if (!history || history.length === 0) {
    return (
      <div
        className="data-table-container"
        style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}
      >
        <History size={36} style={{ margin: '0 auto 0.75rem', display: 'block', opacity: 0.5 }} />
        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          No tuning actions recorded yet
        </div>
        <p style={{ fontSize: '0.85rem', maxWidth: '480px', margin: '0.5rem auto 0' }}>
          When the autotuner detects bottlenecks and recommends or applies tuning parameters, the actions and evaluation results will appear here.
        </p>
      </div>
    );
  }

  // Quick counts
  const totalCount = history.length;
  const cpuCount = history.filter(
    (h) => h.bottleneck === 'CPU_PARALLELISM' || h.parameter === 'max_parallel_workers_per_gather'
  ).length;
  const memCount = history.filter(
    (h) => h.bottleneck === 'WORK_MEM_SPILL' || h.parameter === 'work_mem'
  ).length;

  const filteredHistory = history.filter((item) => {
    if (bottleneckFilter === 'ALL') return true;
    if (bottleneckFilter === 'CPU_PARALLELISM') {
      return item.bottleneck === 'CPU_PARALLELISM' || item.parameter === 'max_parallel_workers_per_gather' || item.action_type === 'REDUCE_DB_PARALLELISM';
    }
    if (bottleneckFilter === 'WORK_MEM_SPILL') {
      return item.bottleneck === 'WORK_MEM_SPILL' || item.parameter === 'work_mem' || item.action_type === 'INCREASE_WORK_MEM';
    }
    return true;
  });

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'KEPT':
      case 'KEEP':
        return 'badge-green';
      case 'ROLLED_BACK':
      case 'ROLLBACK':
      case 'INCONCLUSIVE':
        return 'badge-amber';
      case 'ROLLBACK_FAILED':
      case 'FAILED':
        return 'badge-rose';
      case 'APPLIED':
      case 'OBSERVING':
        return 'badge-blue';
      case 'RECOMMENDED':
      default:
        return 'badge-purple';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Filter Toolbar (Task 22) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Filter by Scenario:</span>
        <button
          className={`btn ${bottleneckFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
          onClick={() => setBottleneckFilter('ALL')}
        >
          All Actions ({totalCount})
        </button>
        <button
          className={`btn ${bottleneckFilter === 'CPU_PARALLELISM' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
          onClick={() => setBottleneckFilter('CPU_PARALLELISM')}
        >
          CPU / Parallelism ({cpuCount})
        </button>
        <button
          className={`btn ${bottleneckFilter === 'WORK_MEM_SPILL' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
          onClick={() => setBottleneckFilter('WORK_MEM_SPILL')}
        >
          Work Memory / Temp Spill ({memCount})
        </button>
      </div>

      <div className="data-table-container" style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Exp #</th>
            <th>Bottleneck</th>
            <th>Parameter</th>
            <th>Old</th>
            <th>New</th>
            <th>Mode</th>
            <th>Status</th>
            <th>Before Lat.</th>
            <th>After Lat.</th>
            <th>Before TPS</th>
            <th>After TPS</th>
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          {filteredHistory.map((item, idx) => {
            const isKept = ['KEEP', 'KEPT'].includes(item.status);
            const isRolledBack = ['ROLLBACK', 'ROLLED_BACK'].includes(item.status);
            const isFailed = ['FAILED', 'ROLLBACK_FAILED'].includes(item.status);
            const beforeLat = item.before_metrics?.query_latency_ms;
            const afterLat = item.after_metrics?.query_latency_ms;
            const beforeTps = item.before_metrics?.throughput_tps;
            const afterTps = item.after_metrics?.throughput_tps;
            const decision = item.decision || (isKept ? 'KEEP' : isRolledBack ? 'ROLLBACK' : isFailed ? 'FAILED' : '--');

            return (
              <tr key={item.action_id || idx}>
                {/* Time */}
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '--'}
                </td>

                {/* Experiment ID */}
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                  {item.experiment_id ? `#${item.experiment_id}` : '--'}
                </td>

                {/* Bottleneck */}
                <td>
                  <span
                    className="badge badge-amber"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', whiteSpace: 'nowrap' }}
                  >
                    {item.bottleneck}
                  </span>
                </td>

                {/* Parameter */}
                <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#93c5fd' }}>
                  {item.parameter}
                </td>

                {/* Old Value */}
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{String(item.old_value ?? '--')}</td>

                {/* New Value */}
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.8rem', color: '#a78bfa' }}>
                  {String(item.new_value ?? '--')}
                </td>

                {/* Mode */}
                <td style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
                  <span style={{ color: item.mode === 'auto' ? '#a855f7' : '#38bdf8' }}>
                    {item.mode || 'Rec.'}
                  </span>
                </td>

                {/* Status */}
                <td>
                  <span className={`badge ${getStatusBadgeClass(item.status)}`} style={{ fontSize: '0.7rem' }}>
                    {isKept && <Check size={11} />}
                    {isRolledBack && <Clock size={11} />}
                    {isFailed && <AlertOctagon size={11} />}
                    {item.status}
                  </span>
                </td>

                {/* Before Latency */}
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                  {formatMetric(beforeLat)} ms
                </td>

                {/* After Latency */}
                <td
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: afterLat && beforeLat && afterLat < beforeLat ? '#10b981' : 'inherit',
                  }}
                >
                  {formatMetric(afterLat)} ms
                </td>

                {/* Before TPS */}
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                  {formatMetric(beforeTps)}
                </td>

                {/* After TPS */}
                <td
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: afterTps && beforeTps && afterTps > beforeTps ? '#10b981' : 'inherit',
                  }}
                >
                  {formatMetric(afterTps)}
                </td>

                {/* Decision */}
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.75rem' }}>
                  <span style={{ color: isKept ? '#10b981' : isRolledBack ? '#f59e0b' : isFailed ? '#f43f5e' : 'var(--text-muted)' }}>
                    {decision}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}
