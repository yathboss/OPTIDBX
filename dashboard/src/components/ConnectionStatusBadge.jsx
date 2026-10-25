import React from 'react';
import { getConnectionState } from '../utils/connection.mjs';

export default function ConnectionStatusBadge({ isLive, isWaiting, telemetryAvailable, pingMs = null }) {
  const state = getConnectionState(isLive, isWaiting, telemetryAvailable, pingMs);

  const getIndicatorColor = () => {
    if (state.variant === 'error') return 'var(--accent-rose)';
    if (state.variant === 'warning') return 'var(--accent-amber)';
    return 'var(--accent-green)';
  };

  return (
    <div
      className={`badge ${state.badgeClass}`}
      title={state.description}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'default' }}
    >
      <span className="pulse-indicator" style={{ backgroundColor: getIndicatorColor() }} />
      <span>{state.label}</span>
      {state.ping && (
        <span style={{ opacity: 0.75, fontSize: '0.75rem', marginLeft: '4px' }}>
          ({state.ping})
        </span>
      )}
    </div>
  );
}
