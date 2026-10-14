import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Play, Pause, StepForward, RotateCcw, Activity, Search, Wrench, Eye, Scale,
  CheckCircle2, XCircle, MinusCircle, Info, ShieldAlert, Radio, FileJson,
  Download, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';
import { SCENARIOS, scenarioById } from '../scenarios.mjs';
import { api } from '../services/api';
import { EvidenceChart } from './SessionRunner';
import {
  round,
  round1,
  DEFAULT_ALLOWED_WORKERS,
  VERDICT_META,
  NODES,
  getDetectSignals,
  netBenefit,
  exampleModel,
  actionModel,
  liveTraceModel,
  buildBeats,
} from '../algorithmModel.mjs';

function downloadJson(data, filename = 'optidbx_evidence.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function DetectionCounter({ tape, tapeLabel, revealed, telemetry, traceTicks, thresholds, onSelectTick }) {
  const signals = useMemo(() => getDetectSignals(thresholds), [thresholds]);

  // If live trace ticks are available, render the truthful timestamped tick tape
  if (traceTicks && traceTicks.length > 0) {
    const latestTick = traceTicks[traceTicks.length - 1];
    const count = latestTick?.consecutive ?? 0;
    const required = latestTick?.required ?? 3;
    const confirmed = count >= required;

    return (
      <div className="alg-detect">
        <div className="alg-signals">
          {signals.map((s) => {
            const v = telemetry?.[s.key];
            const hot = Number.isFinite(v) && v >= s.limit;
            return (
              <div key={s.key} className={`alg-signal ${hot ? 'hot' : ''}`}>
                <span className="alg-signal-name">{s.label}</span>
                <span className="alg-signal-val">
                  {Number.isFinite(v) ? Math.round(v) : '—'}
                  {s.unit}
                </span>
                <span className="alg-signal-cmp">
                  {hot ? '≥' : '<'} {s.limit}
                  {s.unit} {hot ? 'HOT (✓)' : 'OK (✗)'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="alg-slots">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`alg-slot ${count > i ? 'on' : ''}`}>
              {count > i ? '✓' : i + 1}
            </span>
          ))}
          <span className={`alg-confirm ${confirmed ? 'on' : ''}`}>
            {confirmed ? 'Confirmed (3/3)' : `${count}/${required}`}
          </span>
        </div>

        <div className="alg-tick-tape" role="region" aria-label="Backend Decision Trace">
          <span className="alg-tape-label">
            Real Backend Decision Trace (last {traceTicks.length} ticks, 5s interval):
          </span>
          <div className="alg-ticks-scroll">
            {traceTicks.map((tick, i) => {
              const timeStr = new Date(tick.timestamp).toLocaleTimeString();
              const isLast = i === traceTicks.length - 1;
              return (
                <button
                  key={i}
                  type="button"
                  className={`alg-tick-chip ${tick.candidate ? 'hi' : 'ok'} ${isLast ? 'latest' : ''}`}
                  onClick={() => onSelectTick?.(tick)}
                  title={`Tick at ${timeStr}: click to view raw evidence`}
                >
                  <span className="tick-time">{timeStr}</span>
                  <span className="tick-streak">{tick.consecutive}/3</span>
                  <span className="tick-flag">{tick.candidate ? 'HIGH' : 'NORMAL'}</span>
                  {tick.invalidated && (
                    <span className="tick-reset" title={tick.invalidated}>
                      ↺ {tick.invalidated}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <p className="alg-hint">
          Every 5 seconds, all four signals above are threshold-tested. Contention is confirmed only when
          <b> all four hold for 3 consecutive intervals</b> (~15s). A single normal reading or telemetry
          gap immediately resets the confirmation counter.
        </p>
      </div>
    );
  }

  // Scripted scenario fallback
  let count = 0;
  const seq = (tape || []).slice(0, revealed).map((r) => {
    count = r === 'hi' ? count + 1 : 0;
    return { r, count };
  });
  const confirmed = count >= 3;

  return (
    <div className="alg-detect">
      {telemetry && (
        <div className="alg-signals">
          {signals.map((s) => {
            const v = telemetry[s.key];
            const hot = Number.isFinite(v) && v >= s.limit;
            return (
              <div key={s.key} className={`alg-signal ${hot ? 'hot' : ''}`}>
                <span className="alg-signal-name">{s.label}</span>
                <span className="alg-signal-val">
                  {Number.isFinite(v) ? Math.round(v) : '—'}
                  {s.unit}
                </span>
                <span className="alg-signal-cmp">
                  {hot ? '≥' : '<'} {s.limit}
                  {s.unit} {hot ? 'HOT (✓)' : 'OK (✗)'}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="alg-slots">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`alg-slot ${count > i ? 'on' : ''}`}>
            {count > i ? '✓' : i + 1}
          </span>
        ))}
        <span className={`alg-confirm ${confirmed ? 'on' : ''}`}>
          {confirmed ? 'Confirmed (3/3)' : `${count}/3`}
        </span>
      </div>
      {tapeLabel && (
        <div style={{ fontSize: '.74rem', color: 'var(--s-neutral)', margin: '6px 0 2px', fontStyle: 'italic' }}>
          Tape: {tapeLabel}
        </div>
      )}
      <div className="alg-readings">
        {seq.map((s, i) => (
          <span key={i} className={`alg-reading ${s.r === 'hi' ? 'hi' : 'ok'}`}>
            {s.r === 'hi' ? 'high' : 'normal'}
            {s.r === 'ok' && s.count === 0 ? ' · reset' : ''}
          </span>
        ))}
      </div>
      <p className="alg-hint">
        Every interval all four signals above are threshold-tested; a bottleneck must persist for
        <b> three consecutive</b> readings (a single normal reading resets the counter), so transient
        spikes are filtered before any tuning action is considered.
      </p>
    </div>
  );
}

function NetBenefit({ nb }) {
  if (!nb) return null;
  const pass = nb.pass;
  return (
    <div className="alg-net">
      <div className="alg-net-formula-banner">
        <span className="formula-label">Real Evaluation Formula:</span>
        <code className="formula-str">{nb.formulaStr}</code>
      </div>

      <div className="alg-net-rows">
        <div className="alg-net-row">
          <span>Δ throughput</span>
          <b className={nb.tGain >= 0 ? 'good' : ''}>
            {nb.tGain >= 0 ? '+' : ''}
            {nb.tGain}%
          </b>
        </div>
        <div className="alg-net-row">
          <span>p95 tail latency change</span>
          <b className={nb.p95Change <= 0 ? 'good' : 'bad'}>
            {nb.p95Change >= 0 ? '+' : ''}
            {nb.p95Change}%
          </b>
        </div>
        <div className="alg-net-row total">
          <span>Combined net (1.0·qps − 0.5·p95)</span>
          <b className={pass ? 'good' : 'bad'}>
            {nb.net >= 0 ? '+' : ''}
            {nb.net}%
          </b>
        </div>
      </div>

      <div className="alg-net-scale">
        <div className="alg-scale-track">
          <div className="alg-scale-th" style={{ left: '50%' }}>
            <span>+{nb.threshold}% threshold</span>
          </div>
          <div
            className={`alg-scale-mark ${pass ? 'good' : 'bad'}`}
            style={{ left: `${Math.max(2, Math.min(98, 50 + nb.net * 2))}%` }}
          />
        </div>
      </div>

      {nb.vetoes && nb.vetoes.length > 0 && (
        <div className="alg-vetoes-list">
          <span className="alg-vetoes-title">Safety Veto Guards:</span>
          <div className="alg-vetoes-grid">
            {nb.vetoes.map((v, i) => (
              <div key={i} className={`alg-veto-card ${v.passed ? 'pass' : 'vetoed'}`}>
                <div className="veto-head">
                  {v.passed ? (
                    <CheckCircle2 size={13} className="veto-icon pass" />
                  ) : (
                    <XCircle size={13} className="veto-icon fail" />
                  )}
                  <span className="veto-label">{v.label || v.name}</span>
                </div>
                <div className="veto-body">
                  <span className="veto-status-badge">{v.passed ? 'PASS' : 'VETO'}</span>
                  {v.value && <span className="veto-val">{v.value}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="alg-net-rule">
        The change is kept only if combined net clears <b>+{nb.threshold}%</b> and all safety vetoes pass.
        {pass ? ' Policy cleared → KEEP.' : ' Rule failed or veto tripped → ROLLBACK.'}
      </p>
    </div>
  );
}

function RawEvidenceDrawer({ open, onToggle, model, selectedTick }) {
  const data = selectedTick || model?.rawRecord || model?.rawTrace || model;
  const actionId = model?.action?.actionId || model?.activeAction?.action?.action_id || model?.rawRecord?.action?.action_id;
  const experimentId = model?.activeAction?.experiment_id || model?.rawRecord?.experiment_id;

  return (
    <div className="alg-raw-drawer-container">
      <div className="alg-drawer-bar">
        <button
          type="button"
          className="btn-secondary sm"
          onClick={onToggle}
          aria-expanded={open}
        >
          <FileJson size={14} /> {open ? 'Hide raw evidence' : 'Show raw evidence (JSON)'}
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          type="button"
          className="btn-secondary sm"
          onClick={() => downloadJson(data, `optidbx_decision_${actionId || 'trace'}.json`)}
        >
          <Download size={14} /> Download trace (JSON)
        </button>
      </div>

      {open && (
        <div className="alg-raw-drawer">
          <div className="alg-raw-meta">
            <div>
              <span>API Endpoint:</span>{' '}
              <a
                href="http://localhost:8000/docs#/tuner/decision_trace_tuner_decision_trace_get"
                target="_blank"
                rel="noreferrer"
              >
                GET /tuner/decision-trace <ExternalLink size={12} />
              </a>
            </div>
            {experimentId && <div><span>Experiment ID:</span> <code>{experimentId}</code></div>}
            {actionId && <div><span>Action ID:</span> <code>{actionId}</code></div>}
            <div><span>PostgreSQL audit:</span> <code>tuning_actions</code>, <code>db_metrics</code></div>
          </div>
          <pre className="alg-raw-json">{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export function AlgorithmVisual({ model, beat, emptyTitle, emptyText }) {
  const [selectedTick, setSelectedTick] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);

  const beats = useMemo(() => (model ? buildBeats(model) : []), [model]);
  const b = Math.max(0, Math.min(beat ?? 0, beats.length - 1));
  const reachedPhases = useMemo(() => new Set(beats.slice(0, b + 1).map((x) => x.phase)), [beats, b]);
  const currentPhase = beats[b]?.phase || 'sample';
  const detectRevealed = beats.slice(0, b + 1).filter((x) => x.phase === 'detect').length;

  const nb = useMemo(() => {
    if (!model) return null;
    return netBenefit(
      model.evidence,
      model.storedNet,
      model.weights,
      model.vetoes,
      model.algorithm?.improvement_percent ?? 5
    );
  }, [model]);

  const vmeta = model ? VERDICT_META[model.verdict] || VERDICT_META.NO_ACTION : null;
  const allowedWorkers = model?.algorithm?.allowed_workers || DEFAULT_ALLOWED_WORKERS;

  const nodeState = (key) => {
    const has =
      key === 'sample' ||
      key === 'decide' ||
      (key === 'detect' && (model?.tape || (model?.traceTicks && model.traceTicks.length > 0))) ||
      (key === 'apply' && model?.hasApply) ||
      (key === 'observe' && model?.hasObserve);
    if (!has) return 'skipped';
    if (reachedPhases.has(key)) return currentPhase === key ? 'current' : 'done';
    return 'upcoming';
  };

  if (!model) {
    return (
      <div className="empty-state">
        <Search size={26} />
        <h3>{emptyTitle || 'Nothing to visualize yet'}</h3>
        <p>{emptyText || 'Start or select a run to watch the decision unfold.'}</p>
      </div>
    );
  }

  return (
    <>
      <div className="alg-badge-row">
        <span className={`alg-source-badge ${model.source}`}>
          {model.source === 'live' && <Radio size={12} className="pulse-icon" />}
          {model.badge}
        </span>
      </div>

      {/* 5-stage algorithm flow */}
      <ol className="alg-flow" aria-label="Algorithm flow">
        {NODES.map((n) => {
          const st = nodeState(n.key);
          return (
            <li key={n.key} className={`alg-node ${st}`}>
              <span className="alg-node-dot" />
              <span className="alg-node-label">{n.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="alg-stage">
        {/* Sample */}
        <div className={`alg-panel ${currentPhase === 'sample' ? 'live' : ''}`}>
          <h4>
            <Activity size={14} /> Telemetry sample
          </h4>
          <div className="alg-ticker">
            <div>
              <span>CPU</span>
              <b>{model.telemetry.cpu_percent != null ? `${model.telemetry.cpu_percent}%` : '—'}</b>
            </div>
            <div>
              <span>Ctx Switches</span>
              <b>{model.telemetry.context_switches != null ? model.telemetry.context_switches : '—'}</b>
            </div>
            <div>
              <span>Workers</span>
              <b>{model.telemetry.active_workers ?? '—'}</b>
            </div>
            <div>
              <span>Latency</span>
              <b>
                {model.telemetry.query_latency_ms != null
                  ? `${Math.round(model.telemetry.query_latency_ms)} ms`
                  : '—'}
              </b>
            </div>
          </div>
        </div>

        {/* Detect */}
        {reachedPhases.has('detect') && (
          <div className={`alg-panel ${currentPhase === 'detect' ? 'live' : ''}`}>
            <h4>
              <Search size={14} /> Detection — 4-signal confirmation rule
            </h4>
            <DetectionCounter
              tape={model.tape}
              tapeLabel={model.tapeLabel}
              revealed={detectRevealed}
              telemetry={model.telemetry}
              traceTicks={model.traceTicks}
              thresholds={model.thresholds}
              onSelectTick={(tick) => {
                setSelectedTick(tick);
                setShowDrawer(true);
              }}
            />
          </div>
        )}

        {/* Apply */}
        {model.hasApply && reachedPhases.has('apply') && model.action && (
          <div className={`alg-panel ${currentPhase === 'apply' ? 'live' : ''}`}>
            <h4>
              <Wrench size={14} /> Apply — journalled single safe step
            </h4>
            <div className="alg-apply">
              <code>{model.action.param}</code>
              <span className="alg-apply-move">
                {model.action.from ?? '?'} <b>→</b> {model.action.to}
              </span>
              <span className="alg-apply-note">
                written to the recovery journal on disk, verified immediately after application
              </span>
            </div>

            <div className="alg-ladder" aria-label="Parallelism ladder">
              <span className="alg-ladder-label">Allowed Parallelism Values:</span>
              <div className="alg-ladder-steps">
                {allowedWorkers.map((w) => {
                  const isCurrent = model.action && String(model.action.from) === String(w);
                  const isTarget = model.action && String(model.action.to) === String(w);
                  return (
                    <div
                      key={w}
                      className={`alg-ladder-step ${isTarget ? 'target' : isCurrent ? 'current' : ''}`}
                    >
                      <span className="step-val">{w}</span>
                      {isCurrent && <span className="step-badge">Current</span>}
                      {isTarget && <span className="step-badge target">Target Step</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Observe */}
        {model.hasObserve && reachedPhases.has('observe') && model.evidence && (
          <div className={`alg-panel ${currentPhase === 'observe' ? 'live' : ''}`}>
            <h4>
              <Eye size={14} /> Observation — owned workload window
            </h4>
            <EvidenceChart evidence={model.evidence} />
          </div>
        )}

        {/* Decide */}
        {reachedPhases.has('decide') && (
          <div className={`alg-panel decide ${vmeta.cls} ${currentPhase === 'decide' ? 'live' : ''}`}>
            <h4>
              <Scale size={14} /> Decision — net benefit &amp; safety vetoes
            </h4>
            {nb ? (
              <NetBenefit nb={nb} />
            ) : model.notRecorded ? (
              <p className="alg-noaction">Evaluation details were not recorded for this older run.</p>
            ) : (
              <p className="alg-noaction">No change was applied — {model.detail}</p>
            )}

            <div className={`alg-verdict ${vmeta.cls}`}>
              <div>
                <b>{vmeta.label}</b>
                <span>{model.detail}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <RawEvidenceDrawer
        open={showDrawer}
        onToggle={() => setShowDrawer((v) => !v)}
        model={model}
        selectedTick={selectedTick}
      />
    </>
  );
}

export default function AlgorithmView({ trace = null }) {
  const [source, setSource] = useState('example');
  const [scenarioId, setScenarioId] = useState('cpu-contention');
  const [experiments, setExperiments] = useState([]);
  const [recordId, setRecordId] = useState('');
  const [recordAction, setRecordAction] = useState(null);
  const [liveStatus, setLiveStatus] = useState(null);
  const [liveTrace, setLiveTrace] = useState(trace);
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('standard');

  useEffect(() => {
    if (trace) setLiveTrace(trace);
  }, [trace]);

  // Load experiments for the recorded picker.
  useEffect(() => {
    api.getExperiments?.().then((r) => {
      if (Array.isArray(r?.data)) setExperiments(r.data);
    });
  }, []);

  // Poll live tuner status and decision trace when on live source.
  useEffect(() => {
    if (source !== 'live') return undefined;
    let cancelled = false;
    const tick = () => {
      Promise.all([api.getTunerStatus(), api.getDecisionTrace(30)]).then(([sRes, tRes]) => {
        if (cancelled) return;
        if (sRes?.status === 200) setLiveStatus(sRes.data || null);
        if (tRes?.status === 200 && tRes.data) setLiveTrace(tRes.data);
      });
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [source]);

  // Load a recorded experiment's first action.
  useEffect(() => {
    if (source !== 'recorded' || !recordId) return;
    api.getExperimentDetail(recordId).then((r) => {
      setRecordAction(r?.data?.actions?.[0] || null);
    });
  }, [source, recordId]);

  const model = useMemo(() => {
    if (source === 'example') return exampleModel(scenarioById(scenarioId) || SCENARIOS[0]);
    if (source === 'live') {
      return liveTraceModel({ tunerStatus: liveStatus }, liveTrace, 0);
    }
    if (source === 'recorded') {
      return recordAction ? actionModel(recordAction, 'recorded', `Session #${recordId}`) : null;
    }
    return null;
  }, [source, scenarioId, liveStatus, liveTrace, recordAction, recordId]);

  const beats = useMemo(() => (model ? buildBeats(model) : []), [model]);
  const controllable = source !== 'live';

  useEffect(() => {
    setPlaying(false);
    setBeat(controllable ? 0 : Math.max(0, beats.length - 1));
  }, [source, scenarioId, recordId, controllable, beats.length]);

  useEffect(() => {
    if (source === 'live') setBeat(Math.max(0, beats.length - 1));
  }, [source, beats.length, liveStatus, liveTrace]);

  useEffect(() => {
    if (!playing || !controllable) return undefined;
    if (beat >= beats.length - 1) {
      setPlaying(false);
      return undefined;
    }
    const t = setTimeout(
      () => setBeat((b) => Math.min(beats.length - 1, b + 1)),
      speed === 'quick' ? 850 : 1500
    );
    return () => clearTimeout(t);
  }, [playing, beat, beats.length, speed, controllable]);

  const step = useCallback(() => setBeat((b) => Math.min(beats.length - 1, b + 1)), [beats.length]);
  const restart = useCallback(() => {
    setBeat(0);
    setPlaying(true);
  }, []);

  const done = beat >= beats.length - 1;

  return (
    <section className="algorithm-view">
      <p className="section-eyebrow">Algorithm</p>
      <h2 className="section-heading">How the decision is made</h2>
      <p className="section-sub">
        Inspect the real backend decision trace tick-by-tick, the multi-signal detection rule, the safe
        parallelism ladder, and the net-benefit keep/rollback formula.
      </p>

      <div className="alg-controls">
        <div className="alg-source" role="group" aria-label="Source">
          {[
            ['example', 'Example scenario'],
            ['live', 'Live session'],
            ['recorded', 'Recorded run'],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              className={source === v ? 'active' : ''}
              onClick={() => setSource(v)}
            >
              {l}
            </button>
          ))}
        </div>
        {source === 'example' && (
          <select
            aria-label="Scenario"
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
          >
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
        {source === 'recorded' && (
          <select
            aria-label="Recorded run"
            value={recordId}
            onChange={(e) => setRecordId(e.target.value)}
          >
            <option value="">Choose a session…</option>
            {experiments.map((e) => (
              <option key={e.id} value={e.id}>
                Session #{e.id} · {e.workload_type || '—'}
              </option>
            ))}
          </select>
        )}
        {controllable && model && (
          <div className="alg-play">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPlaying((p) => !p)}
              disabled={done && !playing}
            >
              {playing ? (
                <>
                  <Pause size={15} /> Pause
                </>
              ) : (
                <>
                  <Play size={15} /> Play
                </>
              )}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={step}
              disabled={done}
            >
              <StepForward size={15} /> Step
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={restart}
            >
              <RotateCcw size={15} /> Restart
            </button>
            <div className="speed-toggle" role="group" aria-label="Speed">
              {['standard', 'quick'].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={speed === s ? 'active' : ''}
                  onClick={() => setSpeed(s)}
                >
                  {s === 'standard' ? 'Standard' : 'Quick'}
                </button>
              ))}
            </div>
          </div>
        )}
        {source === 'live' && (
          <span className={`sys-pill ${liveStatus ? 'on' : ''}`}>
            <Radio size={13} /> {liveStatus ? 'Following live' : 'No live session'}
          </span>
        )}
      </div>

      <AlgorithmVisual
        model={model}
        beat={beat}
        emptyTitle={source === 'live' ? 'No live session to follow' : 'Choose a recorded run'}
        emptyText={
          source === 'live'
            ? 'Start a Live Session, then return here to watch the algorithm on real data.'
            : 'Pick a session from the dropdown to replay its decision.'
        }
      />
    </section>
  );
}

export function SessionAlgorithm({ isLive, phase, activeStage, stageIndex, session, live }) {
  const model = useMemo(
    () => (isLive ? liveTraceModel(live, live?.trace, stageIndex) : exampleModel(session)),
    [isLive, live, stageIndex, session]
  );
  const beats = useMemo(() => (model ? buildBeats(model) : []), [model]);
  const rank = Math.min(4, Math.max(0, stageIndex ?? 0));
  const beat = Math.min(rank, beats.length - 1);

  return (
    <section className="mission-panel algorithm-panel">
      <div className="panel-head">
        <h3>How the decision is being made</h3>
        <span className={`alg-sync-tag ${isLive ? 'live' : ''}`}>
          {isLive ? (
            <>
              <Radio size={12} /> Following this session
            </>
          ) : (
            'Synced to the run'
          )}
        </span>
      </div>
      <AlgorithmVisual
        model={model}
        beat={beat}
        emptyTitle="Preparing the visualization"
        emptyText="The algorithm view follows this session as it runs."
      />
      <p className="alg-inline-foot">
        This mirrors the exact decision path OptiDBX is taking for this {isLive ? 'live session' : 'scenario'}.
      </p>
    </section>
  );
}
