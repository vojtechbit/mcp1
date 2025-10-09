import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralized error handling middleware
 * This should be the LAST middleware in the chain
 */
function errorHandler(err, req, res, next) {
  // Log error details
  console.error('❌ [UNHANDLED_ERROR]');
  console.error('Error:', err.message);
  console.error('Path:', req.method, req.path);
  console.error('User:', req.user?.email || 'Anonymous');
  console.error('Timestamp:', new Date().toISOString());

  // Log stack trace in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Stack trace:', err.stack);
  }

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Determine error type
  let errorType = 'Internal Server Error';
  let userMessage = 'An unexpected error occurred';

  if (statusCode === 400) {
    errorType = 'Bad Request';
    userMessage = 'Invalid request parameters';
  } else if (statusCode === 401) {
    errorType = 'Unauthorized';
    userMessage = 'Authentication required';
  } else if (statusCode === 403) {
    errorType = 'Forbidden';
    userMessage = 'Access denied';
  } else if (statusCode === 404) {
    errorType = 'Not Found';
    userMessage = 'Resource not found';
  } else if (statusCode === 429) {
    errorType = 'Too Many Requests';
    userMessage = 'Rate limit exceeded';
  } else if (statusCode >= 500) {
    errorType = 'Internal Server Error';
    userMessage = 'Something went wrong on our end';
  }

  // Build error response
  const errorResponse = {
    error: errorType,
    message: err.message || userMessage,
    timestamp: new Date().toISOString()
  };

  // Add additional details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.path = req.path;
    errorResponse.method = req.method;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
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

export { errorHandler, notFoundHandler, asyncHandler };
