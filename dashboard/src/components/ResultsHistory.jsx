import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, Inbox, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { useNotice } from './Notifications';
import BeforeAfterCard from './BeforeAfterCard';
import ReportButton from './ReportButton';
import { listSessions, clearSessions } from '../sessionHistory.mjs';
import { printSessionReport, EvidenceChart } from './SessionRunner';
import { VERDICTS } from '../scenarios.mjs';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

export default function ResultsHistory({ experiments = [], error }) {
  const [simulated, setSimulated] = useState(() => listSessions());
  const [selected, setSelected] = useState(null); // {source, id}
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  useNotice(error || detailError);

  useEffect(() => { setSimulated(listSessions()); }, [experiments]);

  useEffect(() => {
    if (!selected || selected.source !== 'LIVE') return;
    let cancelled = false;
    api.getExperimentDetail(selected.id).then((result) => {
      if (cancelled) return;
      setDetail(result.data);
      setDetailError(result.status === 200 ? null : result.message);
    });
    return () => { cancelled = true; };
  }, [selected]);

  const rows = useMemo(() => {
    const live = experiments.map((run) => ({
      source: 'LIVE', id: run.id, title: `Session #${run.id}`,
      subtitle: run.name || 'Live PostgreSQL session', profile: run.workload_type || '—',
      status: run.status, when: run.ended_at || run.started_at, raw: run,
    }));
    const sim = simulated.map((s) => ({
      source: 'SIMULATED', id: s.id, title: s.title, subtitle: s.subtitle,
      profile: s.category || '—', status: s.verdict, when: s.completed_at, raw: s,
    }));
    return [...live, ...sim].sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0));
  }, [experiments, simulated]);

  const selectedSim = selected?.source === 'SIMULATED'
    ? simulated.find((s) => s.id === selected.id) : null;

  return (
    <section className="results-history">
      <p className="section-eyebrow">Results &amp; History</p>
      <h2 className="section-heading">Every session, with its evidence</h2>
      <p className="section-sub">
        Live sessions are recorded in PostgreSQL; simulated scenario walkthroughs are kept
        locally and clearly labelled. Open any session to see its before/after data and
        download a PDF report.
      </p>

      {!rows.length && (
        <div className="empty-state">
          <Inbox size={26} />
          <h3>No sessions yet</h3>
          <p>Run a demo scenario from Home, or start a Live Session, and it will appear here.</p>
        </div>
      )}

      {!!rows.length && (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Session</th><th>Type</th><th>Workload</th><th>Outcome</th><th>When</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.source}-${r.id}`}>
                  <td><strong>{r.title}</strong><br /><span className="muted">{r.subtitle}</span></td>
                  <td><span className={`kind-badge ${r.source === 'LIVE' ? 'kind-live' : 'kind-sim'}`}>{r.source === 'LIVE' ? 'Live' : 'Simulated'}</span></td>
                  <td>{r.profile}</td>
                  <td>{VERDICTS[r.status]?.label || r.status || '—'}</td>
                  <td>{fmt(r.when)}</td>
                  <td><button className="btn-secondary" onClick={() => { setSelected({ source: r.source, id: r.id }); setDetail(null); }}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Simulated detail */}
      {selectedSim && (
        <div className="detail-panel">
          <div className="detail-head">
            <div><span className="kind-badge kind-sim">Simulated</span><h3>{selectedSim.title}</h3><p className="muted">{selectedSim.headline}</p></div>
            <button className="btn-primary" onClick={() => printSessionReport(
              { kind: 'scripted', id: selectedSim.scenarioId, title: selectedSim.title, subtitle: selectedSim.subtitle, category: selectedSim.category },
              { verdict: selectedSim.verdict, headline: selectedSim.headline, detail: selectedSim.detail, evidence: selectedSim.evidence },
            )}><FileDown size={16} /> Download PDF</button>
          </div>
          <p>{selectedSim.detail}</p>
          <EvidenceChart evidence={selectedSim.evidence} />
        </div>
      )}

      {/* Live detail */}
      {selected?.source === 'LIVE' && detail && (
        <div className="detail-panel">
          <div className="detail-head">
            <div><span className="kind-badge kind-live">Live</span><h3>Session #{detail.id}</h3>
              <p className="muted">Averages: latency {detail.aggregate_metrics?.query_latency_ms?.toFixed(2) ?? 'Unavailable'} ms · throughput {detail.aggregate_metrics?.throughput_tps?.toFixed(2) ?? 'Unavailable'} TPS</p></div>
            <ReportButton run={detail} />
          </div>
          {detail.actions?.length
            ? detail.actions.map((action) => <BeforeAfterCard key={action.action_id} action={action} runMeta={detail} />)
            : <p>No tuning action was applied in this session — no change was warranted.</p>}
        </div>
      )}

      {!!simulated.length && (
        <p className="history-tools">
          <button className="btn-ghost" onClick={() => { clearSessions(); setSimulated([]); setSelected(null); }}>
            <Trash2 size={14} /> Clear simulated history
          </button>
        </p>
      )}

    </section>
  );
}
