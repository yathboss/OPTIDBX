/**
 * OptiDBX API Client
 * Manages communication with FastAPI backend (http://localhost:8000)
 * Includes graceful mock fallback to prevent UI crashes if backend is offline.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Fallback mock telemetry adhering strictly to the shared contract
export const FALLBACK_METRICS = {
  timestamp: new Date().toISOString(),
  os: {
    cpu_percent: 72.4,
    memory_percent: 61.8,
    disk_read_bytes: 1048576,
    disk_write_bytes: 524288,
    context_switches: 2180,
  },
  db: {
    query_latency_ms: 130.5,
    throughput_tps: 520.0,
    temp_files_bytes: 10485760,
    active_workers: 4,
  },
};

export const FALLBACK_TUNER_STATUS = {
  mode: 'recommendation',
  state: 'monitoring',
  detected_bottleneck: 'CPU_PARALLELISM',
  reason: 'High CPU (>70%) and elevated context switches with active parallel workers',
  recommended_action: 'Reduce max_parallel_workers_per_gather from 8 to 4',
  observation_remaining_seconds: 0,
  cooldown_remaining_seconds: 0,
};

export const FALLBACK_TUNING_HISTORY = [
  {
    timestamp: new Date(Date.now() - 12 * 60000).toISOString(),
    bottleneck: 'CPU_PARALLELISM',
    parameter: 'max_parallel_workers_per_gather',
    old_value: 8,
    new_value: 4,
    status: 'KEPT',
    reason: 'Sustained CPU contention; latency dropped 28%',
  },
  {
    timestamp: new Date(Date.now() - 35 * 60000).toISOString(),
    bottleneck: 'WORK_MEM_SPILL',
    parameter: 'work_mem',
    old_value: '4MB',
    new_value: '16MB',
    status: 'KEPT',
    reason: 'Temporary files exceeded 10MB during hash aggregation',
  },
  {
    timestamp: new Date(Date.now() - 70 * 60000).toISOString(),
    bottleneck: 'CPU_PARALLELISM',
    parameter: 'max_parallel_workers_per_gather',
    old_value: 4,
    new_value: 2,
    status: 'ROLLED_BACK',
    reason: 'Workload shifted to single-query analytical; latency increased by 15%',
  },
];

export const FALLBACK_EXPERIMENTS = [
  {
    id: 'exp-001',
    name: 'TPC-B Mixed Workload (Scale 50)',
    workload_type: 'mixed',
    status: 'completed',
    created_at: new Date(Date.now() - 120 * 60000).toISOString(),
    duration_seconds: 300,
    before_metrics: {
      query_latency_ms: 210.4,
      throughput_tps: 410.0,
      cpu_percent: 84.5,
    },
    after_metrics: {
      query_latency_ms: 142.1,
      throughput_tps: 560.2,
      cpu_percent: 68.0,
    },
    overall_result: 'IMPROVED',
  },
  {
    id: 'exp-002',
    name: 'Heavy Hash-Aggregate Spill Test',
    workload_type: 'analytical',
    status: 'completed',
    created_at: new Date(Date.now() - 240 * 60000).toISOString(),
    duration_seconds: 180,
    before_metrics: {
      query_latency_ms: 450.0,
      throughput_tps: 120.0,
      cpu_percent: 75.0,
    },
    after_metrics: {
      query_latency_ms: 210.0,
      throughput_tps: 230.0,
      cpu_percent: 62.0,
    },
    overall_result: 'IMPROVED',
  },
];

async function fetchWithFallback(url, options, fallbackData) {
  try {
    const res = await fetch(`${API_BASE_URL}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { data, isLive: true };
  } catch (err) {
    // Graceful fallback to prevent UI failure
    return { data: fallbackData, isLive: false, error: err.message };
  }
}

export const api = {
  checkHealth: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      return res.ok;
    } catch {
      return false;
    }
  },

  getCurrentMetrics: () => fetchWithFallback('/metrics/current', {}, FALLBACK_METRICS),

  getMetricsHistory: (limit = 20) =>
    fetchWithFallback(`/metrics/history?limit=${limit}`, {}, []),

  getTunerStatus: () => fetchWithFallback('/tuner/status', {}, FALLBACK_TUNER_STATUS),

  setTunerMode: (mode) =>
    fetchWithFallback(
      '/tuner/mode',
      {
        method: 'POST',
        body: JSON.stringify({ mode }),
      },
      { ...FALLBACK_TUNER_STATUS, mode }
    ),

  toggleMonitoring: (active) =>
    fetchWithFallback(
      `/tuner/toggle-monitoring?active=${active}`,
      { method: 'POST' },
      { ...FALLBACK_TUNER_STATUS, state: active ? 'monitoring' : 'idle' }
    ),

  getTuningHistory: () => fetchWithFallback('/tuning/history', {}, FALLBACK_TUNING_HISTORY),

  getExperiments: () => fetchWithFallback('/experiments', {}, FALLBACK_EXPERIMENTS),
};

