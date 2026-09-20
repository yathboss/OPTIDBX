/**
 * OptiDBX API Service (Phase 2)
 * Manages communication with FastAPI backend (http://localhost:8000)
 * Connects directly to real OS, DB, Workload, and Autotuner endpoints.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });

    if (res.status === 503) {
      // Backend is running, but real telemetry interval is waiting/priming
      const body = await res.json().catch(() => ({}));
      return {
        data: null,
        isLive: true,
        isWaiting: true,
        status: 503,
        message: body.detail || 'Waiting for real telemetry sample...',
      };
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        data: null,
        isLive: false,
        isWaiting: false,
        status: res.status,
        message: body.detail || `HTTP Error ${res.status}`,
      };
    }

    const data = await res.json();
    return { data, isLive: true, isWaiting: false, status: 200 };
  } catch (err) {
    return {
      data: null,
      isLive: false,
      isWaiting: false,
      status: 0,
      message: err.message || 'Backend unreachable',
    };
  }
}

export const api = {
  getBenchmarks: () => request('/benchmarks'),
  startBenchmark: config => request('/benchmarks/start', {method:'POST', body:JSON.stringify(config)}),
  cancelBenchmark: () => request('/benchmarks/cancel', {method:'POST'}),
  benchmarkExport: (id, format='json') => `${API_BASE_URL}/benchmarks/${encodeURIComponent(id)}/export?format=${format}`,
  checkHealth: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      return res.ok;
    } catch {
      return false;
    }
  },

  // Real Telemetry Endpoints
  getCurrentMetrics: () => request('/metrics/current'),

  getMetricsHistory: (limit = 20, experimentId = null) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (experimentId !== null) params.append('experiment_id', String(experimentId));
    return request(`/metrics/history?${params.toString()}`);
  },

  getOsHistory: (limit = 20, experimentId = null) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (experimentId !== null) params.append('experiment_id', String(experimentId));
    return request(`/metrics/os/history?${params.toString()}`);
  },

  getDbHistory: (limit = 20, experimentId = null) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (experimentId !== null) params.append('experiment_id', String(experimentId));
    return request(`/metrics/db/history?${params.toString()}`);
  },

  // Real Autotuner Endpoints
  getTunerStatus: () => request('/tuner/status'),

  getLiveTunerStatus: () => request('/tuner/live-status'),

  setTunerMode: (mode) =>
    request('/tuner/mode', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  toggleMonitoring: (active) =>
    request(`/tuner/toggle-monitoring?active=${active}`, {
      method: 'POST',
    }),

  getTuningHistory: () => request('/tuning/history'),

  // Real Workload & Experiment Endpoints
  getWorkloadStatus: () => request('/workload/status'),
  startWorkload: (profile, duration_seconds) => request('/workload/start', {
    method: 'POST', body: JSON.stringify({profile, duration_seconds}),
  }),
  stopWorkload: () => request('/workload/stop', {method: 'POST'}),
  approve: id => request(`/tuner/actions/${encodeURIComponent(id)}/approve`, {method: 'POST'}),
  rollback: id => request(`/tuner/actions/${encodeURIComponent(id)}/rollback`, {method: 'POST'}),

  getExperiments: () => request('/experiments'),

  getExperimentDetail: (id) => request(`/experiments/${id}`),
};
