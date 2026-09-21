import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import BeforeAfterCard from './BeforeAfterCard';
import TimeSeriesChart from './TimeSeriesChart';
import ExperimentComparison from './ExperimentComparison';

export default function EvaluationView({experiments, error}) {
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [history, setHistory] = useState([]);
  const [detailError, setDetailError] = useState(null);
  useEffect(() => {
    if (selected === null) return;
    let cancelled = false;
    Promise.all([api.getExperimentDetail(selected), api.getMetricsHistory(100, selected)]).then(([result, series]) => {
      if (cancelled) return;
      setDetail(result.data);
      setHistory(series.data || []);
      setDetailError(result.status === 200 ? (series.status === 200 ? null : series.message) : result.message);
    });
    return () => {cancelled = true;};
  }, [selected, experiments]);
  return <section>
    <h2 className="section-title">Recorded experiments</h2>
    <p>Measurements come from PostgreSQL storage. Baseline runs have no applied-action comparison.</p>
    {error && <p role="alert">{error}</p>}
    {!error && !experiments.length && <p>No experiments recorded yet. Start a workload to record one.</p>}
    <div className="table-container"><table className="data-table"><thead><tr><th>Run</th><th>Profile</th><th>Status</th><th>Duration</th><th>Results</th></tr></thead>
      <tbody>{experiments.map(run => <tr key={run.id}><td>#{run.id} {run.name}</td><td>{run.workload_type}</td>
        <td>{run.status}</td><td>{run.duration_seconds === null ? 'In progress' : `${run.duration_seconds}s`}</td>
        <td><button className="btn btn-secondary" onClick={() => {setSelected(run.id); setDetail(null);}}>View run {run.id}</button></td></tr>)}</tbody>
    </table></div>
    {detailError && <p role="alert">{detailError}</p>}
    {detail && <div><h3>Run #{detail.id}: {detail.overall_result}</h3>
      <p>Whole-run averages: latency {detail.aggregate_metrics?.query_latency_ms?.toFixed(2) ?? 'Unavailable'} ms | throughput {detail.aggregate_metrics?.throughput_tps?.toFixed(2) ?? 'Unavailable'} TPS</p>
      {detail.actions?.length ? detail.actions.map(action => <BeforeAfterCard key={action.action_id} action={action}/>) : <p>No tuning action was applied in this run.</p>}
      <TimeSeriesChart historyData={history}/>
    </div>}

    {/* Multi-Experiment Side-by-Side Comparison (Tasks 23-28) */}
    <ExperimentComparison experiments={experiments} />
  </section>;
}

