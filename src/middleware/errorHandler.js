import dotenv from 'dotenv';
import { ApiError, resolveStatusTitle } from '../utils/errors.js';
import { wrapModuleFunctions } from '../utils/advancedDebugging.js';
import { formatErrorForAlfred } from '../utils/alfredErrorMessages.js';

dotenv.config();

/**
 * Centralized error handling middleware
 * This should be the LAST middleware in the chain
 */
function errorHandler(err, req, res, next) {
  const apiError = ApiError.from(err);

  const logParts = [
    '❌ [UNHANDLED_ERROR]',
    `status=${apiError.statusCode}`,
    `message=${apiError.message}`,
    `path=${req.method} ${req.path}`,
    `user=${req.user?.email || 'Anonymous'}`
  ];

  if (apiError.code) {
    logParts.push(`code=${apiError.code}`);
  }

  if (apiError.requiresReauth) {
    logParts.push('requiresReauth=true');
  }

  console.error(logParts.join(' '));

  if (process.env.NODE_ENV === 'development' && apiError.stack) {
    console.error(apiError.stack);
  }

  const responsePayload = apiError.toResponse({
    defaultMessage: 'Something went wrong on our end',
    includeStack: process.env.NODE_ENV === 'development',
    path: req.path,
    method: req.method
  });

  if (!responsePayload.error) {
    responsePayload.error = resolveStatusTitle(apiError.statusCode);
  }

  // Add Alfred-friendly error messages
  try {
    const alfredError = formatErrorForAlfred(apiError, {
      includeDetails: process.env.NODE_ENV === 'development'
    });
    responsePayload.alfred = alfredError;
  } catch (alfredEnrichmentError) {
    // If Alfred enrichment fails, log but don't break the response
    console.warn('⚠️  Failed to enrich error for Alfred:', alfredEnrichmentError.message);
  }

  res.status(apiError.statusCode).json(responsePayload);
}

/**
 * Handle 404 - Not Found
 * Use this before errorHandler middleware
 */
function notFoundHandler(req, res, next) {
  console.log('⚠️  404 Not Found:', req.method, req.path);

  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString()
  });
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors automatically
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const traced = wrapModuleFunctions('middleware.errorHandler', {
  errorHandler,
  notFoundHandler,
  asyncHandler,
});

const {
  errorHandler: tracedErrorHandler,
  notFoundHandler: tracedNotFoundHandler,
  asyncHandler: tracedAsyncHandler,
} = traced;

export {
  tracedErrorHandler as errorHandler,
  tracedNotFoundHandler as notFoundHandler,
  tracedAsyncHandler as asyncHandler,
};
