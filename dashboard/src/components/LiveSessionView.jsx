import React, { useEffect, useState } from 'react';
import {
  Radio, Play, Database, Clock, ShieldCheck, AlertTriangle,
  Layers, SlidersHorizontal, Cpu,
} from 'lucide-react';
import SessionRunner from './SessionRunner';
import { api } from '../services/api';

const PROFILES = [
  { id: 'LOW', label: 'Low', sessions: '1 owned session', text: 'A quiet baseline. Good for checking the pipeline end to end; a bottleneck is unlikely.' },
  { id: 'MEDIUM', label: 'Medium', sessions: '4 owned sessions', text: 'Moderate concurrency. A sensible default for a live demonstration.' },
  { id: 'HIGH', label: 'High', sessions: '10 owned sessions', text: 'Heavy analytical load. Most likely to create genuine contention.' },
];
const DURATIONS = [120, 180, 300];

// Fallbacks if /workload/options is unavailable (keeps the page usable offline).
const FALLBACK_TYPES = [
  { id: 'READ', label: 'Read-heavy', description: 'Single-row indexed lookups on pgbench_accounts. Light, read-only.' },
  { id: 'WRITE', label: 'Write-heavy', description: 'Single-row UPDATEs on pgbench_accounts. Mutates data (regenerable).' },
  { id: 'ANALYTICAL', label: 'Analytical', description: 'Parallel aggregate scan — most likely to create parallelism contention.' },
  { id: 'MIXED', label: 'Mixed', description: 'Blend of reads and periodic writes, TPC-B-like.' },
];
const FALLBACK_PARALLELISM = [1, 2, 4, 6, 8];
const FALLBACK_WORK_MEM = [4, 8, 16, 32, 64];
const FALLBACK_NICE = [-5, 0, 5, 10];

// A pill group where `null` means "leave the session default".
function PillGroup({ label, value, options, onChange, format = String }) {
  return (
    <div className="duration-options" role="radiogroup" aria-label={label}>
      <button role="radio" aria-checked={value === null}
        className={`duration-option ${value === null ? 'selected' : ''}`}
        onClick={() => onChange(null)}>Default</button>
      {options.map((o) => (
        <button key={String(o)} role="radio" aria-checked={value === o}
          className={`duration-option ${value === o ? 'selected' : ''}`}
          onClick={() => onChange(o)}>{format(o)}</button>
      ))}
    </div>
  );
}

