import { performance } from 'node:perf_hooks';

function startTimer() {
  return performance.now();
}

function formatMetadata(metadata = {}) {
  return Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'object') {
        try {
          return `${key}=${JSON.stringify(value)}`;
        } catch {
          return `${key}=[unserializable]`;
        }
      }
      return `${key}=${value}`;
    })
    .join(' ');
}

function logDuration(metricName, startTime, metadata = {}) {
  const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
  const normalizedMetadata = { status: metadata.status || 'success', ...metadata };
  if (!normalizedMetadata.status) {
    normalizedMetadata.status = 'success';
  }
  const metadataString = formatMetadata({ ...normalizedMetadata, durationMs });
  console.log(`⏱️  ${metricName} ${metadataString}`);
  return durationMs;
}

async function timeAsync(metricName, fn, metadata = {}) {
  const timer = startTimer();
  try {
    const result = await fn();
    logDuration(metricName, timer, { ...metadata, status: 'success' });
    return result;
  } catch (error) {
    logDuration(metricName, timer, {
      ...metadata,
      status: 'error',
      error: error?.code || error?.status || error?.message || 'unknown'
    });
    throw error;
  }
}

export { startTimer, logDuration, timeAsync };
