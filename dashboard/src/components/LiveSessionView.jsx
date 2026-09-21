import React, { useState } from 'react';
import { Radio, Play, Database, Clock, ShieldCheck, AlertTriangle } from 'lucide-react';
import SessionRunner from './SessionRunner';

const PROFILES = [
  { id: 'LOW', label: 'Low', sessions: '1 owned session', text: 'A quiet baseline. Good for checking the pipeline end to end; a bottleneck is unlikely.' },
  { id: 'MEDIUM', label: 'Medium', sessions: '4 owned sessions', text: 'Moderate concurrency. A sensible default for a live demonstration.' },
  { id: 'HIGH', label: 'High', sessions: '10 owned sessions', text: 'Heavy analytical load. Most likely to create genuine contention.' },
];
const DURATIONS = [120, 180, 300];

export default function LiveSessionView({
  metrics, tunerStatus, workloadStatus, pending,
  onStart, onStop, onOpenMetrics, onComplete, locked,
}) {
  const [profile, setProfile] = useState('MEDIUM');
  const [duration, setDuration] = useState(180);
  const [active, setActive] = useState(false);

  const running = Boolean(workloadStatus?.running);
  const inSession = active || running;
  const blocked = pending || locked || tunerStatus?.recovery_required || !!tunerStatus?.cooldown_remaining_seconds;

  if (inSession) {
    return (
      <SessionRunner
        session={{
          kind: 'live',
          id: `live-${workloadStatus?.experiment_id ?? 'session'}`,
          title: 'Live Session',
          subtitle: `${profile} workload on the real database`,
          category: 'DB',
        }}
        live={{ metrics, tunerStatus, workloadStatus, pending, onStop }}
        onOpenMetrics={onOpenMetrics}
        onComplete={onComplete}
        onExit={() => setActive(false)}
      />
    );
  }

  return (
    <div className="live-setup">
      <p className="section-eyebrow">Live Session</p>
      <h2 className="section-heading">Run OptiDBX on the real database</h2>
      <p className="section-sub">
        This runs the same pipeline as a demo scenario — but every number is measured live
        on PostgreSQL. Choose the pressure level, then start the session.
      </p>

      <div className="setup-card">
        <div className="setup-block">
          <h3><Database size={16} /> Workload</h3>
          <div className="profile-options" role="radiogroup" aria-label="Workload profile">
            {PROFILES.map((p) => (
              <button key={p.id} role="radio" aria-checked={profile === p.id}
                className={`profile-option ${profile === p.id ? 'selected' : ''}`}
                onClick={() => setProfile(p.id)}>
                <span className="po-label">{p.label}</span>
                <span className="po-sessions">{p.sessions}</span>
                <span className="po-text">{p.text}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setup-block">
          <h3><Clock size={16} /> Duration</h3>
          <div className="duration-options" role="radiogroup" aria-label="Session duration">
            {DURATIONS.map((d) => (
              <button key={d} role="radio" aria-checked={duration === d}
                className={`duration-option ${duration === d ? 'selected' : ''}`}
                onClick={() => setDuration(d)}>{d / 60} min</button>
            ))}
          </div>
        </div>

        <div className="setup-note">
          <ShieldCheck size={16} />
          <span>
            The session starts in recommendation mode, collects a warm baseline, and only
            acts if three consecutive readings confirm contention. Any change is verified
            and reversible.
          </span>
        </div>

        {tunerStatus?.recovery_required && (
          <div className="setup-warning"><AlertTriangle size={16} /> Recovery is unresolved — resolve it before starting a new session.</div>
        )}
        {!!tunerStatus?.cooldown_remaining_seconds && (
          <div className="setup-warning"><AlertTriangle size={16} /> Cooldown in progress: {Math.ceil(tunerStatus.cooldown_remaining_seconds)}s remaining.</div>
        )}

        <button className="btn-primary lg" disabled={blocked}
          onClick={async () => { setActive(true); const r = await onStart(profile, duration); if (r && r.status !== 200) setActive(false); }}>
          <Play size={18} /> Start live session
        </button>
        <p className="setup-foot"><Radio size={13} /> Results are recorded and appear in Results &amp; History.</p>
      </div>
    </div>
  );
}
