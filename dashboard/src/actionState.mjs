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
  const owned = action.evaluation_source === 'OWNED_WORKLOAD';
  const metric = (key, useOwned = false) => {
    const before = (useOwned ? action.before_owned : action.before)?.[key], after = (useOwned ? action.after_owned : action.after)?.[key];
    return {before, after, delta: Number.isFinite(before) && Number.isFinite(after) && before !== 0
      ? (after - before) / before * 100 : null};
  };
  return {outcome: action.outcome, owned, latency: metric(owned ? 'p95_latency_ms' : 'query_latency_ms', owned),
    throughput: metric(owned ? 'qps' : 'throughput_tps', owned), cpu: metric('cpu_percent'),
    memory: metric('memory_percent'), diskRead: metric('disk_read_bytes'),
    diskWrite: metric('disk_write_bytes')};
}