export default function LiveSessionView({
  metrics, history, tunerStatus, workloadStatus, pending,
  onStart, onStop, onOpenMetrics, onComplete, locked,
}) {
  const [profile, setProfile] = useState('MEDIUM');
  const [duration, setDuration] = useState(180);
  const [workloadType, setWorkloadType] = useState('ANALYTICAL');
  const [parallelism, setParallelism] = useState(null);
  const [workMem, setWorkMem] = useState(null);
  const [osNice, setOsNice] = useState(null);
  const [osCores, setOsCores] = useState(null);
  const [active, setActive] = useState(false);

  const [types, setTypes] = useState(FALLBACK_TYPES);
  const [parallelismValues, setParallelismValues] = useState(FALLBACK_PARALLELISM);
  const [workMemValues, setWorkMemValues] = useState(FALLBACK_WORK_MEM);
  const [niceValues, setNiceValues] = useState(FALLBACK_NICE);
  const [coreValues, setCoreValues] = useState([1, 2, 4]);

  useEffect(() => {
    let cancelled = false;
    api.getWorkloadOptions().then((res) => {
      if (cancelled || res.status !== 200 || !res.data) return;
      const d = res.data;
      if (Array.isArray(d.workload_types) && d.workload_types.length) setTypes(d.workload_types);
      if (Array.isArray(d.parallelism_values) && d.parallelism_values.length) setParallelismValues(d.parallelism_values);
      if (Array.isArray(d.work_mem_mb_values) && d.work_mem_mb_values.length) setWorkMemValues(d.work_mem_mb_values);
      const os = d.os_preview || {};
      if (Array.isArray(os.nice_values) && os.nice_values.length) setNiceValues(os.nice_values);
      const cpu = Number(os.cpu_count) || 4;
      setCoreValues([...new Set([1, 2, 4, 8, cpu])].filter((n) => n >= 1 && n <= cpu).sort((a, b) => a - b));
    });
    return () => { cancelled = true; };
  }, []);

  const running = Boolean(workloadStatus?.running);
  const inSession = active || running;
  const blocked = pending || locked || tunerStatus?.recovery_required || !!tunerStatus?.cooldown_remaining_seconds;

  const topParallelism = parallelismValues[parallelismValues.length - 1];
  const parallelismHint = parallelism !== null && parallelism <= parallelismValues[0];

  if (inSession) {
    return (
      <SessionRunner
        session={{
          kind: 'live',
          id: `live-${workloadStatus?.experiment_id ?? 'session'}`,
          title: 'Live Session',
          subtitle: `${workloadStatus?.workload_type ?? workloadType} · ${profile} workload on the real database`,
          category: 'DB',
        }}
        live={{ metrics, history, tunerStatus, workloadStatus, pending, onStop, duration }}
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
        on PostgreSQL. Pick a workload, a starting configuration, then start the session.
      </p>

      <div className="setup-card">
        <div className="setup-block">
          <h3><Layers size={16} /> Workload type</h3>
          <div className="profile-options" role="radiogroup" aria-label="Workload type">
            {types.map((t) => (
              <button key={t.id} role="radio" aria-checked={workloadType === t.id}
                className={`profile-option ${workloadType === t.id ? 'selected' : ''}`}
                onClick={() => setWorkloadType(t.id)}>
                <span className="po-label">{t.label}</span>
                <span className="po-text">{t.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setup-block">
          <h3><Database size={16} /> Pressure</h3>
          <div className="profile-options" role="radiogroup" aria-label="Workload pressure">
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

        <div className="setup-block">
          <h3><SlidersHorizontal size={16} /> DBMS starting configuration</h3>
          <p className="setup-hint">OptiDBX tunes parallelism <em>from</em> this starting point. Start near the top to give it room to act.</p>
          <p className="setup-sublabel">Parallel workers per gather</p>
          <PillGroup label="Starting parallelism" value={parallelism} options={parallelismValues} onChange={setParallelism} />
          {parallelismHint && (
            <p className="setup-hint warn">At the minimum, the autotuner has no safe lower step — pick a higher value to see it act (top is {topParallelism}).</p>
          )}
          <p className="setup-sublabel">work_mem (starting value · not auto-tuned)</p>
          <PillGroup label="Starting work_mem" value={workMem} options={workMemValues} onChange={setWorkMem} format={(v) => `${v} MB`} />
        </div>

        <div className="setup-block">
          <h3><Cpu size={16} /> OS settings <span className="setup-badge">Preview · simulated</span></h3>
          <p className="setup-hint">These are modelled for illustration and are <strong>not applied</strong> to the operating system. DBMS numbers above are measured live.</p>
          <p className="setup-sublabel">Process priority (nice)</p>
          <PillGroup label="Process nice" value={osNice} options={niceValues} onChange={setOsNice} />
          <p className="setup-sublabel">CPU cores (affinity)</p>
          <PillGroup label="CPU cores" value={osCores} options={coreValues} onChange={setOsCores} format={(v) => `${v} core${v > 1 ? 's' : ''}`} />
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
          onClick={async () => {
            setActive(true);
            const r = await onStart({
              profile, duration, workloadType,
              initialParallelism: parallelism,
              initialWorkMemMb: workMem,
              osPreview: { nice: osNice, cores: osCores },
            });
            if (r && r.status !== 200) setActive(false);
          }}>
          <Play size={18} /> Start live session
        </button>
        <p className="setup-foot"><Radio size={13} /> Results are recorded and appear in Results &amp; History.</p>
      </div>
    </div>
  );
}
