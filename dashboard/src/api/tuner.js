import { request } from './client';

export const tunerApi = {
  getStatus: () => request('/tuner/status'),
  getLiveStatus: () => request('/tuner/live-status'),
  setMode: (mode) =>
    request('/tuner/mode', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
  toggleMonitoring: (active) =>
    request(`/tuner/toggle-monitoring?active=${active}`, {
      method: 'POST',
    }),
  getTuningHistory: () => request('/tuning/history'),
  approve: (id) => request(`/tuner/actions/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
  applyRecommended: () => request('/tuner/apply-recommended', { method: 'POST' }),
  rollback: (id) => request(`/tuner/actions/${encodeURIComponent(id)}/rollback`, { method: 'POST' }),
  rollbackLast: () => request('/tuner/rollback-last', { method: 'POST' }),
};

