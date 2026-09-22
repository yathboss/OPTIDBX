import React, {useCallback, useEffect, useRef, useState} from 'react';
import {FlaskConical, Download, ShieldCheck} from 'lucide-react';
import {useNotice, useNotify} from './Notifications';
import {api} from '../services/api';
import ComparisonCharts from './ComparisonCharts';

const names = {NOT_EVALUATED:'Not evaluated', INCONCLUSIVE:'Inconclusive',
  IMPROVEMENT_SUPPORTED:'Improvement supported', REGRESSION_OBSERVED:'Regression observed'};
const number = value => Number.isFinite(value) ? value.toLocaleString(undefined, {maximumFractionDigits:2}) : '--';
const percent = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${number(value)}%` : '--';
const initial = {profile:'LOW', repetitions:1, warmup_seconds:5, measurement_seconds:30, initial_parallelism:2};

export default function PerformanceEvidence() {
  const [records, setRecords] = useState([]), [selected, setSelected] = useState(null);
  const [form, setForm] = useState(initial), [pending, setPending] = useState(false);
  const [error, setError] = useState(null), [loadError, setLoadError] = useState(null);
  const notify = useNotify();
  useNotice(error || loadError);
  const fetching = useRef(false), mutating = useRef(false);
  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const response = await api.getBenchmarks();
      if (response.status === 200 && Array.isArray(response.data)) {
        setRecords(response.data); setLoadError(null);
      } else setLoadError(response.message || 'Evidence unavailable');
    } finally {fetching.current = false;}
  }, []);
  useEffect(() => {refresh(); const timer = setInterval(refresh, 2000); return () => clearInterval(timer);}, [refresh]);
  const current = records.find(item => item.id === selected) || records[0];
  useNotice(current?.error);
  const active = records.find(item => ['RUNNING','CANCELLING'].includes(item.status));
  const verdict = current?.evaluation?.verdict || 'NOT_EVALUATED';
  const progress = current?.progress;
  const pilot = form.repetitions < 5 || form.measurement_seconds < 180 || form.warmup_seconds < 30;
  const invalid = !Number.isInteger(form.repetitions) || form.repetitions < 1 || form.repetitions > 10 ||
    !Number.isInteger(form.warmup_seconds) || form.warmup_seconds < 0 || form.warmup_seconds > 120 ||
    !Number.isInteger(form.measurement_seconds) || form.measurement_seconds < 30 || form.measurement_seconds > 480;
  const change = (key, value) => setForm(old => ({...old, [key]:value}));
  const mutate = async operation => {
    if (mutating.current) return;
    mutating.current = true; setPending(true); setError(null);
    try {
      const response = await operation();
      if (response.status !== 200) setError(typeof response.message === 'string' ? response.message : JSON.stringify(response.message));
      else if (response.data?.id) {notify(`Comparison ${response.data.status || 'updated'}.`, 'success');setSelected(response.data.id); setRecords(old => [response.data, ...old.filter(r => r.id !== response.data.id)]);}
      await refresh();
    } finally {mutating.current = false; setPending(false);}
  };
  return <section className="evidence-view">
    <div className="section-title"><FlaskConical size={20}/>Performance Evidence</div>
    <p>Compare unchanged PostgreSQL settings with OptiDBX auto-tuning on the same owned workload. Every claim stays linked to its runs.</p>

    <div className="summary-card evidence-form">
      <h3>Run a fair comparison</h3>
      <div className="control-group">
        <button className="btn btn-secondary" disabled={pending || !!active} onClick={() => setForm(initial)}>Pilot preset</button>
        <button className="btn btn-secondary" disabled={pending || !!active} onClick={() => setForm({...initial, repetitions:5, warmup_seconds:30, measurement_seconds:180})}>Evidence study preset</button>
      </div>
      <fieldset disabled={pending || !!active} className="evidence-fields">
        <label>Workload<select aria-label="Comparison workload" value={form.profile} onChange={e => change('profile', e.target.value)}>
          {['LOW','MEDIUM','HIGH'].map(profile => <option key={profile}>{profile}</option>)}</select></label>
        <label>Paired repetitions<input aria-label="Paired repetitions" type="number" min="1" max="10" value={form.repetitions} onChange={e => change('repetitions', Number(e.target.value))}/></label>
        <label>Warm-up per run (s)<input aria-label="Warm-up per run" type="number" min="0" max="120" value={form.warmup_seconds} onChange={e => change('warmup_seconds', Number(e.target.value))}/></label>
        <label>Measurement per run (s)<input aria-label="Measurement per run" type="number" min="30" max="480" value={form.measurement_seconds} onChange={e => change('measurement_seconds', Number(e.target.value))}/></label>
        <label>Starting parallelism<select aria-label="Starting parallelism" value={form.initial_parallelism} onChange={e => change('initial_parallelism', Number(e.target.value))}>
          {[1,2,4,6,8].map(value => <option key={value}>{value}</option>)}</select></label>
      </fieldset>
      <p><strong>{pilot ? 'Pilot: cannot support an improvement claim.' : 'Evidence study: a positive outcome is not guaranteed.'}</strong> Minimum workload time: {number(2 * form.repetitions * (form.warmup_seconds + form.measurement_seconds) / 60)} minutes, plus setup and cooldown.</p>
      <p>Each pair uses the same starting value, data and warm-up. Baseline/adaptive order is randomized and recorded. Close heavy background apps and keep the computer awake.</p>
      <div className="control-group">
        <button className="btn btn-primary" disabled={pending || !!active || invalid || !!loadError} onClick={() => mutate(() => api.startBenchmark(form))}>Start comparison</button>
        <button className="btn btn-danger" disabled={pending || !active || active?.status === 'CANCELLING'} onClick={() => mutate(api.cancelBenchmark)}>Cancel comparison</button>
        <button className="btn btn-secondary" onClick={refresh}>Refresh evidence</button>
      </div>
    </div>
    <div className="summary-card evidence-criteria">
      <h3>Success criteria fixed before the run</h3>
      <p>At least <strong>5 complete pairs</strong>, <strong>30s warm-up</strong> and <strong>180s measurement</strong> per run. The 95% paired bootstrap interval must support <strong>at least 10% higher throughput</strong> and <strong>no more than 5% worse p95 latency</strong>, with no increased error rate and an actual automatic setting change.</p>
      <p>Intervals describe variation between these runs and are exploratory with small samples. The result applies only to this query, workload level, dataset and host.</p>
    </div>
    {records.length > 0 && <label className="evidence-select">Recorded comparison<select aria-label="Recorded comparison" value={current?.id || ''} onChange={e => setSelected(e.target.value)}>
      {records.map(record => <option key={record.id} value={record.id}>{record.config?.profile} - {record.status} - {new Date(record.started_at).toLocaleString()} - {record.id.slice(0,8)}</option>)}
    </select></label>}
    <div className={`comparison-card evidence-verdict verdict-${verdict.toLowerCase()}`}>
      <span className="badge badge-blue">{current?.status || 'NO RUNS'}</span>
      <h2>{names[verdict] || 'Inconclusive'}</h2>
      <p>{current?.evaluation?.reason || 'Run a comparison to collect evidence. No performance claim has been evaluated.'}</p>
      {current?.error && <p role="alert">{current.error}</p>}
      {current && <p>{current.evaluation?.completed_pairs || 0} / {current.config?.repetitions} complete pairs evaluated</p>}
      {progress && ['RUNNING','CANCELLING'].includes(current.status) && <div aria-live="polite">
        <strong>Run {progress.run_number || 0} / {progress.total_runs || current.config.repetitions * 2}: {progress.mode || ''} - {progress.phase}</strong>
        <p>{number(progress.remaining_seconds)}s remaining in phase | Tuner: {progress.tuner_state || 'Waiting'}</p>
        <p>Workload: {number(progress.measurements?.throughput_qps)} queries/s | p95: {number(progress.measurements?.p95_latency_ms)} ms</p>
      </div>}
      {current?.evaluation?.throughput_change && <div className="comparison-grid">
        {[['throughput_change','Workload throughput'], ['p95_change','p95 latency']].map(([key,label]) => <div className="comp-col" key={key}>
          <h3>{label}</h3><strong>{percent(current.evaluation[key].mean_percent)}</strong>
          <p>{current.evaluation.completed_pairs >= 2 && current.evaluation[key].interval_95
            ? `95% interval: ${current.evaluation[key].interval_95.map(percent).join(' to ')}`
            : 'Insufficient repetitions to estimate uncertainty.'}</p>
        </div>)}
      </div>}
    </div>
    {current && <>
      <ComparisonCharts current={current} />
      <div className="control-group evidence-exports">
        <a className="btn btn-secondary" href={api.benchmarkExport(current.id)}><Download size={14}/>Download JSON</a>
        <a className="btn btn-secondary" href={api.benchmarkExport(current.id, 'csv')}><Download size={14}/>Download CSV</a>
      </div>
      <div className="table-container"><table className="data-table"><thead><tr>
        <th>Pair / mode</th><th>Run status</th><th>Queries/s</th><th>Median ms</th><th>p95 ms</th><th>Errors / timeouts</th><th>Actions</th>
      </tr></thead><tbody>{current.runs.map((run,index) => <tr key={index}>
        <td>{run.pair + 1} / {run.mode}<br/>Experiment #{run.experiment_id ?? '--'}</td><td>{run.status}</td>
        <td>{number(run.metrics?.throughput_qps)}</td><td>{number(run.metrics?.median_latency_ms)}</td><td>{number(run.metrics?.p95_latency_ms)}</td>
        <td>{number(run.metrics?.errors)} / {number(run.metrics?.timeouts)}</td>
        <td>{run.actions?.length ? run.actions.map(action => <div key={action.action?.action_id}>{action.action?.old_value} → {action.action?.new_value}: {action.outcome || action.state}</div>) : 'No applied action'}</td>
      </tr>)}</tbody></table></div>
      <div className="summary-card"><h3><ShieldCheck size={16}/>Safety evidence is separate from speed</h3>
        <p>A verified rollback shows recovery worked. It does not mean the workload became faster. Action waits and failed tuning attempts count in the measured comparison.</p>
        <details><summary>Reproduction details and frozen configuration</summary><pre className="evidence-manifest">{JSON.stringify({config:current.config, criteria:current.criteria, seed:current.seed, order:current.order, manifest:current.manifest}, null, 2)}</pre></details>
      </div>
    </>}
  </section>;
}
