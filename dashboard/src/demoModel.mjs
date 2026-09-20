const fields = [
  ['query_latency_ms', 'Query latency', 'ms'],
  ['throughput_tps', 'Database throughput', 'TPS (database-wide)'],
  ['cpu_percent', 'CPU utilization', '%'],
  ['memory_percent', 'Memory utilization', '%'],
  ['disk_read_bytes', 'Disk read', 'bytes / interval'],
  ['disk_write_bytes', 'Disk write', 'bytes / interval'],
];
const finite = value => Number.isFinite(value) ? value : null;

export function buildReport(run) {
  // Freeze the evidence at the moment of generation, independent of live polling.
  const source = JSON.parse(JSON.stringify(run));
  return {
    version: 1, generated_at: new Date().toISOString(), experiment_id: source.id ?? null,
    status: source.status ?? 'Unavailable', profile: source.workload_type ?? source.profile ?? 'Unavailable',
    started_at: source.started_at ?? null, ended_at: source.ended_at ?? null,
    actions: (source.actions || []).map(record => ({...record,
      metrics: fields.map(([key, label, unit]) => {
        const before = finite(record.before?.[key]), after = finite(record.after?.[key]);
        return {key, label, unit, before, after,
          difference: before !== null && after !== null ? after - before : null,
          percent: before !== null && after !== null && before !== 0 ? (after - before) / before * 100 : null};
      }),
    })),
    limitations: [
      'A before/after observation does not establish causation or a general performance improvement.',
      'Throughput is database-wide TPS, not direct owned-workload queries per second. Other activity can affect telemetry.',
      'OS settings were not automatically tuned. Missing values are unavailable, never zero-filled.',
      'Use a completed paired evidence study for a stronger performance claim. KEEP alone is not proof.',
    ], source,
  };
}

export function reportCsv(report) {
  const cell = value => {
    let text = value == null ? 'Unavailable' : String(value);
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [['Experiment', 'Action', 'Outcome', 'Metric', 'Unit', 'Before', 'After', 'Difference', 'Change %']];
  for (const record of report.actions) for (const m of record.metrics) rows.push([
    report.experiment_id, record.action?.action_id ?? record.action_id, record.outcome,
    m.label, m.unit, m.before, m.after, m.difference, m.percent,
  ]);
  if (!report.actions.length) rows.push([report.experiment_id, 'No action recorded', report.status]);
  return rows.map(row => row.map(cell).join(',')).join('\r\n');
}

export function phaseIndex(state, running) {
  if (['KEEP', 'ROLLBACK', 'ROLLBACK_FAILED', 'COOLDOWN'].includes(state)) return 5;
  if (state === 'OBSERVING') return 4;
  if (state === 'ACTION_APPLIED') return 3;
  if (state === 'RECOMMENDATION_READY') return 2;
  return running ? 1 : 0;
}
