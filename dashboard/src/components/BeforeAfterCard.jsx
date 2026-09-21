import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Clock,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Award,
  Zap,
  Activity,
  Cpu,
  Gauge,
  HardDrive,
} from 'lucide-react';
import { comparison } from '../actionState.mjs';

const formatValue = (value, fraction = 1) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Unavailable';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: fraction });
};

const formatBytesToMB = (bytes) => {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return 'Unavailable';
  return (Number(bytes) / (1024 * 1024)).toFixed(1) + ' MB';
};

export default function BeforeAfterCard({ action }) {
  if (!action || (!action.before && !action.action)) {
    return (
      <div className="comparison-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
        <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
          No completed tuning evaluation yet.
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto' }}>
          Start an owned workload, then approve a recommendation or enable Auto-Tuning. The autotuner will measure a
          baseline, apply the safe parameter change, observe for 30 seconds, and render verified before-vs-after telemetry here.
        </p>
      </div>
    );
  }

  const before = action.before || {};
  const after = action.after;
  const isObserving = !after && ['ACTION_APPLIED', 'OBSERVING'].includes(action.state);
  const outcome = action.outcome || (
    action.state === 'KEEP' ? 'KEEP' :
    action.state === 'ROLLBACK' ? 'ROLLBACK' :
    action.state === 'INCONCLUSIVE' ? 'INCONCLUSIVE' :
    action.state === 'ROLLBACK_FAILED' ? 'ROLLBACK_FAILED' : null
  );
  const isKeep = outcome === 'KEEP';
  const isRollback = outcome === 'ROLLBACK';
  const isInconclusive = outcome === 'INCONCLUSIVE';
  const isRollbackFailed = outcome === 'ROLLBACK_FAILED';
  const actionDetails = action.action || {};

  const isWorkMem = actionDetails?.parameter === 'work_mem' ||
    actionDetails?.action_type?.includes('WORK_MEM') ||
    action.bottleneck === 'WORK_MEM_SPILL';
  const bottleneckName = action.bottleneck || (isWorkMem ? 'WORK_MEM_SPILL' : 'CPU_PARALLELISM');

  // Compute percentage changes
  const calcDelta = (beforeVal, afterVal) => {
    if (!Number.isFinite(beforeVal) || !Number.isFinite(afterVal)) return null;
    if (beforeVal === 0 && afterVal === 0) return 0;
    if (beforeVal <= 0) return null;
    return ((afterVal - beforeVal) / beforeVal) * 100;
  };

  const latencyDelta = after ? calcDelta(before.query_latency_ms, after.query_latency_ms) : null;
  const tpsDelta = after ? calcDelta(before.throughput_tps, after.throughput_tps) : null;
  const cpuDelta = after ? calcDelta(before.cpu_percent, after.cpu_percent) : null;
  const memoryDelta = after ? calcDelta(before.memory_percent, after.memory_percent) : null;
  const tempSpillDelta = after ? calcDelta(
    before.temp_files_bytes ?? before.temp_bytes ?? 0,
    after.temp_files_bytes ?? after.temp_bytes ?? 0
  ) : null;
  const ctxDelta = after ? calcDelta(before.context_switches, after.context_switches) : null;

  return (
    <div className="comparison-card-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Task 16: Rollback Failed Critical Alert */}
      {isRollbackFailed && (
        <div
          className="alert-banner alert-danger"
          style={{
            background: 'rgba(244, 63, 94, 0.2)',
            border: '2px solid var(--accent-rose)',
            padding: '1rem',
            borderRadius: '8px',
          }}
        >
          <AlertOctagon size={24} color="var(--accent-rose)" style={{ flexShrink: 0 }} />
          <div>
            <h4 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>
              CRITICAL: Rollback Failed — Manual Attention Required
            </h4>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#fecdd3' }}>
              {action.reason || 'The database configuration could not be automatically restored. Check database logs.'}
            </p>
          </div>
        </div>
      )}

      {/* Decision Outcome Banner */}
      {outcome && (
        <div
          style={{
            background: isKeep
              ? 'rgba(16, 185, 129, 0.15)'
              : isInconclusive
              ? 'rgba(148, 163, 184, 0.15)'
              : isRollback
              ? 'rgba(245, 158, 11, 0.15)'
              : 'rgba(244, 63, 94, 0.15)',
            border: `1px solid ${
              isKeep
                ? 'rgba(16, 185, 129, 0.5)'
                : isInconclusive
                ? 'rgba(148, 163, 184, 0.5)'
                : isRollback
                ? 'rgba(245, 158, 11, 0.5)'
                : 'rgba(244, 63, 94, 0.5)'
            }`,
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}
        >
          {isKeep ? (
            <CheckCircle2 size={24} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
          ) : isInconclusive ? (
            <Clock size={24} color="#94a3b8" style={{ flexShrink: 0, marginTop: 2 }} />
          ) : isRollback ? (
            <RotateCcw size={24} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
          ) : (
            <AlertOctagon size={24} color="#f43f5e" style={{ flexShrink: 0, marginTop: 2 }} />
          )}
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: isKeep ? '#10b981' : isInconclusive ? '#cbd5e1' : isRollback ? '#f59e0b' : '#f43f5e',
                }}
              >
                DECISION: {outcome}
              </span>
              <span
                className={`badge ${
                  isKeep
                    ? 'badge-green'
                    : isInconclusive
                    ? 'badge-purple'
                    : isRollback
                    ? 'badge-amber'
                    : 'badge-rose'
                }`}
                style={{ fontSize: '0.75rem' }}
              >
                {isKeep
                  ? 'OPTIMIZATION KEPT'
                  : isInconclusive
                  ? 'INCONCLUSIVE (REVERTED)'
                  : isRollback
                  ? 'SETTING ROLLED BACK'
                  : 'RECOVERY REQUIRED'}
              </span>
            </div>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: '1.5' }}>
              {action.reason || (
                isInconclusive
                  ? 'No significant improvement observed (<5% latency delta); rolled back to safe baseline.'
                  : isRollback && isWorkMem
                  ? 'Action rolled back to protect system memory safety.'
                  : 'Observation evaluation completed.'
              )}
            </p>
            {(isRollback || isInconclusive) && action.verified_restored_value !== undefined && (
              <div
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.85rem',
                  color: '#fde68a',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Parameter Restored: <code>{actionDetails.parameter}</code> &rarr;{' '}
                <strong>{action.verified_restored_value}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Observation In-Progress Notice */}
      {isObserving && (
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.12)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.85rem',
            color: '#93c5fd',
          }}
        >
          <Clock size={18} className="spin" />
          <span>
            <strong>30-Second Observation in progress:</strong> Action{' '}
            <code>{actionDetails.parameter} ({actionDetails.old_value} &rarr; {actionDetails.new_value})</code> has been
            applied. Accumulating clean intervals for post-tuning comparison.
          </span>
        </div>
      )}

      {/* Task 12 & 13: Before vs After Comparison Table */}
      <div className="comparison-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
            Telemetry Evaluation (Before vs After)
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Action ID: <code>{actionDetails.action_id || 'Unknown'}</code>
          </span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Before Tuning</th>
                <th>After Tuning</th>
                <th>Change (%)</th>
                <th>Target Behavior</th>
              </tr>
            </thead>
            <tbody>
              {/* Latency */}
              <tr>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Zap size={14} color="var(--accent-rose)" />
                    Query Latency
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatValue(before.query_latency_ms)} ms
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: after ? 600 : 400 }}>
                  {after ? `${formatValue(after.query_latency_ms)} ms` : 'Observing...'}
                </td>
                <td>
                  {latencyDelta !== null ? (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: latencyDelta <= -5 ? '#10b981' : latencyDelta > 5 ? '#f43f5e' : 'var(--text-secondary)',
                      }}
                    >
                      {latencyDelta > 0 ? `+${latencyDelta.toFixed(1)}%` : `${latencyDelta.toFixed(1)}%`}
                    </span>
                  ) : (
                    '--'
                  )}
                </td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Decrease (&le; -5%)
                </td>
              </tr>

              {/* Throughput */}
              <tr>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Activity size={14} color="var(--accent-cyan)" />
                    Throughput (TPS)
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatValue(before.throughput_tps)} TPS
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: after ? 600 : 400 }}>
                  {after ? `${formatValue(after.throughput_tps)} TPS` : 'Observing...'}
                </td>
                <td>
                  {tpsDelta !== null ? (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: tpsDelta >= 5 ? '#10b981' : tpsDelta < -5 ? '#f43f5e' : 'var(--text-secondary)',
                      }}
                    >
                      {tpsDelta > 0 ? `+${tpsDelta.toFixed(1)}%` : `${tpsDelta.toFixed(1)}%`}
                    </span>
                  ) : (
                    '--'
                  )}
                </td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Maintain or Increase
                </td>
              </tr>

              {/* Temp File Spill */}
              <tr style={isWorkMem ? { background: 'rgba(236, 72, 153, 0.08)' } : undefined}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <HardDrive size={14} color="#ec4899" />
                    <strong>Temp File Spill</strong> {isWorkMem && <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>KEY METRIC</span>}
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatBytesToMB(before.temp_files_bytes ?? before.temp_bytes ?? 0)}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: after ? 600 : 400 }}>
                  {after ? formatBytesToMB(after.temp_files_bytes ?? after.temp_bytes ?? 0) : 'Observing...'}
                </td>
                <td>
                  {tempSpillDelta !== null ? (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: tempSpillDelta <= -50 ? '#10b981' : tempSpillDelta > 0 ? '#f43f5e' : 'var(--text-secondary)',
                      }}
                    >
                      {tempSpillDelta > 0 ? `+${tempSpillDelta.toFixed(1)}%` : `${tempSpillDelta.toFixed(1)}%`}
                    </span>
                  ) : (
                    '--'
                  )}
                </td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Eliminate (Drop to 0 MB)
                </td>
              </tr>

              {/* CPU Utilization */}
              <tr style={!isWorkMem ? { background: 'rgba(59, 130, 246, 0.08)' } : undefined}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Cpu size={14} color="var(--accent-blue)" />
                    CPU Utilization {!isWorkMem && <span className="badge badge-blue" style={{ fontSize: '0.65rem' }}>KEY METRIC</span>}
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatValue(before.cpu_percent)}%
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: after ? 600 : 400 }}>
                  {after ? `${formatValue(after.cpu_percent)}%` : 'Observing...'}
                </td>
                <td>
                  {cpuDelta !== null ? (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: cpuDelta <= 0 ? '#10b981' : '#f59e0b',
                      }}
                    >
                      {cpuDelta > 0 ? `+${cpuDelta.toFixed(1)}%` : `${cpuDelta.toFixed(1)}%`}
                    </span>
                  ) : (
                    '--'
                  )}
                </td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Decrease or Stabilize
                </td>
              </tr>

              {/* Context Switches */}
              <tr>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Activity size={14} color="#f59e0b" />
                    Context Switches
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatValue(before.context_switches, 0)}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: after ? 600 : 400 }}>
                  {after ? formatValue(after.context_switches, 0) : 'Observing...'}
                </td>
                <td>
                  {ctxDelta !== null ? (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: ctxDelta <= 0 ? '#10b981' : '#f59e0b',
                      }}
                    >
                      {ctxDelta > 0 ? `+${ctxDelta.toFixed(1)}%` : `${ctxDelta.toFixed(1)}%`}
                    </span>
                  ) : (
                    '--'
                  )}
                </td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Reduce core contention
                </td>
              </tr>

              {/* RAM Usage */}
              <tr style={isWorkMem ? { background: 'rgba(168, 85, 247, 0.08)' } : undefined}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Gauge size={14} color="#a855f7" />
                    Memory Usage {isWorkMem && <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>SAFETY CHECK</span>}
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatValue(before.memory_percent)}%
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {after ? `${formatValue(after.memory_percent)}%` : 'Observing...'}
                </td>
                <td>
                  {memoryDelta !== null ? (
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {memoryDelta > 0 ? `+${memoryDelta.toFixed(1)}%` : `${memoryDelta.toFixed(1)}%`}
                    </span>
                  ) : (
                    '--'
                  )}
                </td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Safe (&lt;80%)
                </td>
              </tr>

              {/* Disk Read */}
              <tr>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <HardDrive size={14} color="#64748b" />
                    Disk Read
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatBytesToMB(before.disk_read_bytes)}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {after ? formatBytesToMB(after.disk_read_bytes) : 'Observing...'}
                </td>
                <td>--</td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Baseline</td>
              </tr>

              {/* Disk Write */}
              <tr>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <HardDrive size={14} color="#64748b" />
                    Disk Write
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatBytesToMB(before.disk_write_bytes)}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {after ? formatBytesToMB(after.disk_write_bytes) : 'Observing...'}
                </td>
                <td>--</td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Baseline</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Task 33: Evaluation Summary Card (Dynamic for Active Scenario) */}
      {after && outcome && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Award size={18} color="#eab308" />
            <span style={{ fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              OptiDBX Tuning Result Summary
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '0.75rem',
              fontSize: '0.85rem',
              marginTop: '0.5rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Bottleneck:</span>
              <div style={{ fontWeight: 600, color: '#f59e0b' }}>{bottleneckName}</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Tuned Parameter:</span>
              <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                {actionDetails.parameter}: {actionDetails.old_value} &rarr; {actionDetails.new_value}
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Latency (ms):</span>
              <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                {formatValue(before.query_latency_ms)} &rarr; {formatValue(after.query_latency_ms)}
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Throughput (TPS):</span>
              <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                {formatValue(before.throughput_tps)} &rarr; {formatValue(after.throughput_tps)}
              </div>
            </div>
            {isWorkMem ? (
              <>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Temp Spill:</span>
                  <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: '#ec4899' }}>
                    {formatBytesToMB(before.temp_files_bytes ?? before.temp_bytes ?? 0)} &rarr; {formatBytesToMB(after.temp_files_bytes ?? after.temp_bytes ?? 0)}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Memory (%):</span>
                  <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    {formatValue(before.memory_percent)}% &rarr; {formatValue(after.memory_percent)}%
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>CPU (%):</span>
                  <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    {formatValue(before.cpu_percent)}% &rarr; {formatValue(after.cpu_percent)}%
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Ctx Switches:</span>
                  <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    {formatValue(before.context_switches, 0)} &rarr; {formatValue(after.context_switches, 0)}
                  </div>
                </div>
              </>
            )}
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Final Verdict:</span>
              <div
                style={{
                  fontWeight: 700,
                  color: isKeep ? '#10b981' : isInconclusive ? '#94a3b8' : '#f59e0b',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {outcome}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
