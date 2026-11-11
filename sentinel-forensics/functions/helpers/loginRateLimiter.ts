/**
 * Login Rate Limiter
 * Prevents brute-force attacks on authentication endpoints
 */

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  blocked: boolean;
  blockExpiry?: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();

// Cleanup old entries every hour
setInterval(() => {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  
  for (const [key, entry] of loginAttempts.entries()) {
    if (now - entry.lastAttempt > ONE_HOUR) {
      loginAttempts.delete(key);
    }
  }
}, 60 * 60 * 1000);

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts?: number;
  retryAfter?: number;
  reason?: string;
}

export function checkLoginRateLimit(identifier: string): RateLimitResult {
  const now = Date.now();
  const entry = loginAttempts.get(identifier);
  
  // Check if currently blocked
  if (entry?.blocked && entry.blockExpiry && now < entry.blockExpiry) {
    const retryAfter = Math.ceil((entry.blockExpiry - now) / 1000);
    return {
      allowed: false,
      retryAfter,
      reason: `Too many failed attempts. Try again in ${retryAfter} seconds.`
    };
  }
  
  // Reset if block expired
  if (entry?.blocked && entry.blockExpiry && now >= entry.blockExpiry) {
    loginAttempts.delete(identifier);
    return { allowed: true, remainingAttempts: 5 };
  }
  
  // Check rate within time window (5 attempts per 15 minutes)
  const WINDOW_MS = 15 * 60 * 1000;
  const MAX_ATTEMPTS = 5;
  
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    // Fresh window
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }
  
  if (entry.attempts >= MAX_ATTEMPTS) {
    // Block for 30 minutes
    const blockExpiry = now + (30 * 60 * 1000);
    loginAttempts.set(identifier, {
      ...entry,
      blocked: true,
      blockExpiry,
      lastAttempt: now
    });
    
    return {
      allowed: false,
      retryAfter: 1800,
      reason: 'Too many failed attempts. Account temporarily locked for 30 minutes.'
    };
  }
  
  return {
    allowed: true,
    remainingAttempts: MAX_ATTEMPTS - entry.attempts
  };
}

export function recordLoginAttempt(identifier: string, success: boolean): void {
  const now = Date.now();
  const entry = loginAttempts.get(identifier);
  
  if (success) {
    // Clear on successful login
    loginAttempts.delete(identifier);
    return;
  }
  
  // Record failed attempt
  if (!entry) {
    loginAttempts.set(identifier, {
      attempts: 1,
      firstAttempt: now,
      lastAttempt: now,
      blocked: false
    });
  } else {
    loginAttempts.set(identifier, {
      ...entry,
      attempts: entry.attempts + 1,
      lastAttempt: now
    });
  }
}

export function clearLoginAttempts(identifier: string): void {
  loginAttempts.delete(identifier);
}