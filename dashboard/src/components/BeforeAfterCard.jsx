import React from 'react';
import ReportButton from './ReportButton';
import { comparison } from '../actionState.mjs';

const format = value => Number.isFinite(value) ? value.toLocaleString(undefined, {maximumFractionDigits: 2}) : 'Unavailable';
export default function BeforeAfterCard({action, runMeta = {}}) {
  const data = comparison(action);
  if (!data) return <div className="comparison-card">
    <h3>No completed tuning evaluation yet.</h3>
    {action && <ReportButton run={{...runMeta,id:action.experiment_id,status:action.outcome || 'Incomplete',actions:[action]}}/>}
    <p>{action?.reason || 'Start a workload, then approve a recommendation or enable auto-tuning. Decisions use a recent baseline and 30 seconds of observed telemetry.'}</p>
  </div>;
  const fields = [['latency', 'Latency (ms)'], ['throughput', 'Throughput (TPS)'], ['cpu', 'CPU (%)'],
    ['memory', 'Memory (%)'], ['diskRead', 'Disk read (bytes / interval)'], ['diskWrite', 'Disk write (bytes / interval)']];
  return <div className="comparison-card">
    <h3>Observation result: {data.outcome || 'In progress'}</h3>
    <p>{action.reason}</p>
    <ReportButton run={{...runMeta,id:action.experiment_id, status:action.outcome || 'In progress', actions:[action]}}/>
    <div className="table-container"><table className="data-table"><thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Change</th></tr></thead>
      <tbody>{fields.map(([key, label]) => <tr key={key}><td>{label}</td><td>{format(data[key].before)}</td>
        <td>{format(data[key].after)}</td><td>{data[key].delta === null ? 'Unavailable' : `${format(data[key].delta)}%`}</td></tr>)}</tbody>
    </table></div>
  </div>;
}
