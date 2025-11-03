import { ApiError } from '../utils/errors.js';

function createServiceError(message, options = {}) {
  const {
    name = 'ServiceError',
    statusCode = 500,
    code,
    details,
    expose,
    requiresReauth,
    cause
  } = options;

  return new ApiError(message, {
    name,
    statusCode,
    code,
    details,
    expose: expose ?? (statusCode >= 400 && statusCode < 500),
    requiresReauth,
    cause
  });
}

function throwServiceError(message, options) {
  throw createServiceError(message, options);
}

function extractGoogleReason(error) {
  const data = error?.response?.data || error?.data;
  const arrayReason = Array.isArray(data?.error?.errors) && data.error.errors.length > 0
    ? data.error.errors[0]?.reason
    : undefined;

  return (
    data?.error?.status ||
    arrayReason ||
    error?.reason ||
    error?.code ||
    undefined
  );
}

function mapGoogleApiError(error, options = {}) {
  const response = error?.response;
  const statusFromResponse =
    response?.status ??
    response?.statusCode ??
    error?.status ??
    error?.statusCode ??
    (typeof error?.code === 'number' ? error.code : undefined);

  const reason = (options.reasonOverride || extractGoogleReason(error))?.toString().toLowerCase();

  let statusCode = options.statusCode || statusFromResponse;
  let code = options.code;
  let requiresReauth = options.requiresReauth;
  let expose = options.expose;

  if (!code) {
    if (
      statusCode === 401 ||
      statusCode === 403 ||
      reason === 'unauthorized' ||
      reason === 'invalidcredentials'
    ) {
      statusCode = 401;
      code = 'GOOGLE_UNAUTHORIZED';
      requiresReauth = true;
      expose = true;
    } else if (
      statusCode === 429 ||
      reason === 'ratelimitexceeded' ||
      reason === 'quotaexceeded'
    ) {
      statusCode = 429;
      code = 'TASKS_RATE_LIMIT';
      expose = true;
    }
  }

  const defaults = {
    message: options.message || error?.message || 'Google API request failed',
    statusCode: statusCode || 502,
    code,
    name: options.name || 'GoogleApiError',
    details: options.details,
    requiresReauth,
    expose,
    cause: options.cause ?? error
  };

  const mappedError = ApiError.from(error, defaults);

  if (defaults.requiresReauth !== undefined) {
    mappedError.requiresReauth = defaults.requiresReauth === true;
  }

  if (defaults.expose !== undefined) {
    mappedError.expose = defaults.expose;
  }

  return mappedError;
}

export { ApiError, createServiceError, throwServiceError, mapGoogleApiError };
