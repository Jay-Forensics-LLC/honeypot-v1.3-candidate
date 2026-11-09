import { base44 } from '@/api/base44Client';

/**
 * Resilient API Client - ENHANCED ERROR HANDLING v3
 * Prevents "Request aborted", "Network Error", and timeout errors
 */

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

export class APIError extends Error {
  constructor(message, code, originalError) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.originalError = originalError;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let timeoutId;
  
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new APIError('Request timeout', 'TIMEOUT'));
    }, timeoutMs);
  });
  
  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise
  ]);
}

function isRetryableError(error) {
  if (!error) return false;
  
  // Don't retry auth errors
  if (error.response?.status === 401 || error.response?.status === 403) {
    return false;
  }
  
  // Don't retry client errors (except rate limit)
  if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
    return false;
  }
  
  // Retry on network errors (including Axios errors)
  if (error.message?.includes('Network Error') ||
      error.message?.includes('aborted') || 
      error.message?.includes('timeout') ||
      error.message?.includes('network') ||
      error.message?.includes('fetch') ||
      error.name === 'AxiosError' ||
      error.code === 'TIMEOUT' ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'NETWORK_ERROR') {
    return true;
  }
  
  if (error.response?.status >= 500 || error.response?.status === 429) {
    return true;
  }
  
  return false;
}

async function withRetry(fn, retries = MAX_RETRIES) {
  let lastError;
  
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Log network errors
      if (error.message?.includes('Network Error') || error.name === 'AxiosError') {
        console.warn(`Network error (attempt ${i + 1}/${retries + 1}):`, error.message);
      }
      
      if (!isRetryableError(error)) {
        throw error;
      }
      
      if (i === retries) {
        break;
      }
      
      const delay = RETRY_DELAY_MS * Math.pow(2, i);
      console.debug(`Retry ${i + 1}/${retries} after ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

export async function safeEntityList(entityName, orderBy = '-created_date', limit = 100, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    return await withTimeout(
      withRetry(async () => {
        return await base44.entities[entityName].list(orderBy, limit);
      }),
      timeoutMs
    );
  } catch (error) {
    console.warn(`${entityName}.list failed (returning empty):`, error.message);
    return [];
  }
}

export async function safeEntityFilter(entityName, filter, orderBy = '-created_date', limit = 100, offset = 0, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    return await withTimeout(
      withRetry(async () => {
        return await base44.entities[entityName].filter(filter, orderBy, limit, offset);
      }),
      timeoutMs
    );
  } catch (error) {
    console.warn(`${entityName}.filter failed (returning empty):`, error.message);
    return [];
  }
}

export async function safeEntityCreate(entityName, data, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return await withTimeout(
    withRetry(async () => {
      return await base44.entities[entityName].create(data);
    }),
    timeoutMs
  );
}

export async function safeEntityUpdate(entityName, id, data, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return await withTimeout(
    withRetry(async () => {
      return await base44.entities[entityName].update(id, data);
    }),
    timeoutMs
  );
}

export async function safeEntityDelete(entityName, id, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return await withTimeout(
    withRetry(async () => {
      return await base44.entities[entityName].delete(id);
    }),
    timeoutMs
  );
}

export async function safeFunctionCall(functionName, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    return await withTimeout(
      withRetry(async () => {
        return await base44.functions.invoke(functionName, params);
      }),
      timeoutMs
    );
  } catch (error) {
    console.error(`Function ${functionName} failed:`, error.message);
    throw new APIError(
      `Failed to call ${functionName}: ${error.message}`,
      error.code || 'FUNCTION_ERROR',
      error
    );
  }
}

export const resilientAPI = {
  listEntity: safeEntityList,
  filterEntity: safeEntityFilter,
  createEntity: safeEntityCreate,
  updateEntity: safeEntityUpdate,
  deleteEntity: safeEntityDelete,
  callFunction: safeFunctionCall,
  withTimeout,
  withRetry
};