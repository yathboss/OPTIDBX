export function actionState(status = {}, pending = false) {
  const bound = !!status.capabilities?.available;
  const action = status.active_action;
  return {
    canApply: !pending && bound && !!status.telemetry_available &&
      status.state === 'RECOMMENDATION_READY' &&
      !!status.recommendation?.action_id && Number.isFinite(status.recommendation?.new_value),
    approveId: status.recommendation?.action_id,
    canRollback: !pending && bound && !!action?.action?.action_id &&
      (['ACTION_APPLIED', 'OBSERVING', 'KEEP', 'ROLLBACK_FAILED'].includes(status.state) ||
       action?.outcome === 'KEEP'),
    rollbackId: action?.action?.action_id,
    canAuto: !pending && bound && !status.recovery_required,
  };
}

export function comparison(action) {
  if (!action?.before || !action?.after) return null;
  const metric = key => {
    const before = action.before[key], after = action.after[key];
    return {before, after, delta: Number.isFinite(before) && Number.isFinite(after) && before !== 0
      ? (after - before) / before * 100 : null};
  };
  return {outcome: action.outcome, latency: metric('query_latency_ms'),
    throughput: metric('throughput_tps'), cpu: metric('cpu_percent'),
    memory: metric('memory_percent'), diskRead: metric('disk_read_bytes'),
    diskWrite: metric('disk_write_bytes')};
}
