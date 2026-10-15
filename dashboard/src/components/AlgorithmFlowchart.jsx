import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Play, Pause, StepBack, StepForward, RotateCcw, Radio, Crosshair,
  CheckCircle2, XCircle,
} from 'lucide-react';
import {
  FLOW_NODES, FLOW_EDGES, FLOW_VIEWBOX, RECT_W, RECT_H, DIA_W, DIA_H,
  scenarioFlow, liveFlow, flowState, scenarioSyncBeat,
} from '../flowModel.mjs';

const VERDICT_LABEL = {
  KEEP: 'Change kept',
  ROLLBACK: 'Change reverted',
  NO_ACTION: 'No change required',
  RECOMMENDATION: 'Recommendation',
  RECOVERY: 'Recovery engaged',
};

const NODE_LABEL = {
  sample: 'Sample', test: '4-signal test', count: 'Counter', confirm: 'Confirm', ladder: 'Ladder',
  apply: 'Apply', observe: 'Observe', net: 'Net benefit', keep: 'Keep', reset: 'Reset',
  mem: 'Memory check', rec: 'Recommend', noaction: 'No action', rollback: 'Rollback',
  verified: 'Verify', reverted: 'Reverted', recovery: 'Recovery',
};

const pillWidth = (t) => Math.max(34, String(t).length * 6.3 + 16);

function FlowEdge({ id, edge, count, current }) {
  const state = current ? 'current' : count > 0 ? 'done' : 'idle';
  const pts = edge.points.map((p) => p.join(',')).join(' ');
  const [x1, y1] = edge.points[0];
  const [x2, y2] = edge.points[1];
  const horiz = Math.abs(y1 - y2) < 1;
  const [lx, ly, anchor] = edge.labelAt
    || [horiz ? (x1 + x2) / 2 : x1 + 8, horiz ? y1 - 8 : (y1 + y2) / 2 + 4, horiz ? 'middle' : 'start'];
  // Loop counters sit on the long return leg so they never cover a label.
  const [bx, by] = edge.points.length > 2
    ? [(edge.points[1][0] + edge.points[2][0]) / 2, (edge.points[1][1] + edge.points[2][1]) / 2]
    : edge.points[1];
  return (
    <g className={`fc-edge ${state}`} data-edge={id}>
      <polyline points={pts} markerEnd={`url(#fc-arrow-${state})`} />
      {edge.label && (
        <text x={lx} y={ly} textAnchor={anchor} className="fc-edge-label">
          {edge.label}
        </text>
      )}
      {edge.loop && count > 0 && (
        <g transform={`translate(${bx}, ${by})`}>
          <rect x={-17} y={-10} width={34} height={18} rx={9} className="fc-loop-badge" />
          <text x={0} y={3} textAnchor="middle" className="fc-loop-text">×{count}</text>
        </g>
      )}
    </g>
  );
}

