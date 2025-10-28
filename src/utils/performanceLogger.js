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

function resolveLogMode(metadataMode) {
  const envMode = process.env.PERF_LOG_MODE?.toLowerCase();
  const mode = metadataMode?.toLowerCase() || envMode || 'summary';

  if (['verbose', 'summary', 'silent'].includes(mode)) {
    return mode;
  }

  return 'summary';
}

function logDuration(metricName, startTime, metadata = {}) {
  const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
  const { logMode, publicFields, ...restMetadata } = metadata;
  const mode = resolveLogMode(logMode);

  if (mode === 'silent') {
    return durationMs;
  }

  const status = restMetadata.status || 'success';
  const verificationMethod = restMetadata.verificationMethod;
  const errorInfo = restMetadata.error;

  const restWithStatus = { ...restMetadata, status };

  const summaryFields = Array.isArray(publicFields) ? publicFields : [];
  const summary = { status, durationMs };

  const shouldAliasMethod = verificationMethod && !summaryFields.includes('verificationMethod');

  if (shouldAliasMethod) {
    summary.method = verificationMethod;
  }

  for (const field of summaryFields) {
    if (Object.prototype.hasOwnProperty.call(restWithStatus, field)) {
      summary[field] = restWithStatus[field];
    }
  }

  if (status === 'error' && errorInfo) {
    summary.error = errorInfo;
  }

  const hiddenKeys = Object.keys(restWithStatus).filter(key => {
    if (key === 'status' || key === 'verificationMethod' || key === 'error') {
      return false;
    }
    return !summaryFields.includes(key);
  });

  if (mode !== 'verbose' && hiddenKeys.length > 0) {
    summary.details = 'hidden';
  }

  const payload = mode === 'verbose'
    ? { ...restWithStatus, durationMs }
    : summary;

  const metadataString = formatMetadata(payload);
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
