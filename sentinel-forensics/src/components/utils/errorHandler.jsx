/**
 * PRODUCTION: Centralized Error Handling Utilities
 * Standardizes error handling and user-friendly messaging
 */

export class AppError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', statusCode = 500, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const ErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: { code: 'UNAUTHORIZED', status: 401, message: 'Authentication required' },
  FORBIDDEN: { code: 'FORBIDDEN', status: 403, message: 'Access denied' },
  
  // Validation
  INVALID_INPUT: { code: 'INVALID_INPUT', status: 400, message: 'Invalid input provided' },
  MISSING_FIELD: { code: 'MISSING_FIELD', status: 400, message: 'Required field missing' },
  
  // Resource errors
  NOT_FOUND: { code: 'NOT_FOUND', status: 404, message: 'Resource not found' },
  ALREADY_EXISTS: { code: 'ALREADY_EXISTS', status: 409, message: 'Resource already exists' },
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: { code: 'RATE_LIMIT_EXCEEDED', status: 429, message: 'Too many requests' },
  
  // Business logic
  LEGAL_HOLD: { code: 'LEGAL_HOLD', status: 403, message: 'Resource under legal hold' },
  INTEGRITY_FAILED: { code: 'INTEGRITY_FAILED', status: 400, message: 'Integrity verification failed' },
  
  // Server errors
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500, message: 'Internal server error' },
  SERVICE_UNAVAILABLE: { code: 'SERVICE_UNAVAILABLE', status: 503, message: 'Service temporarily unavailable' }
};

/**
 * Get user-friendly error message
 */
export function getUserFriendlyError(error) {
  if (error instanceof AppError) {
    return error.message;
  }
  
  const errorMap = {
    'Unauthorized': 'Please log in to continue',
    'Forbidden': 'You do not have permission to perform this action',
    'Not found': 'The requested item could not be found',
    'Rate limit': 'You are making requests too quickly. Please wait and try again',
    'Legal hold': 'This item is under legal hold and cannot be modified',
    'Network error': 'Connection error. Please check your internet connection',
    'Timeout': 'Request timed out. Please try again'
  };
  
  const message = error?.message || String(error);
  
  for (const [key, friendlyMessage] of Object.entries(errorMap)) {
    if (message.toLowerCase().includes(key.toLowerCase())) {
      return friendlyMessage;
    }
  }
  
  return 'An unexpected error occurred. Please try again';
}

/**
 * Handle API error response
 */
export function handleAPIError(error, context = '') {
  console.error(`API Error${context ? ` (${context})` : ''}:`, error);
  
  const userMessage = getUserFriendlyError(error);
  
  return {
    success: false,
    error: userMessage,
    code: error?.code || 'UNKNOWN_ERROR',
    context
  };
}

/**
 * Standard error response for backend functions
 * NOTE: This function is SERVER-ONLY. Do not import into React/client code.
 */
export function createErrorResponse(error, customMessage = null) {
  // BACKEND-ONLY: Safe runtime check for Deno
  const isDevelopment = typeof Deno !== 'undefined' 
    ? Deno.env.get('ENVIRONMENT') !== 'production'
    : false;
  
  const response = {
    success: false,
    error: customMessage || error.message || 'An error occurred',
    code: error.code || 'INTERNAL_ERROR'
  };
  
  // Include stack trace in development only
  if (isDevelopment && error.stack) {
    response.stack = error.stack;
  }
  
  const statusCode = error.statusCode || error.status || 500;
  
  return Response.json(response, { status: statusCode });
}

/**
 * Wrap async function with standardized error handling
 */
export function withErrorHandling(handler) {
  return async (req) => {
    try {
      return await handler(req);
    } catch (error) {
      console.error('Unhandled error in function:', error);
      return createErrorResponse(error);
    }
  };
}