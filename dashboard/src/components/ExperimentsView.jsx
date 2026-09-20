import React from 'react';
import { FlaskConical, CheckCircle2, Clock, Activity } from 'lucide-react';

export default function ExperimentsView({ experiments = [] }) {
  return (
    <div>
      <div className="section-title">
        <FlaskConical size={18} color="var(--accent-purple)" />
        Benchmark Experiments & Workload Evaluations
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Experiment ID</th>
              <th>Name</th>
              <th>Workload Type</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Before / After Latency</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {experiments.map((exp) => {
              const beforeLat = exp.before_metrics?.query_latency_ms;
              const afterLat = exp.after_metrics?.query_latency_ms;
              const isImproved = exp.overall_result === 'IMPROVED';

              return (
                <tr key={exp.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{exp.id}</td>
                  <td style={{ fontWeight: 500 }}>{exp.name}</td>
                  <td>
                    <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>
                      {exp.workload_type}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${exp.status === 'completed' ? 'badge-green' : 'badge-amber'}`}>
                      {exp.status === 'completed' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                      {exp.status}
                    </span>
                  </td>
                  <td>{exp.duration_seconds ? `${exp.duration_seconds}s` : '--'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {beforeLat ? (
                      <span>
                        {beforeLat} ms → {afterLat ? `${afterLat} ms` : 'Running...'}
                      </span>
                    ) : (
                      '--'
                    )}
                  </td>
                  <td>
                    {exp.overall_result ? (
                      <span className={`badge ${isImproved ? 'badge-green' : 'badge-rose'}`}>
                        {exp.overall_result}
                      </span>
                    ) : (
                      <span className="badge badge-amber">PENDING</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

