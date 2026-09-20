import { request } from './client';

export const workloadApi = {
  getStatus: () => request('/workload/status'),
};

