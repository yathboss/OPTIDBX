import React, {useRef, useState, useEffect} from 'react';
import {createPortal} from 'react-dom';
import {buildReport, reportCsv} from '../demoModel.mjs';

const format = value => Number.isFinite(value) ? value.toLocaleString(undefined, {maximumFractionDigits:2}) : 'Unavailable';
function download(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Preview({report, onClose}) {
  const dialog = useRef(null);
  useEffect(() => {dialog.current.showModal(); return () => dialog.current?.close();}, []);
  return createPortal(<><dialog ref={dialog} className="report-dialog" aria-label="Tuning observation report" onCancel={onClose}>
    <div className="report-toolbar">
      <button className="btn btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
      <button className="btn btn-secondary" onClick={() => download(JSON.stringify(report,null,2),'application/json',`optidbx-${report.experiment_id ?? 'action'}.json`)}>Download JSON</button>
      <button className="btn btn-secondary" onClick={() => download(reportCsv(report),'text/csv',`optidbx-${report.experiment_id ?? 'action'}.csv`)}>Download CSV</button>
      <button className="btn btn-secondary" onClick={onClose}>Close report</button>
    </div>
    <ReportContent report={report}/>
  </dialog><div className="print-export"><ReportContent report={report}/></div></>, document.body);
}
function ReportContent({report}) {
  return (
    <article className="print-report">
      <p className="eyebrow">OPTIDBX • MEASURED EVIDENCE</p><h1>Tuning observation report</h1>
      <p>Experiment #{report.experiment_id ?? 'Unavailable'} · {report.profile} · {report.status}</p>
      <p>Generated: {report.generated_at} · Started: {report.started_at ?? 'Unavailable'} · Ended: {report.ended_at ?? 'Unavailable'}</p>
      {!report.actions.length && <p>No tuning action was recorded. No before/after improvement can be calculated.</p>}
      {report.actions.map((record, i) => <section key={i}>
        <h2>{record.outcome || 'Observation incomplete'}</h2>
        <p>{record.reason || 'No decision reason recorded.'}</p>
        <p>Decision source: {record.evaluation_source || 'Legacy database telemetry'} · Policy: {record.keep_policy || 'Legacy tolerance rules'}</p>
        {record.evaluation_source === 'OWNED_WORKLOAD' && <p>Owned queries: {record.before_owned?.successful_queries ?? 'Unavailable'} before / {record.after_owned?.successful_queries ?? 'Unavailable'} after · Window: {record.owned_window_seconds ?? 'Unavailable'}s · Warm-up required: {record.baseline_warmup_seconds ?? 'Unavailable'}s</p>}
        <p>Action: {record.action?.action_id ?? record.action_id ?? 'Unavailable'}<br/>
          Setting: {record.action?.parameter || 'max_parallel_workers_per_gather'} · {record.action?.old_value ?? 'Unavailable'} → {record.action?.new_value ?? 'Unavailable'}</p>
        <p>Execution: {record.automatic === true ? 'Automatic' : record.automatic === false ? 'Manually approved' : 'Unavailable'} · Scope: {record.scope?.scope ?? 'Unavailable'} · Bound sessions: {record.scope?.sessions?.length ?? 'Unavailable'}<br/>Action timestamp: {record.action?.timestamp ?? 'Unavailable'} · Observed duration: {format(record.observation_elapsed_seconds)} seconds</p>
        <p>Verified applied value: {record.verified_applied_value ?? 'Unavailable'} · Verified restored value: {record.verified_restored_value ?? 'Unavailable'}</p>
        <p>Baseline samples: {record.baseline_samples ?? 'Unavailable'} · Observation samples: {record.observation_samples ?? 'Unavailable'}<br/>
          Baseline window: {record.baseline_started_at ?? 'Unavailable'} — {record.baseline_ended_at ?? 'Unavailable'}</p>
        <div className="table-container"><table className="data-table"><thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Difference</th><th>Change</th></tr></thead>
          <tbody>{record.metrics.map(m => <tr key={m.key}><td>{m.label}<small>{m.unit}</small></td><td>{format(m.before)}</td><td>{format(m.after)}</td><td>{format(m.difference)}</td><td>{m.percent === null ? 'Unavailable' : `${format(m.percent)}%`}</td></tr>)}</tbody></table></div>
        <p>Negative latency change means faster responses. Positive throughput change means more database transactions. Resource changes are descriptive, not performance verdicts.</p>
      </section>)}
      <h2>Scope & limitations</h2><ul>{report.limitations.map(text => <li key={text}>{text}</li>)}</ul>
    </article>
  );
}
export default function ReportButton({run}) {
  const [report,setReport] = useState(null);
  return <><button className="btn btn-primary" onClick={() => setReport(buildReport(run))}>Generate Report</button>
    {report && <Preview report={report} onClose={() => setReport(null)}/>}</>;
}
