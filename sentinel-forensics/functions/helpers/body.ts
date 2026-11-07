/**
 * BODY PARSING WITH SIZE LIMITS
 * 
 * Anti-DoS protection: reject oversized JSON payloads before parsing
 */

import { errorJson } from './http.ts';

/**
 * Read and parse JSON with strict size limits
 * Prevents memory exhaustion from large payloads
 * 
 * @param req - Incoming request
 * @param maxBytes - Maximum payload size (default: 64KB)
 * @returns Parsed JSON object
 * @throws Response with 413 or 400 status
 */
export async function readJsonLimited<T>(
  req: Request,
  maxBytes = 64_000
): Promise<T> {
  // Check Content-Length header first (fast path)
  const contentLength = req.headers.get('Content-Length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (isNaN(size) || size > maxBytes) {
      throw errorJson(413, 'Payload too large');
    }
  }

  // Read body with streaming limit enforcement
  const reader = req.body?.getReader();
  if (!reader) {
    throw errorJson(400, 'Invalid request body');
  }

  const decoder = new TextDecoder();
  let bytesRead = 0;
  let bodyText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      bytesRead += value.byteLength;
      
      // Hard cap: abort if exceeded
      if (bytesRead > maxBytes) {
        reader.cancel();
        throw errorJson(413, 'Payload too large');
      }
      
      bodyText += decoder.decode(value, { stream: true });
    }
    
    // Final decode flush
    bodyText += decoder.decode();
    
    // Parse JSON
    if (!bodyText || bodyText.trim() === '') {
      throw errorJson(400, 'Empty request body');
    }
    
    return JSON.parse(bodyText) as T;
    
  } catch (error) {
    // If already a Response (from our errorJson), rethrow
    if (error instanceof Response) {
      throw error;
    }
    
    // JSON parse errors
    if (error instanceof SyntaxError) {
      throw errorJson(400, 'Invalid JSON');
    }
    
    // Generic errors
    throw errorJson(400, 'Invalid input');
  }
}