function FlowNode({ id, node, st, current, onPick, nodeRef }) {
  const state = current ? 'current' : st?.prior ? 'prior' : st?.visits ? 'done' : 'idle';
  const { x, y, shape } = node;
  const isDia = shape === 'diamond';
  const w = RECT_W;
  const h = RECT_H;
  const note = st?.note;
  const notePos = isDia ? [x + DIA_W * 0.42, y - DIA_H - 4] : [x + w / 2 - 4, y - h / 2 - 2];
  return (
    <g
      ref={nodeRef}
      className={`fc-node ${shape} ${node.tone || ''} ${state}`}
      onClick={() => onPick(id)}
      role="button"
      tabIndex={0}
      aria-label={`${node.title} (${state})`}
      onKeyDown={(e) => { if (e.key === 'Enter') onPick(id); }}
    >
      {current && (isDia
        ? <polygon className="fc-pulse" points={`${x},${y - DIA_H - 8} ${x + DIA_W + 14},${y} ${x},${y + DIA_H + 8} ${x - DIA_W - 14},${y}`} />
        : <rect className="fc-pulse" x={x - w / 2 - 7} y={y - h / 2 - 7} width={w + 14} height={h + 14} rx={shape === 'terminal' ? 36 : 16} />)}
      {isDia
        ? <polygon className="fc-shape" points={`${x},${y - DIA_H} ${x + DIA_W},${y} ${x},${y + DIA_H} ${x - DIA_W},${y}`} />
        : <rect className="fc-shape" x={x - w / 2} y={y - h / 2} width={w} height={h} rx={shape === 'terminal' ? h / 2 : 11} />}
      <text x={x} y={y - (isDia ? 3 : 4)} textAnchor="middle" className="fc-title">{node.title}</text>
      <text x={x} y={y + (isDia ? 13 : 13)} textAnchor="middle" className="fc-sub">{node.sub}</text>
      {note && state !== 'idle' && (
        <g transform={`translate(${notePos[0]}, ${notePos[1]})`}>
          <rect x={isDia ? 0 : -pillWidth(note)} y={-11} width={pillWidth(note)} height={20} rx={10} className="fc-note" />
          <text x={isDia ? pillWidth(note) / 2 : -pillWidth(note) / 2} y={3} textAnchor="middle" className="fc-note-text">{note}</text>
        </g>
      )}
    </g>
  );
}

