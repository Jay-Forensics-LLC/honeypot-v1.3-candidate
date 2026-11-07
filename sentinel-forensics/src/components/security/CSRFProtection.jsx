import { useEffect, useState } from 'react';

/**
 * CSRF PROTECTION
 * Generates and manages CSRF tokens for mutation requests
 * 
 * SECURITY: Tokens are rotated every 30 minutes
 * Usage: Import getCsrfToken() and add to mutation headers
 */

let csrfToken = null;
let tokenExpiry = 0;
const TOKEN_LIFETIME = 30 * 60 * 1000; // 30 minutes

/**
 * Generate cryptographically secure CSRF token
 */
function generateToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get current CSRF token (generates if expired)
 */
export function getCsrfToken() {
  const now = Date.now();
  
  if (!csrfToken || now >= tokenExpiry) {
    csrfToken = generateToken();
    tokenExpiry = now + TOKEN_LIFETIME;
    
    // Store in sessionStorage for backend validation
    try {
      sessionStorage.setItem('csrf_token', csrfToken);
      sessionStorage.setItem('csrf_expiry', tokenExpiry.toString());
    } catch (e) {
      console.warn('Failed to store CSRF token:', e);
    }
  }
  
  return csrfToken;
}

/**
 * Validate CSRF token (backend use)
 */
export function validateCsrfToken(token) {
  const stored = sessionStorage.getItem('csrf_token');
  const expiry = parseInt(sessionStorage.getItem('csrf_expiry') || '0');
  
  if (!stored || Date.now() >= expiry) {
    return false;
  }
  
  return token === stored;
}

/**
 * React hook for CSRF token management
 */
export function useCSRFToken() {
  const [token, setToken] = useState(() => getCsrfToken());
  
  useEffect(() => {
    // Rotate token every 30 minutes
    const interval = setInterval(() => {
      const newToken = getCsrfToken();
      setToken(newToken);
    }, TOKEN_LIFETIME);
    
    return () => clearInterval(interval);
  }, []);
  
  return token;
}

/**
 * Add CSRF token to request headers
 */
export function withCSRF(headers = {}) {
  return {
    ...headers,
    'X-CSRF-Token': getCsrfToken()
  };
}