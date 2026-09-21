import React from 'react';
import {
  Sparkles,
  Clock,
  Info,
  ShieldAlert,
  Cpu,
  Activity,
  Zap,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Sliders,
  Layers,
  Terminal,
} from 'lucide-react';

export default function AutotunerPanel({ tunerStatus }) {
  const isBottleneck = tunerStatus?.detected_bottleneck && tunerStatus.detected_bottleneck !== 'NONE';
  const evidence = tunerStatus?.evidence || {};
  const recommendation = tunerStatus?.recommendation || {};
  const readingsStreak = tunerStatus?.consecutive_bad_readings ?? 0;
  const state = tunerStatus?.state || 'MONITORING';
  const mode = tunerStatus?.mode || 'recommendation';
  const activeAction = tunerStatus?.active_action || null;
  const actionData = activeAction?.action || recommendation;

  const observationSeconds = tunerStatus?.observation_remaining_seconds ?? 0;
  const cooldownSeconds = tunerStatus?.cooldown_remaining_seconds ?? 0;
  const inActionLifecycle = ['ACTION_APPLIED', 'OBSERVING', 'COOLDOWN'].includes(state);

  // Status badge styling
  const getStateBadge = () => {
    switch (state) {
      case 'RECOMMENDATION_READY':
        return { label: 'RECOMMENDATION READY', cls: 'badge-purple' };
      case 'BOTTLENECK_CONFIRMED':
        return { label: 'BOTTLENECK CONFIRMED', cls: 'badge-rose' };
      case 'BOTTLENECK_CANDIDATE':
        return { label: `BOTTLENECK CANDIDATE (${readingsStreak}/3)`, cls: 'badge-amber' };
      case 'ACTION_APPLIED':
        return { label: 'ACTION APPLIED', cls: 'badge-blue' };
      case 'OBSERVING':
        return { label: `OBSERVING (${observationSeconds}s)`, cls: 'badge-blue' };
      case 'KEEP':
        return { label: 'DECISION: KEEP', cls: 'badge-green' };
      case 'ROLLBACK':
        return { label: 'DECISION: ROLLBACK', cls: 'badge-amber' };
      case 'ROLLBACK_FAILED':
        return { label: 'ROLLBACK FAILED', cls: 'badge-rose' };
      case 'COOLDOWN':
        return { label: `COOLDOWN (${cooldownSeconds}s)`, cls: 'badge-blue' };
      case 'MONITORING':
      default:
        return { label: 'MONITORING', cls: 'badge-blue' };
    }
  };

  const badge = getStateBadge();

  // Timeline Step calculation (Task 23)
  const getTimelineSteps = () => {
    return [
      {
        id: 'detect',
        title: 'Bottleneck Detection',
        active: state === 'BOTTLENECK_CANDIDATE' || state === 'BOTTLENECK_CONFIRMED',
        completed: [
          'RECOMMENDATION_READY',
          'ACTION_APPLIED',
          'OBSERVING',
          'KEEP',
          'ROLLBACK',
          'COOLDOWN',
        ].includes(state),
      },
      {
        id: 'recommend',
        title: 'Recommendation',
        active: state === 'RECOMMENDATION_READY',
        completed: ['ACTION_APPLIED', 'OBSERVING', 'KEEP', 'ROLLBACK', 'COOLDOWN'].includes(state),
      },
      {
        id: 'apply',
        title: mode === 'auto' ? 'Automatic Apply' : 'Manual Apply',
        active: state === 'ACTION_APPLIED',
        completed: ['OBSERVING', 'KEEP', 'ROLLBACK', 'COOLDOWN'].includes(state),
      },
      {
        id: 'observe',
        title: `30s Observation ${state === 'OBSERVING' ? `(${observationSeconds}s)` : ''}`,
        active: state === 'OBSERVING',
        completed: ['KEEP', 'ROLLBACK', 'COOLDOWN'].includes(state),
      },
      {
        id: 'decision',
        title: 'Evaluation (KEEP / ROLLBACK)',
        active: state === 'KEEP' || state === 'ROLLBACK' || state === 'ROLLBACK_FAILED',
        completed: state === 'COOLDOWN',
      },
      {
        id: 'cooldown',
        title: `30s Cooldown ${state === 'COOLDOWN' ? `(${cooldownSeconds}s)` : ''}`,
        active: state === 'COOLDOWN',
        completed: false,
      },
    ];
  };

  const timelineSteps = getTimelineSteps();

  return (
    <div className="autotuner-panel">
      <div className="section-title">
        <Sparkles size={18} color="#8b5cf6" />
        Autotuner Closed-Loop Engine & Action Lifecycle
      </div>

      {/* Task 23: Closed-Loop Lifecycle Timeline */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            marginBottom: '0.5rem',
            fontWeight: 600,
          }}
        >
          Tuning Cycle Stage (Closed-Loop Progression)
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.25rem',
            overflowX: 'auto',
          }}
        >
          {timelineSteps.map((step, idx) => (
            <React.Fragment key={step.id}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: '120px',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '6px',
                  background: step.active
                    ? 'rgba(139, 92, 246, 0.2)'
                    : step.completed
                    ? 'rgba(16, 185, 129, 0.1)'
                    : 'var(--bg-primary)',
                  border: `1px solid ${
                    step.active
                      ? 'var(--accent-purple)'
                      : step.completed
                      ? 'rgba(16, 185, 129, 0.4)'
                      : 'var(--border-color)'
                  }`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}>
                  {step.completed ? (
                    <CheckCircle2 size={12} color="#10b981" />
                  ) : step.active ? (
                    <span className="pulse-indicator" style={{ backgroundColor: '#a855f7' }} />
                  ) : (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6b7280' }} />
                  )}
                  <span
                    style={{
                      fontWeight: step.active ? 700 : step.completed ? 600 : 400,
                      color: step.active ? '#fff' : step.completed ? '#10b981' : 'var(--text-muted)',
                    }}
                  >
                    {step.title}
                  </span>
                </div>
              </div>
              {idx < timelineSteps.length - 1 && (
                <ArrowRight size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="autotuner-grid">
        {/* Left Column: Bottleneck Detection & Reason */}
        <div>
          <div className="bottleneck-box">
            <div className="bottleneck-title-row">
              <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Bottleneck Detection Status
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className={`badge ${badge.cls}`}>State: {badge.label}</span>
                <span className={`badge ${isBottleneck ? 'badge-amber' : 'badge-green'}`}>
                  {!tunerStatus?.telemetry_available
                    ? 'TELEMETRY UNAVAILABLE'
                    : isBottleneck
                    ? 'BOTTLENECK DETECTED'
                    : 'NORMAL OPERATION'}
                </span>
              </div>
            </div>

            <div
              className="bottleneck-name"
              style={{
                color: isBottleneck ? 'var(--accent-amber)' : 'var(--accent-green)',
                margin: '0.5rem 0',
              }}
            >
              {tunerStatus?.detected_bottleneck || 'NONE'}
            </div>

            <div className="bottleneck-reason" style={{ fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '1rem' }}>
              {tunerStatus?.reason || 'Waiting for fresh telemetry.'}
            </div>

            {/* 3-Reading Confirmation Streak */}
            <div
              style={{
                background: 'var(--bg-secondary)',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                marginBottom: '1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.4rem',
                  fontSize: '0.8rem',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                  3-Interval Bottleneck Confirmation Streak:
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color:
                      readingsStreak >= 3
                        ? 'var(--accent-rose)'
                        : readingsStreak > 0
                        ? 'var(--accent-amber)'
                        : 'var(--accent-green)',
                  }}
                >
                  {readingsStreak} / 3 readings{' '}
                  {readingsStreak >= 3
                    ? '(CONFIRMED)'
                    : readingsStreak > 0
                    ? '(ELEVATED CANDIDATE)'
                    : '(NORMAL)'}
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, (readingsStreak / 3) * 100)}%`,
                    background:
                      readingsStreak >= 3
                        ? 'var(--accent-rose)'
                        : readingsStreak > 0
                        ? 'var(--accent-amber)'
                        : 'var(--accent-green)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>

            {/* Measured Bottleneck Evidence */}
            {evidence && Object.keys(evidence).length > 0 && (
              <div style={{ marginTop: '0.75rem', marginBottom: '1rem' }}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    marginBottom: '0.4rem',
                  }}
                >
                  Direct Measured Evidence (No Heuristics / Guesswork)
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '0.5rem',
                  }}
                >
                  {evidence.cpu_percent !== undefined && (
                    <div
                      style={{
                        background: 'var(--bg-secondary)',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.8rem',
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>CPU: </span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>
                        {evidence.cpu_percent}%
                      </strong>
                    </div>
                  )}
                  {evidence.context_switches !== undefined && (
                    <div
                      style={{
                        background: 'var(--bg-secondary)',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.8rem',
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>Ctx Switches: </span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>
                        {Number(evidence.context_switches).toLocaleString()}
                      </strong>
                    </div>
                  )}
                  {evidence.active_workers !== undefined && (
                    <div
                      style={{
                        background: 'var(--bg-secondary)',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.8rem',
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>Workers: </span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: '#93c5fd' }}>
                        {evidence.active_workers}
                      </strong>
                    </div>
                  )}
                  {evidence.query_latency_ms !== undefined && (
                    <div
                      style={{
                        background: 'var(--bg-secondary)',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.8rem',
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>Latency: </span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: '#f43f5e' }}>
                        {Number(evidence.query_latency_ms).toFixed(1)} ms
                      </strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Task 4 & Task 7: Recommendation & Action Details Panel */}
            {(recommendation?.parameter || activeAction?.action?.parameter || tunerStatus?.recommended_action) && (
              <div
                className="recommendation-pill"
                style={{
                  background: 'rgba(139, 92, 246, 0.12)',
                  borderColor: 'rgba(139, 92, 246, 0.4)',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Info size={16} color="var(--accent-purple)" />
                    <span style={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', color: '#c4b5fd' }}>
                      {inActionLifecycle ? 'Applied Action Details' : 'Recommended Safe Action'}
                    </span>
                  </div>
                  <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                    {inActionLifecycle
                      ? `STATUS: ${activeAction?.state || state}`
                      : 'STATUS: RECOMMENDATION READY'}
                  </span>
                </div>

                <div style={{ marginTop: '0.5rem', width: '100%' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Action Type:{' '}
                    <strong style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>
                      {actionData?.action_type || 'REDUCE_DB_PARALLELISM'}
                    </strong>
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff', marginTop: '0.2rem' }}>
                    Parameter: <code>{actionData?.parameter || 'max_parallel_workers_per_gather'}</code>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginTop: '0.35rem',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1rem',
                    }}
                  >
                    <span>Current: <strong style={{ color: '#93c5fd' }}>{actionData?.old_value ?? 8}</strong></span>
                    <ArrowRight size={16} color="var(--accent-purple)" />
                    <span>Target: <strong style={{ color: '#a78bfa' }}>{actionData?.new_value ?? 6}</strong></span>
                  </div>
                  {actionData?.reason && (
                    <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Reason: {actionData.reason}
                    </div>
                  )}
                  {actionData?.timestamp && (
                    <div style={{ marginTop: '0.2rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Timestamp: {new Date(actionData.timestamp).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Observation, Cooldown, Guardrails & Safe Range */}
        <div>
          <div
            className="bottleneck-box"
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  color: 'var(--text-secondary)',
                  marginBottom: '0.5rem',
                }}
              >
                Closed-Loop Timers & Safety Mechanism
              </div>

              {/* Task 8: Observation Countdown */}
              {state === 'OBSERVING' && (
                <div
                  style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <Clock size={16} color="#60a5fa" />
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#93c5fd' }}>
                      30-Second Observation Countdown:
                    </span>
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#fff' }}>
                    {observationSeconds}s remaining
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Live OS and DB metrics continue streaming above. The system evaluates whether latency and CPU improve before making a KEEP / ROLLBACK decision.
                  </div>
                </div>
              )}

              {/* Task 17: Cooldown Countdown */}
              {state === 'COOLDOWN' && (
                <div
                  style={{
                    background: 'rgba(96, 165, 250, 0.12)',
                    border: '1px solid rgba(96, 165, 250, 0.3)',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <Clock size={16} color="#93c5fd" />
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#bfdbfe' }}>
                      30-Second Cooldown Countdown:
                    </span>
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#fff' }}>
                    {cooldownSeconds}s remaining
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Monitoring continues. No new tuning action will be applied during cooldown to prevent oscillation.
                  </div>
                </div>
              )}

              {/* Task 24: One-Action-at-a-Time Rule */}
              {inActionLifecycle && (
                <div
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    marginBottom: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8rem',
                    color: '#93c5fd',
                  }}
                >
                  <ShieldCheck size={14} color="#60a5fa" />
                  <span>Another tuning action is blocked until evaluation and cooldown complete.</span>
                </div>
              )}

              {/* Task 25: Safe Tuning Parameter Range */}
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  marginBottom: '0.75rem',
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
                  Safe Tuning Range: <code>max_parallel_workers_per_gather</code>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', margin: '0.4rem 0' }}>
                  {[1, 2, 4, 6, 8].map((val) => {
                    const isCurrent = (actionData?.new_value ?? 8) === val;
                    return (
                      <span
                        key={val}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          background: isCurrent ? 'var(--accent-purple)' : 'var(--bg-primary)',
                          color: isCurrent ? '#fff' : 'var(--text-muted)',
                          border: `1px solid ${isCurrent ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                          fontWeight: isCurrent ? 700 : 400,
                        }}
                      >
                        {val} {isCurrent && '★'}
                      </span>
                    );
                  })}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Configured discrete stepping prevents radical parameter degradation.
                </div>
              </div>

              {/* Task 26: OS Action Capability Panel */}
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  marginBottom: '0.75rem',
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
                  OS Action Capabilities (Prepared for Future Extensions)
                </div>
                <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <div>CPU Affinity: <strong style={{ color: '#10b981' }}>Supported</strong> (psutil core binding)</div>
                  <div>Process Priority: <strong style={{ color: '#10b981' }}>Supported</strong> (nice/priority control)</div>
                  <div>cgroup CPU Control: <span style={{ color: 'var(--text-muted)' }}>Unsupported in current WSL2 environment</span></div>
                </div>
              </div>

              {/* Persistence & Telemetry Status */}
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Action Audit: <strong>{tunerStatus?.persistence_status || 'NOT_REQUESTED'}</strong> | OS:{' '}
                  <strong>{tunerStatus?.os_persistence_status || 'IDLE'}</strong> | DB:{' '}
                  <strong>{tunerStatus?.db_persistence_status || 'IDLE'}</strong>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: '1rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-color)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
              }}
            >
              Interval: <strong>5s</strong> | Observation Window: <strong>30s</strong> | Cooldown: <strong>30s</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
