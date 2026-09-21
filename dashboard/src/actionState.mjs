export function actionState(status = {}, pending = false) {
  const bound = !!status.capabilities?.available;
  const action = status.active_action;
  const inActionLifecycle = ['ACTION_APPLIED', 'OBSERVING', 'COOLDOWN'].includes(status.state);
  
  const rec = status.recommendation;
  const isWorkMem = !!rec && (
    rec.target === 'work_mem' ||
    rec.knob === 'work_mem' ||
    rec.action_type === 'INCREASE_WORK_MEM' ||
    (typeof rec.action_type === 'string' && rec.action_type.includes('WORK_MEM'))
  );
  
  const memoryUnsafe = isWorkMem && status.memory_safety?.safe_for_memory_increase === false;

  return {
    canApply: !pending && bound && !!status.telemetry_available &&
      status.state === 'RECOMMENDATION_READY' &&
      !!status.recommendation?.action_id && Number.isFinite(status.recommendation?.new_value) &&
      !memoryUnsafe,
    memoryBlocked: memoryUnsafe,
    memoryReason: memoryUnsafe ? (status.memory_safety?.reason || 'Blocked due to OS memory pressure') : null,
    approveId: status.recommendation?.action_id,
    canRollback: !pending && bound && !!action?.action?.action_id &&
      (['ACTION_APPLIED', 'OBSERVING', 'KEEP', 'ROLLBACK_FAILED'].includes(status.state) ||
       action?.outcome === 'KEEP'),
    rollbackId: action?.action?.action_id,
    canAuto: !pending && bound && !status.recovery_required && !inActionLifecycle,
    inLifecycle: inActionLifecycle,
    canChangeMode: !pending && !inActionLifecycle && !status.recovery_required,
  };
}

export function comparison(action) {
  if (!action?.before || !action?.after) return null;
  const metric = key => {
    const before = action.before[key], after = action.after[key];
    return {before, after, delta: Number.isFinite(before) && Number.isFinite(after) && before !== 0
      ? (after - before) / before * 100 : null};
  };
  return {
    outcome: action.outcome,
    actionType: action.action?.action_type || action.action_type || 'UNKNOWN',
    target: action.action?.target || action.target || 'unknown',
    bottleneck: action.bottleneck || action.action?.bottleneck || (
      (action.action?.target === 'work_mem' || action.action?.action_type?.includes('WORK_MEM')) ? 'WORK_MEM_SPILL' : 'CPU_PARALLELISM'
    ),
    latency: metric('query_latency_ms'),
    throughput: metric('throughput_tps'),
    cpu: metric('cpu_percent'),
    memory: metric('memory_percent'),
    diskRead: metric('disk_read_bytes'),
    diskWrite: metric('disk_write_bytes'),
    tempFilesBytes: metric('temp_files_bytes')?.before !== undefined ? metric('temp_files_bytes') : metric('temp_bytes'),
    tempFiles: metric('temp_files'),
    contextSwitches: metric('context_switches')?.before !== undefined ? metric('context_switches') : metric('system_context_switches'),
    reason: action.reason || action.evaluation_reason || null,
  };
}
