import { getDefaultStatus } from './errorCatalog.js';

const STATUS_TITLES = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
};

function resolveStatusTitle(statusCode) {
  return STATUS_TITLES[statusCode] || 'Error';
}

function extractFromResponse(error) {
  if (!error || typeof error !== 'object') return {};

  const response = error.response;
  if (!response || typeof response !== 'object') return {};

  const status = response.status || response.statusCode;
  const data = response.data;

  const extracted = { statusCode: status };

  if (data && typeof data === 'object') {
    if (typeof data.error === 'string') {
      extracted.error = data.error;
    }
    if (typeof data.message === 'string') {
      extracted.message = data.message;
    }
    if (typeof data.code === 'string') {
      extracted.code = data.code;
    }
    if (data.details !== undefined) {
      extracted.details = data.details;
    }
    if (data.requiresReauth === true) {
      extracted.requiresReauth = true;
    }
  }

  return extracted;
}

class ApiError extends Error {
  constructor(message, options = {}) {
    super(message || options.defaultMessage || 'An unexpected error occurred');

    this.name = options.name || 'ApiError';
    const statusFromOptions = options.statusCode || options.status || getDefaultStatus(options.code);
    this.statusCode = statusFromOptions || 500;
    this.code = options.code;
    this.details = options.details;
    this.requiresReauth = options.requiresReauth === true;
    this.expose = options.expose ?? (this.statusCode >= 400 && this.statusCode < 500);
    this.cause = options.cause;
  }

  static from(error, defaults = {}) {
    if (error instanceof ApiError) {
      return error;
    }

    const responseDetails = extractFromResponse(error);

    if (error instanceof Error) {
      const code = error.code || responseDetails.code || defaults.code;
      const statusFromError =
        error.statusCode ||
        error.status ||
        responseDetails.statusCode ||
        defaults.statusCode ||
        undefined;
      const statusCode = statusFromError || getDefaultStatus(code) || 500;

      return new ApiError(
        error.message || defaults.message || 'An unexpected error occurred',
        {
          name: error.name || defaults.name,
          statusCode,
          code,
          details: error.details || responseDetails.details || defaults.details,
          requiresReauth: error.requiresReauth === true || responseDetails.requiresReauth === true,
          expose: error.expose,
          cause: error
        }
      );
    }

    if (error && typeof error === 'object') {
      const code = error.code || responseDetails.code || defaults.code;
      const statusFromError =
        error.statusCode ||
        error.status ||
        responseDetails.statusCode ||
        defaults.statusCode ||
        undefined;
      const statusCode = statusFromError || getDefaultStatus(code) || 500;

      return new ApiError(
        error.message || responseDetails.message || defaults.message || 'An unexpected error occurred',
        {
          name: error.name || defaults.name,
          statusCode,
          code,
          details: error.details || responseDetails.details || defaults.details,
          requiresReauth: error.requiresReauth === true || responseDetails.requiresReauth === true,
          expose: error.expose,
          cause: defaults.cause
        }
      );
    }

    return new ApiError(defaults.message || 'An unexpected error occurred', {
      name: defaults.name,
      statusCode: defaults.statusCode || getDefaultStatus(defaults.code) || 500,
      code: defaults.code,
      details: defaults.details,
      requiresReauth: defaults.requiresReauth === true,
      cause: defaults.cause
    });
  }

  toResponse(options = {}) {
    const defaultMessage = options.defaultMessage || 'An unexpected error occurred';
    const includeStack = options.includeStack === true;
    const path = options.path;
    const method = options.method;

    const statusTitle = resolveStatusTitle(this.statusCode);
    const shouldExposeMessage = this.expose || includeStack;

    const response = {
      error: statusTitle,
      message: shouldExposeMessage ? (this.message || defaultMessage) : defaultMessage,
      timestamp: new Date().toISOString()
    };

    if (this.code) {
      response.code = this.code;
    }

    if (this.details !== undefined) {
      response.details = this.details;
    }

    if (this.requiresReauth) {
      response.requiresReauth = true;
    }

    if (includeStack && this.stack) {
      response.stack = this.stack;
    }

    if (includeStack && path) {
      response.path = path;
    }

    if (includeStack && method) {
      response.method = method;
    }

    return response;
  }
}

function normalizeCodeFromField(field = '') {
  return field
    .toString()
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function throwValidationError(fieldOrOptions, maybeCode, maybeMessage, maybeDetails) {
  const options =
    fieldOrOptions && typeof fieldOrOptions === 'object' && !Array.isArray(fieldOrOptions)
      ? fieldOrOptions
      : {
          field: fieldOrOptions,
          code: maybeCode,
          message: maybeMessage,
          details: maybeDetails
        };

  const {
    field,
    code,
    message,
    details,
    statusCode = 400,
    expose = true,
    defaultMessage,
    name = 'ValidationError'
  } = options || {};

  const normalizedCode = code || (field ? `${normalizeCodeFromField(field)}_REQUIRED` : undefined);
  const normalizedDetails =
    details !== undefined ? details : field ? { field } : undefined;
  const finalMessage =
    message ||
    defaultMessage ||
    (field ? `Missing required field: ${field}` : 'Request validation failed');

  throw new ApiError(finalMessage, {
    name,
    statusCode,
    code: normalizedCode,
    details: normalizedDetails,
    expose
  });
}

function handleControllerError(res, error, options = {}) {
  const {
    context = 'Controller error',
    defaultMessage = 'Request failed',
    defaultCode,
    fallbackStatus = 500,
    log = console
  } = options;

  const apiError = ApiError.from(error, {
    message: defaultMessage,
    statusCode: fallbackStatus,
    code: defaultCode
  });

  const logParts = [
    `❌ [${context}]`,
    `status=${apiError.statusCode}`,
    `message=${apiError.message}`
  ];

  if (apiError.code) {
    logParts.push(`code=${apiError.code}`);
  }

  if (apiError.requiresReauth) {
    logParts.push('requiresReauth=true');
  }

  log?.error?.(logParts.join(' '));

  if (apiError.cause && log?.debug && apiError.cause !== error) {
    log.debug(apiError.cause);
  }

  const responsePayload = apiError.toResponse({
    defaultMessage,
    includeStack: process.env.NODE_ENV === 'development'
  });

  return res.status(apiError.statusCode).json(responsePayload);
}

export { ApiError, handleControllerError, resolveStatusTitle, throwValidationError };
