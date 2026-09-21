import React from 'react';
import { Sparkles, Clock, Info, ShieldAlert, Cpu, Activity, Zap, Users, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AutotunerPanel({ tunerStatus }) {
  const isBottleneck = tunerStatus?.detected_bottleneck && tunerStatus.detected_bottleneck !== 'NONE';
  const evidence = tunerStatus?.evidence || {};
  const recommendation = tunerStatus?.recommendation || {};
  const readingsStreak = tunerStatus?.consecutive_bad_readings ?? 0;
  const isReady = tunerStatus?.state === 'RECOMMENDATION_READY' || Boolean(tunerStatus?.recommended_action);

  // Status badge styling
  const getStateBadgeClass = () => {
    switch (tunerStatus?.state) {
      case 'RECOMMENDATION_READY':
        return 'badge-purple';
      case 'BOTTLENECK_CONFIRMED':
        return 'badge-rose';
      case 'BOTTLENECK_CANDIDATE':
        return 'badge-amber';
      case 'MONITORING':
      default:
        return 'badge-blue';
    }
  };

  return (
    <div className="autotuner-panel">
      <div className="section-title">
        <Sparkles size={18} color="var(--accent-blue)" />
        Autotuner Engine & Bottleneck Analysis
      </div>

      <div className="autotuner-grid">
        {/* Left Column: Bottleneck Detection & Reason */}
        <div>
          <div className="bottleneck-box">
            <div className="bottleneck-title-row">
              <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Bottleneck Detection
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className={`badge ${getStateBadgeClass()}`}>
                  State: {tunerStatus?.state || 'MONITORING'}
                </span>
                <span className={`badge ${isBottleneck ? 'badge-amber' : 'badge-green'}`}>
                  {!tunerStatus?.telemetry_available ? 'TELEMETRY UNAVAILABLE' : isBottleneck ? 'BOTTLENECK DETECTED' : 'NORMAL OPERATION'}
                </span>
              </div>
            </div>

            <div className="bottleneck-name" style={{ color: isBottleneck ? 'var(--accent-amber)' : 'var(--accent-green)', margin: '0.5rem 0' }}>
              {tunerStatus?.detected_bottleneck || 'NONE'}
            </div>

            <div className="bottleneck-reason" style={{ fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '1rem' }}>
              {tunerStatus?.reason || 'Waiting for fresh telemetry.'}
            </div>

            {/* 3-Reading Confirmation Progress (Task 14) */}
            <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                  3-Interval Bottleneck Streak Counter:
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: readingsStreak >= 3 ? 'var(--accent-rose)' : readingsStreak > 0 ? 'var(--accent-amber)' : 'var(--accent-green)' }}>
                  {readingsStreak} / 3 readings {readingsStreak >= 3 ? '(CONFIRMED)' : readingsStreak > 0 ? '(ELEVATED)' : '(NORMAL)'}
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, (readingsStreak / 3) * 100)}%`,
                    background: readingsStreak >= 3 ? 'var(--accent-rose)' : readingsStreak > 0 ? 'var(--accent-amber)' : 'var(--accent-green)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>

            {/* Raw Measured Evidence (Task 27) */}
            {evidence && Object.keys(evidence).length > 0 && (
              <div style={{ marginTop: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Measured Bottleneck Evidence (No Guesswork)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                  {evidence.cpu_percent !== undefined && (
              <div style={{ background: 'var(--bg-secondary)', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>CPU: </span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>{evidence.cpu_percent}%</strong>
                    </div>
                  )}
                  {evidence.context_switches !== undefined && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Ctx Switches: </span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>{Number(evidence.context_switches).toLocaleString()}</strong>
                    </div>
                  )}
                  {evidence.active_workers !== undefined && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Workers: </span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>{evidence.active_workers}</strong>
                    </div>
                  )}
                  {evidence.query_latency_ms !== undefined && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Latency: </span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>{Number(evidence.query_latency_ms).toFixed(1)} ms</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recommended Safe Tuning Action Pill */}
            {(tunerStatus?.recommended_action || recommendation?.parameter) && (
              <div className="recommendation-pill">
                <Info size={20} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                      Recommended Safe Tuning Action
                    </span>
                    <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>
                      STATUS: RECOMMENDED (Not Applied)
                    </span>
                  </div>
                  <div style={{ marginTop: '0.25rem', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {recommendation?.parameter ? (
                      <span>
                        <code>{recommendation.parameter}</code>: {recommendation.old_value} &rarr;{' '}
                        <strong style={{ color: 'var(--accent-blue)' }}>{recommendation.new_value}</strong>
                      </span>
                    ) : (
                      tunerStatus.recommended_action
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Mode & Operational Safety */}
        <div>
          <div className="bottleneck-box" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Operational Mode & Safety Guardrails
              </div>

                    <p>Observation: {tunerStatus?.observation_remaining_seconds || 0}s | Cooldown: {tunerStatus?.cooldown_remaining_seconds || 0}s</p>
              {tunerStatus?.active_action && <p>Last action: {tunerStatus.active_action.outcome || tunerStatus.active_action.state}</p>}
              <p>{tunerStatus?.capabilities?.available ? 'Owned workload connected' : 'Automatic tuning unavailable: start an owned workload'}</p>
              <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Active Mode:</span>
                  <span className="badge badge-blue" style={{ textTransform: 'uppercase' }}>
                    {tunerStatus?.mode || 'Recommendation'}
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Recommendation mode waits for approval. Auto-tuning adjusts only parallelism on owned workload sessions, with verified rollback and one action at a time.
                </p>
              </div>

              <details className="advanced-inline">
                <summary>Advanced status</summary>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '.5rem 0 0' }}>
                  Action audit: <strong>{tunerStatus?.persistence_status || 'NOT_REQUESTED'}</strong> &middot; OS storage: {tunerStatus?.os_persistence_status || '—'} &middot; DB storage: {tunerStatus?.db_persistence_status || '—'}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '.4rem 0 0' }}>
                  Sampling interval 5s &middot; candidate window 15s (3 readings)
                </p>
              </details>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
