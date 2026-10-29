/**
 * OptiDBX Telemetry & Metric Formatting Utilities
 * Provides safe, robust data formatting with graceful null/NaN handling.
 */

export function formatBytes(bytes, decimals = 1) {
  if (bytes === null || bytes === undefined || !Number.isFinite(Number(bytes))) {
    return 'N/A';
  }
  const b = Number(bytes);
  if (b === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(b)) / Math.log(k));
  const idx = Math.min(Math.max(i, 0), sizes.length - 1);
  const formatted = parseFloat((b / Math.pow(k, idx)).toFixed(dm));
  return `${formatted} ${sizes[idx]}`;
}

export function formatBytesToMB(bytes, decimals = 1) {
  if (bytes === null || bytes === undefined || !Number.isFinite(Number(bytes))) {
    return null;
  }
  return (Number(bytes) / (1024 * 1024)).toFixed(decimals);
}

export function formatPercent(val, decimals = 1) {
  if (val === null || val === undefined || !Number.isFinite(Number(val))) {
    return 'N/A';
  }
  return `${Number(val).toFixed(decimals)}%`;
}

export function formatLatency(ms, decimals = 2) {
  if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) {
    return 'N/A';
  }
  return `${Number(ms).toFixed(decimals)} ms`;
}

export function formatThroughput(tps, decimals = 1) {
  if (tps === null || tps === undefined || !Number.isFinite(Number(tps))) {
    return 'N/A';
  }
  return `${Number(tps).toFixed(decimals)} tps`;
}

export function formatDelta(delta, decimals = 1) {
  if (delta === null || delta === undefined || !Number.isFinite(Number(delta))) {
    return null;
  }
  const num = Number(delta);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(decimals)}%`;
}

export function formatTimestamp(isoString) {
  if (!isoString) return 'N/A';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return 'N/A';
  }
}
