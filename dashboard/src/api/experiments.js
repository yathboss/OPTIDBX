import { request } from './client';

export const experimentsApi = {
  list: () => request('/experiments'),
  getDetail: (id) => request(`/experiments/${id}`),
};

