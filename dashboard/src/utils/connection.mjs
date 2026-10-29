/**
 * OptiDBX Connection & Health State Utility
 */

export function formatPing(pingMs) {
  if (pingMs === null || pingMs === undefined || !Number.isFinite(Number(pingMs))) {
    return null;
  }
  const ms = Math.round(Number(pingMs));
  return `${ms} ms`;
}

export function getConnectionState(isLive, isWaiting, telemetryAvailable, pingMs = null) {
  if (!isLive) {
    return {
      status: 'offline',
      variant: 'error',
      badgeClass: 'badge-rose',
      label: 'Backend Offline (Port 8000)',
      description: 'FastAPI telemetry backend is unreachable. Start via uvicorn backend.main:app.',
      isHealthy: false,
      ping: null,
    };
  }

  if (isWaiting || !telemetryAvailable) {
    return {
      status: 'waiting',
      variant: 'warning',
      badgeClass: 'badge-amber',
      label: 'Waiting for Telemetry',
      description: 'Backend connected; awaiting next valid paired OS and PostgreSQL interval.',
      isHealthy: true,
      ping: formatPing(pingMs),
    };
  }

  return {
    status: 'active',
    variant: 'success',
    badgeClass: 'badge-green',
    label: 'Live Telemetry Active',
    description: 'PostgreSQL and Linux OS metrics flowing normally at 5-second intervals.',
    isHealthy: true,
    ping: formatPing(pingMs),
  };
}
