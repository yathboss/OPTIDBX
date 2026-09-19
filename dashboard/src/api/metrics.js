import { request } from './client';

export const metricsApi = {
  getCurrent: () => request('/metrics/current'),
  getHistory: (limit = 20, experimentId = null) => {
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
};

