import React, { useState, useEffect } from 'react';
import { GitCompare, AlertTriangle, CheckCircle2, Clock, Zap, Activity, HardDrive, Cpu, Gauge, Award, ArrowRight } from 'lucide-react';
import { api } from '../services/api';

const formatVal = (val, fraction = 1) => {
  if (val === null || val === undefined || !Number.isFinite(Number(val))) return '--';
  return Number(val).toFixed(fraction);
};

const formatMB = (bytes) => {
  if (bytes === null || bytes === undefined || !Number.isFinite(Number(bytes))) return '--';
  return (Number(bytes) / (1024 * 1024)).toFixed(1) + ' MB';
};

export default function ExperimentComparison({ experiments = [] }) {
  const [runAId, setRunAId] = useState(null);
  const [runBId, setRunBId] = useState(null);
  const [runADetail, setRunADetail] = useState(null);
  const [runBDetail, setRunBDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  // Auto-select initial runs if available
  useEffect(() => {
    if (experiments.length >= 2 && runAId === null && runBId === null) {
      setRunAId(experiments[experiments.length - 2].id);
      setRunBId(experiments[experiments.length - 1].id);
    } else if (experiments.length === 1 && runAId === null) {
      setRunAId(experiments[0].id);
    }
  }, [experiments, runAId, runBId]);

  // Fetch full details when selections change
  useEffect(() => {
    let cancelled = false;
    async function loadDetails() {
      if (!runAId && !runBId) return;
      setLoading(true);
      try {
        const [resA, resB] = await Promise.all([
          runAId ? api.getExperimentDetail(runAId) : Promise.resolve({ data: null }),
          runBId ? api.getExperimentDetail(runBId) : Promise.resolve({ data: null }),
        ]);
        if (!cancelled) {
          setRunADetail(resA.data || experiments.find((e) => e.id === runAId) || null);
          setRunBDetail(resB.data || experiments.find((e) => e.id === runBId) || null);
        }
      } catch (err) {
        console.warn('Failed to fetch experiment details for comparison:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadDetails();
    return () => {
      cancelled = true;
    };
  }, [runAId, runBId, experiments]);

  const runA = runADetail || experiments.find((e) => e.id === runAId);
  const runB = runBDetail || experiments.find((e) => e.id === runBId);

  // Preset Handlers (Task 26)
  const handlePresetCurrentVsPrevious = () => {
    if (experiments.length >= 2) {
      setRunAId(experiments[experiments.length - 2].id);
      setRunBId(experiments[experiments.length - 1].id);
    }
  };

  const handlePresetScenario1 = () => {
    const highRuns = experiments.filter((e) => e.workload_type?.toUpperCase() === 'HIGH');
    if (highRuns.length >= 2) {
      setRunAId(highRuns[0].id);
      setRunBId(highRuns[highRuns.length - 1].id);
    } else if (experiments.length >= 2) {
      handlePresetCurrentVsPrevious();
    }
  };

  const handlePresetScenario2 = () => {
    const analyticalRuns = experiments.filter(
      (e) => e.workload_type?.toUpperCase() === 'ANALYTICAL' || e.workload_type?.toUpperCase() === 'TEMP_SPILL'
    );
    if (analyticalRuns.length >= 2) {
      setRunAId(analyticalRuns[0].id);
      setRunBId(analyticalRuns[analyticalRuns.length - 1].id);
    } else if (experiments.length >= 2) {
      handlePresetCurrentVsPrevious();
    }
  };

  // Check workload profile compatibility (Task 25)
  const isProfileDifferent =
    runA && runB && runA.workload_type && runB.workload_type &&
    runA.workload_type.toUpperCase() !== runB.workload_type.toUpperCase();

  // Metrics extraction helpers
  const getMetrics = (exp) => {
    if (!exp) return {};
    const agg = exp.aggregate_metrics || {};
    const before = exp.before_metrics || {};
    const after = exp.after_metrics || {};
    const action = exp.actions?.[0] || exp.action || {};
    return {
      latency: after.query_latency_ms ?? agg.query_latency_ms ?? before.query_latency_ms,
      tps: after.throughput_tps ?? agg.throughput_tps ?? before.throughput_tps,
      cpu: after.cpu_percent ?? agg.cpu_percent ?? before.cpu_percent,
      memory: after.memory_percent ?? agg.memory_percent ?? before.memory_percent,
      tempSpill: after.temp_files_bytes ?? agg.temp_files_bytes ?? before.temp_files_bytes ?? after.temp_bytes ?? before.temp_bytes ?? 0,
      bottleneck: exp.bottleneck || action.bottleneck || (exp.workload_type === 'ANALYTICAL' ? 'WORK_MEM_SPILL' : 'CPU_PARALLELISM'),
      parameter: action.parameter || action.action?.parameter || '--',
      oldValue: action.old_value || action.action?.old_value,
      newValue: action.new_value || action.action?.new_value,
      verdict: exp.overall_result || action.outcome || 'BASELINE',
    };
  };

  const metricsA = getMetrics(runA);
  const metricsB = getMetrics(runB);

  // Compute percentage improvement from A to B
  const calcImprovement = (valA, valB, lowerIsBetter = true) => {
    if (!Number.isFinite(valA) || !Number.isFinite(valB)) return null;
    if (valA === 0 && valB === 0) return 0;
    if (valA <= 0) return null;
    const pct = ((valB - valA) / valA) * 100;
    return lowerIsBetter ? -pct : pct; // positive means improvement
  };

  const latencyImp = calcImprovement(metricsA.latency, metricsB.latency, true);
  const tpsImp = calcImprovement(metricsA.tps, metricsB.tps, false);
  const tempSpillImp = calcImprovement(metricsA.tempSpill, metricsB.tempSpill, true);
  const cpuImp = calcImprovement(metricsA.cpu, metricsB.cpu, true);

  return (
    <div className="experiment-comparison-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <GitCompare size={20} color="var(--accent-purple, #8b5cf6)" />
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
            Multi-Experiment Comparison (Research Evaluation)
          </h3>
        </div>

        {/* 1-Click Preset Comparisons (Task 26) */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={handlePresetScenario1} disabled={experiments.length < 2}>
            Preset: CPU Scenario (High vs Tuned)
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handlePresetScenario2} disabled={experiments.length < 2}>
            Preset: Spill Scenario (Analytical vs Tuned)
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handlePresetCurrentVsPrevious} disabled={experiments.length < 2}>
            Preset: Latest vs Prior Run
          </button>
        </div>
      </div>

      {/* Selectors for Run A and Run B */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem', background: 'var(--bg-secondary)', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
            Baseline / Control Run (Experiment A):
          </label>
          <select
            aria-label="Experiment A"
            value={runAId || ''}
            onChange={(e) => setRunAId(Number(e.target.value))}
            style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '4px', background: 'var(--bg-primary)', color: '#fff', border: '1px solid var(--border-color)' }}
          >
            <option value="">-- Select Experiment A --</option>
            {experiments.map((exp) => (
              <option key={exp.id} value={exp.id}>
                #{exp.id} - {exp.name || exp.workload_type} ({exp.status})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
            Comparison / OptiDBX-Tuned Run (Experiment B):
          </label>
          <select
            aria-label="Experiment B"
            value={runBId || ''}
            onChange={(e) => setRunBId(Number(e.target.value))}
            style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '4px', background: 'var(--bg-primary)', color: '#fff', border: '1px solid var(--border-color)' }}
          >
            <option value="">-- Select Experiment B --</option>
            {experiments.map((exp) => (
              <option key={exp.id} value={exp.id}>
                #{exp.id} - {exp.name || exp.workload_type} ({exp.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Task 25: Incompatible Workload Warning */}
      {isProfileDifferent && (
        <div
          className="alert-banner alert-warning"
          style={{
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            color: '#fde68a',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.85rem',
          }}
        >
          <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
          <span>
            <strong>Incompatible Workload Warning:</strong> Workload profiles differ (<code>{runA.workload_type}</code> vs <code>{runB.workload_type}</code>). Direct metric comparison may not be valid for statistical evaluation.
          </span>
        </div>
      )}

      {/* Task 24: Comparison Metrics Table */}
      {runA && runB ? (
        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Evaluation Dimension</th>
                <th>Baseline (Run #{runA.id}: {runA.workload_type})</th>
                <th>OptiDBX (Run #{runB.id}: {runB.workload_type})</th>
                <th>Delta / Improvement</th>
                <th>Evaluation Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                    <Zap size={14} color="var(--accent-rose)" />
                    Query Latency
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{formatVal(metricsA.latency)} ms</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatVal(metricsB.latency)} ms</td>
                <td>
                  {latencyImp !== null ? (
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: latencyImp >= 5 ? '#10b981' : latencyImp < -5 ? '#ef4444' : 'var(--text-secondary)' }}>
                      {latencyImp >= 0 ? `+${latencyImp.toFixed(1)}% better` : `${latencyImp.toFixed(1)}% regressed`}
                    </span>
                  ) : (
                    '--'
                  )}
                </td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lower latency preferred</td>
              </tr>

              <tr>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                    <Activity size={14} color="var(--accent-cyan)" />
                    Throughput (TPS)
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{formatVal(metricsA.tps)} TPS</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatVal(metricsB.tps)} TPS</td>
                <td>
                  {tpsImp !== null ? (
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: tpsImp >= 5 ? '#10b981' : tpsImp < -5 ? '#ef4444' : 'var(--text-secondary)' }}>
                      {tpsImp >= 0 ? `+${tpsImp.toFixed(1)}% higher` : `${tpsImp.toFixed(1)}% lower`}
                    </span>
                  ) : (
                    '--'
                  )}
                </td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Higher throughput preferred</td>
              </tr>

              <tr>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                    <HardDrive size={14} color="#ec4899" />
                    Temp File Spill
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{formatMB(metricsA.tempSpill)}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatMB(metricsB.tempSpill)}</td>
                <td>
                  {tempSpillImp !== null ? (
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: tempSpillImp > 0 ? '#10b981' : tempSpillImp < 0 ? '#ef4444' : 'var(--text-secondary)' }}>
                      {tempSpillImp > 0 ? `+${tempSpillImp.toFixed(1)}% reduction` : '0 MB delta'}
                    </span>
                  ) : (
                    '--'
                  )}
                </td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>work_mem spill elimination</td>
              </tr>

              <tr>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                    <Cpu size={14} color="var(--accent-blue)" />
                    CPU Utilization
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{formatVal(metricsA.cpu)}%</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatVal(metricsB.cpu)}%</td>
                <td>
                  {cpuImp !== null ? (
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: cpuImp >= 0 ? '#10b981' : '#f59e0b' }}>
                      {cpuImp >= 0 ? `+${cpuImp.toFixed(1)}% headroom` : `${Math.abs(cpuImp).toFixed(1)}% increase`}
                    </span>
                  ) : (
                    '--'
                  )}
                </td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OS Core Contention check</td>
              </tr>

              <tr>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                    <Gauge size={14} color="#a855f7" />
                    Memory Usage
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{formatVal(metricsA.memory)}%</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatVal(metricsB.memory)}%</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                  {metricsA.memory && metricsB.memory ? `${(metricsB.memory - metricsA.memory).toFixed(1)}% delta` : '--'}
                </td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Safety threshold: &lt;80%</td>
              </tr>

              <tr>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                    <Award size={14} color="#eab308" />
                    Decision Verdict
                  </div>
                </td>
                <td>
                  <span className="badge badge-secondary">{metricsA.verdict}</span>
                </td>
                <td>
                  <span className={`badge ${metricsB.verdict === 'KEEP' || metricsB.verdict === 'IMPROVED' ? 'badge-green' : metricsB.verdict === 'INCONCLUSIVE' ? 'badge-purple' : 'badge-amber'}`}>
                    {metricsB.verdict}
                  </span>
                </td>
                <td colSpan={2} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {metricsB.verdict === 'KEEP' || metricsB.verdict === 'IMPROVED'
                    ? 'Verified optimization maintained system stability.'
                    : metricsB.verdict === 'INCONCLUSIVE'
                    ? 'Result was inconclusive; safely restored to baseline configuration.'
                    : 'System reverted to baseline to protect performance or memory.'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Select two completed experiment runs above or click one of the quick presets to view the side-by-side comparison table.
        </div>
      )}
    </div>
  );
}