function StepDetail({ beat, index, total }) {
  if (!beat) return null;
  return (
    <div className="fc-detail">
      <div className="fc-detail-head">
        <span className="fc-step-no">Step {index + 1} / {total}</span>
        <span className="fc-step-node">{NODE_LABEL[beat.node]}</span>
      </div>
      <h3>{beat.title}</h3>
      <p>{beat.body}</p>

      {beat.checks && (
        <div className="fc-checks">
          {beat.checks.map((c) => (
            <div key={c.key} className={`fc-check ${c.hot ? 'hot' : ''}`}>
              <span>{c.label}</span>
              <b>{Number.isFinite(c.value) ? `${Math.round(c.value * 10) / 10}${c.unit}` : '—'}</b>
              <small>{c.hot ? '≥' : '<'} {c.limit}{c.unit} · {c.hot ? 'HOT' : 'OK'}</small>
            </div>
          ))}
        </div>
      )}

      {beat.counter != null && (
        <div className="fc-slots">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`fc-slot ${beat.counter > i ? 'on' : ''}`}>{beat.counter > i ? '✓' : i + 1}</span>
          ))}
          <span className="fc-slot-label">{beat.counter}/3 consecutive</span>
        </div>
      )}

      {beat.ladder && (
        <div className="fc-ladder">
          {[...beat.ladder.allowed].reverse().map((w) => (
            <span
              key={w}
              className={`fc-rung ${String(w) === String(beat.ladder.to) ? 'to' : ''} ${String(w) === String(beat.ladder.from) ? 'from' : ''}`}
            >
              {w}
              {String(w) === String(beat.ladder.from) && <small>now</small>}
              {String(w) === String(beat.ladder.to) && <small>target</small>}
            </span>
          ))}
        </div>
      )}

      {beat.nb && (
        <div className="fc-nb">
          <code>{beat.nb.formulaStr}</code>
          <div className="fc-vetoes">
            {(beat.nb.vetoes || []).map((v, i) => (
              <span key={i} className={`fc-veto ${v.passed ? 'pass' : 'fail'}`}>
                {v.passed ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {v.label || v.name}
                {v.value ? ` (${v.value})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {beat.evidence?.rows && beat.evidence.rows.some((r) => r.before != null) && (
        <table className="fc-evidence">
          <thead><tr><th>Owned workload</th><th>Before</th><th>After</th><th>Δ</th></tr></thead>
          <tbody>
            {beat.evidence.rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.before} {r.unit}</td>
                <td>{r.after} {r.unit}</td>
                <td>{r.change >= 0 ? '+' : ''}{r.change}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Full-page flowchart of the decision algorithm, walking the exact path one
 * incident takes. Scenarios replay their simulated path; live sessions follow
 * the real backend decision trace as new ticks arrive.
 */
export default function AlgorithmFlowchart({ isLive, session, live, run, onClose }) {
  const model = useMemo(
    () => (isLive ? liveFlow(live) : scenarioFlow(session)),
    [isLive, live, session]
  );
  const total = model.beats.length;
  // Both live sessions and running scenarios are followed in real time; the
  // run's own position picks the beat until the viewer steps manually.
  const syncBeat = isLive ? total - 1 : scenarioSyncBeat(model, session, run);
  const [beat, setBeat] = useState(syncBeat);
  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(true);
  const [speed, setSpeed] = useState('standard');
  const nodeRefs = useRef({});
  const listRef = useRef(null);

  const b = Math.max(0, Math.min(beat, total - 1));
  const fs = useMemo(() => flowState(model, b), [model, b]);

  // Live: stay pinned to the newest beat while following.
  useEffect(() => {
    if (follow) setBeat(syncBeat);
  }, [follow, syncBeat]);

  useEffect(() => {
    if (!playing) return undefined;
    if (b >= total - 1) {
      setPlaying(false);
      setFollow(true);
      return undefined;
    }
    const t = setTimeout(() => setBeat((x) => Math.min(total - 1, x + 1)), speed === 'quick' ? 650 : 1300);
    return () => clearTimeout(t);
  }, [playing, b, total, speed, isLive]);

  // Keep the current node and step in view.
  useEffect(() => {
    nodeRefs.current[fs.currentNode]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    // Scroll only the step list itself so it never drags the chart away.
    const list = listRef.current;
    const el = list?.querySelector('.fc-step.current');
    if (list && el && list.scrollHeight > list.clientHeight) {
      list.scrollTo({ top: el.offsetTop - list.clientHeight / 2, behavior: 'smooth' });
    }
  }, [fs.currentNode, b]);

  const go = useCallback((i) => {
    setPlaying(false);
    setFollow(false);
    setBeat(Math.max(0, Math.min(total - 1, i)));
  }, [total]);

  const restart = useCallback(() => { setFollow(false); setBeat(0); setPlaying(true); }, []);

  const pickNode = useCallback((id) => {
    const idx = model.beats.map((x) => x.node).lastIndexOf(id);
    if (idx >= 0) go(idx);
  }, [model.beats, go]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(b + 1);
      else if (e.key === 'ArrowLeft') go(b - 1);
      else if (e.key === ' ' && e.target === document.body) { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [b, go, onClose]);

  const reachedEnd = b >= total - 1;
  const terminalReached = fs.current?.terminal;
  const verdictShown = terminalReached ? model.verdict : null;

  return createPortal(
    <div className="fc-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="studio fc-page" role="dialog" aria-modal="true" aria-label="Algorithm flowchart">
      <header className="fc-header">
        <div className="fc-heading">
          <span className="fc-eyebrow">Algorithm flowchart</span>
          <h2>{model.title}</h2>
          {model.subtitle && <span className="fc-subtitle">{model.subtitle}</span>}
        </div>
        <span className={`fc-badge ${model.source}`}>
          {model.source === 'live' && <Radio size={12} />} {model.badge}
        </span>
        <button type="button" className="btn-ghost fc-close" onClick={onClose} aria-label="Close flowchart">
          <X size={18} />
        </button>
      </header>

      <div className="fc-controls">
        <button type="button" className="btn-secondary" onClick={() => setPlaying((p) => !p)} disabled={reachedEnd && !playing}>
          {playing ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Play</>}
        </button>
        <button type="button" className="btn-secondary" onClick={() => go(b - 1)} disabled={b === 0}>
          <StepBack size={15} /> Back
        </button>
        <button type="button" className="btn-secondary" onClick={() => go(b + 1)} disabled={reachedEnd}>
          <StepForward size={15} /> Step
        </button>
        <button type="button" className="btn-secondary" onClick={restart}>
          <RotateCcw size={15} /> {isLive ? 'Replay trace' : 'Replay path'}
        </button>
        <div className="speed-toggle" role="group" aria-label="Speed">
          {['standard', 'quick'].map((s) => (
            <button key={s} type="button" className={speed === s ? 'active' : ''} onClick={() => setSpeed(s)}>
              {s === 'standard' ? 'Standard' : 'Quick'}
            </button>
          ))}
        </div>
        <button type="button" className={`btn-secondary ${follow ? 'fc-following' : ''}`} onClick={() => { setPlaying(false); setFollow(true); }}>
          <Crosshair size={15} /> {follow ? (isLive ? 'Following live' : 'Following the run') : (isLive ? 'Jump to live' : 'Back to the run')}
        </button>
        <div className="fc-progress" aria-hidden="true">
          <span style={{ width: `${total > 1 ? (b / (total - 1)) * 100 : 100}%` }} />
        </div>
        {verdictShown && <span className={`fc-verdict ${verdictShown.toLowerCase()}`}>{VERDICT_LABEL[verdictShown]}</span>}
      </div>

      <div className="fc-body">
        <div className="fc-chart">
          <svg viewBox={FLOW_VIEWBOX} className="fc-svg" role="img" aria-label="Decision flowchart">
            <defs>
              {['idle', 'done', 'current'].map((s) => (
                <marker key={s} id={`fc-arrow-${s}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className={`fc-arrow ${s}`} />
                </marker>
              ))}
            </defs>
            <text x={130} y={300} textAnchor="middle" className="fc-zone">DETECT</text>
            <text x={130} y={316} textAnchor="middle" className="fc-zone-sub">confirm sustained contention</text>
            <text x={130} y={700} textAnchor="middle" className="fc-zone">ACT &amp; VERIFY</text>
            <text x={130} y={716} textAnchor="middle" className="fc-zone-sub">one step, measured, reversible</text>
            {Object.entries(FLOW_EDGES).map(([id, e]) => (
              <FlowEdge key={id} id={id} edge={e} count={fs.edges[id] || 0} current={fs.currentEdge === id} />
            ))}
            {Object.entries(FLOW_NODES).map(([id, n]) => (
              <FlowNode
                key={id}
                id={id}
                node={n}
                st={fs.nodes[id]}
                current={fs.currentNode === id}
                onPick={pickNode}
                nodeRef={(el) => { nodeRefs.current[id] = el; }}
              />
            ))}
          </svg>
          <div className="fc-legend">
            <span><i className="lg current" /> current step</span>
            <span><i className="lg done" /> path taken</span>
            <span><i className="lg idle" /> not taken</span>
            {model.prior?.length > 0 && <span><i className="lg prior" /> happened earlier</span>}
            <span className="fc-legend-hint">Click a node to jump · ← → to step · Esc to close</span>
          </div>
          {model.priorNote && <p className="fc-prior-note">{model.priorNote}</p>}
        </div>

        <aside className="fc-side">
          <StepDetail beat={fs.current} index={b} total={total} />
          {model.waiting && (
            <p className="fc-waiting">No live decision trace yet. Start the workload from the Live Session page — this flowchart fills in as each 5-second tick arrives.</p>
          )}
          <div className="fc-steps-head">Path through the algorithm</div>
          <ol className="fc-steps" ref={listRef}>
            {model.beats.map((x, i) => (
              <li key={i} className={`fc-step ${i === b ? 'current' : i < b ? 'done' : 'todo'}`}>
                <button type="button" onClick={() => go(i)}>
                  <span className="fc-step-i">{i + 1}</span>
                  <span className="fc-step-t">{x.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
    </div>,
    document.body
  );
}
