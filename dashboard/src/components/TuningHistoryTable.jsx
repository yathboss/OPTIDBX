import React from 'react';
import { History, Check, X, Clock } from 'lucide-react';

export default function TuningHistoryTable({ history = [] }) {
  if (!history || history.length === 0) {
    return (
      <div className="data-table-container" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <History size={32} style={{ margin: '0 auto 0.5rem', display: 'block', opacity: 0.5 }} />
        No tuning actions recorded yet.
      </div>
    );
  }

  return (
    <div className="data-table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Bottleneck</th>
            <th>Parameter</th>
            <th>Old Value</th>
            <th>New Value</th>
            <th>Status</th>
            <th>Reason / Details</th>
          </tr>
        </thead>
        <tbody>
          {history.map((item, idx) => {
            const isKept = ['KEEP', 'KEPT'].includes(item.status);
            const isRolledBack = ['ROLLBACK', 'ROLLED_BACK', 'ROLLBACK_FAILED'].includes(item.status);

            return (
              <tr key={idx}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {item.timestamp ? new Date(item.timestamp).toLocaleString() : '--'}
                </td>
                <td>
                  <span className="badge badge-amber" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                    {item.bottleneck}
                  </span>
                </td>
                <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-blue)' }}>
                  {item.parameter}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{String(item.old_value)}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{String(item.new_value)}</td>
                <td>
                  <span className={`badge ${isKept ? 'badge-green' : isRolledBack ? 'badge-rose' : 'badge-blue'}`}>
                    {isKept && <Check size={12} />}
                    {isRolledBack && <X size={12} />}
                    {item.status}
                  </span>
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
                  {item.reason}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

