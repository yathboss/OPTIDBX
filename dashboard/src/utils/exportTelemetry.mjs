/**
 * OptiDBX Telemetry Export Utilities
 * Converts runtime metric intervals and tuning decisions into standardized
 * CSV and JSON reports for evaluation reporting and offline analysis.
 */

export function escapeCSVField(field) {
  if (field === null || field === undefined) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportTelemetryToCSV(history = []) {
  const headers = [
    'timestamp',
    'cpu_percent',
    'memory_percent',
    'throughput_tps',
    'query_latency_ms',
    'disk_read_bytes',
    'disk_write_bytes',
    'temp_files_bytes',
    'active_connections',
  ];

  if (!Array.isArray(history) || history.length === 0) {
    return headers.join(',');
  }

  const rows = history.map(item => {
    return [
      escapeCSVField(item.timestamp || item.ts || ''),
      escapeCSVField(item.cpu_percent ?? item.cpu ?? ''),
      escapeCSVField(item.memory_percent ?? item.memory ?? ''),
      escapeCSVField(item.throughput_tps ?? item.tps ?? ''),
      escapeCSVField(item.query_latency_ms ?? item.latency ?? ''),
      escapeCSVField(item.disk_read_bytes ?? ''),
      escapeCSVField(item.disk_write_bytes ?? ''),
      escapeCSVField(item.temp_files_bytes ?? item.temp_bytes ?? ''),
      escapeCSVField(item.active_connections ?? ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function exportTuningHistoryToCSV(tuningHistory = []) {
  const headers = [
    'action_id',
    'timestamp',
    'knob',
    'action_type',
    'old_value',
    'new_value',
    'outcome',
    'bottleneck',
    'reason',
  ];

  if (!Array.isArray(tuningHistory) || tuningHistory.length === 0) {
    return headers.join(',');
  }

  const rows = tuningHistory.map(entry => {
    const act = entry.action || {};
    return [
      escapeCSVField(entry.action_id || act.action_id || ''),
      escapeCSVField(entry.timestamp || act.timestamp || ''),
      escapeCSVField(act.target || act.knob || entry.knob || ''),
      escapeCSVField(act.action_type || entry.action_type || ''),
      escapeCSVField(act.old_value ?? entry.before_value ?? ''),
      escapeCSVField(act.new_value ?? entry.after_value ?? ''),
      escapeCSVField(entry.outcome || 'PENDING'),
      escapeCSVField(entry.bottleneck || act.bottleneck || ''),
      escapeCSVField(entry.reason || entry.evaluation_reason || ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function exportTelemetryToJSON(history = [], metadata = {}) {
  const payload = {
    exportDate: new Date().toISOString(),
    system: 'OptiDBX Safe V1 Autotuner',
    metadata,
    count: Array.isArray(history) ? history.length : 0,
    records: Array.isArray(history) ? history : [],
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadFile(filename, content, mimeType = 'text/plain') {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
