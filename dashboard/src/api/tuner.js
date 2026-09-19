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
};

