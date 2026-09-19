/**
 * OptiDBX API Base Client
 * Centralizes HTTP requests, error handling, and offline/waiting state detection.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });

    if (res.status === 503) {
      // Backend is online but telemetry is not ready / waiting for interval
      const errorBody = await res.json().catch(() => ({}));
      return {
        data: null,
        isLive: true,
        isWaiting: true,
        status: 503,
        message: errorBody.detail || 'Waiting for telemetry collection',
      };
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      return {
        data: null,
        isLive: false,
        status: res.status,
        message: errorBody.detail || `HTTP Error ${res.status}`,
      };
    }

    const data = await res.json();
    return { data, isLive: true, isWaiting: false, status: 200 };
  } catch (err) {
    // Network / backend unreachable
    return {
      data: null,
      isLive: false,
      isWaiting: false,
      status: 0,
      message: err.message || 'Backend connection failed',
    };
  }
}

