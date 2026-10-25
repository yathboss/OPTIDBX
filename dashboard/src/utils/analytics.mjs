/**
 * OptiDBX Telemetry Analytics & Threshold Utilities
 * Provides analytical routines for telemetry trend detection, threshold severity,
 * moving average smoothing, and memory safety risk scoring.
 */

export function getMetricSeverity(value, warningThreshold, criticalThreshold, lowerIsBetter = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 'normal';
  }
  const num = Number(value);
  if (!lowerIsBetter) {
    if (num >= criticalThreshold) return 'critical';
    if (num >= warningThreshold) return 'warning';
    return 'normal';
  } else {
    if (num <= criticalThreshold) return 'critical';
    if (num <= warningThreshold) return 'warning';
    return 'normal';
  }
}

export function computeMovingAverage(dataPoints = [], key = 'value', windowSize = 5) {
  if (!Array.isArray(dataPoints) || dataPoints.length === 0 || windowSize <= 0) {
    return [];
  }
  const result = [];
  for (let i = 0; i < dataPoints.length; i++) {
    const windowStart = Math.max(0, i - windowSize + 1);
    const windowSlice = dataPoints.slice(windowStart, i + 1);
    const validValues = windowSlice
      .map(pt => (typeof pt === 'object' && pt !== null ? pt[key] : pt))
      .filter(v => Number.isFinite(Number(v)))
      .map(Number);

    if (validValues.length === 0) {
      result.push(null);
    } else {
      const avg = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
      result.push(parseFloat(avg.toFixed(2)));
    }
  }
  return result;
}

export function detectSpillBottleneck(tempFilesBytes, thresholdBytes = 1048576) {
  if (tempFilesBytes === null || tempFilesBytes === undefined) return false;
  return Number(tempFilesBytes) >= thresholdBytes;
}

export function calculateMemorySafetyScore(memoryPercent, swapPercent = 0, maxMemoryThreshold = 85) {
  const mem = Number.isFinite(Number(memoryPercent)) ? Number(memoryPercent) : 0;
  const swap = Number.isFinite(Number(swapPercent)) ? Number(swapPercent) : 0;

  // Composite risk calculation: memory weight 0.7, swap weight 0.3
  const compositeUsage = mem * 0.7 + swap * 0.3;
  const isSafe = mem < maxMemoryThreshold && swap < 50;

  let pressure = 'low';
  if (compositeUsage >= 80 || mem >= maxMemoryThreshold) {
    pressure = 'high';
  } else if (compositeUsage >= 60 || mem >= 70) {
    pressure = 'moderate';
  }

  return {
    safe: isSafe,
    compositeUsage: parseFloat(compositeUsage.toFixed(1)),
    pressure,
  };
}

export function summarizeTelemetryTrend(history = [], key = 'cpu_percent') {
  if (!Array.isArray(history) || history.length < 2) return null;
  const valid = history
    .map(h => (typeof h === 'object' && h !== null ? h[key] : null))
    .filter(v => Number.isFinite(Number(v)))
    .map(Number);

  if (valid.length < 2) return null;
  const first = valid[0];
  const last = valid[valid.length - 1];
  if (first === 0) return null;

  const pctChange = ((last - first) / first) * 100;
  const sign = pctChange > 0 ? '+' : '';
  return `${sign}${pctChange.toFixed(1)}%`;
}
