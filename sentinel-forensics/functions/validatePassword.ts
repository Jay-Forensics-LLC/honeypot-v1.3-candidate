import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const MIN_PASSWORD_LENGTH = 12;
const COMMON_PASSWORDS = ['password', '12345678', 'qwerty', 'admin', 'letmein', 'welcome'];

/**
 * Password Strength Validation
 * Checks password against security requirements
 */
function validatePasswordStrength(password) {
  const errors = [];
  const warnings = [];
  let score = 0;

  // Length check
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  } else {
    score += 20;
  }

  // Complexity checks
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (!hasUpperCase) errors.push('Password must contain uppercase letters');
  else score += 20;
  
  if (!hasLowerCase) errors.push('Password must contain lowercase letters');
  else score += 20;
  
  if (!hasNumbers) errors.push('Password must contain numbers');
  else score += 20;
  
  if (!hasSpecialChars) warnings.push('Consider adding special characters');
  else score += 20;

  // Common password check
  if (COMMON_PASSWORDS.some(common => password.toLowerCase().includes(common))) {
    errors.push('Password is too common');
    score = Math.min(score, 30);
  }

  // Repeated characters
  if (/(.)\1{2,}/.test(password)) {
    warnings.push('Avoid repeated characters');
    score -= 10;
  }

  return {
    valid: errors.length === 0,
    score: Math.max(0, Math.min(100, score)),
    strength: score >= 80 ? 'strong' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'weak',
    errors,
    warnings
  };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { password, check_breach } = await req.json();

        if (!password) {
            return Response.json({ error: 'password is required' }, { status: 400 });
        }

        const validation = validatePasswordStrength(password);

        // Optional: Check against Have I Been Pwned (if API key available)
        let breached = false;
        if (check_breach && Deno.env.get('HIBP_API_KEY')) {
            try {
                const encoder = new TextEncoder();
                const data = encoder.encode(password);
                const hashBuffer = await crypto.subtle.digest('SHA-1', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
                
                const prefix = hashHex.substring(0, 5);
                const suffix = hashHex.substring(5);

                const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
                    headers: {
                        'User-Agent': 'Sentinel-Forensics'
                    }
                });

                if (response.ok) {
                    const text = await response.text();
                    const hashes = text.split('\n').map(line => line.split(':')[0]);
                    breached = hashes.includes(suffix);

                    if (breached) {
                        validation.errors.push('This password has been exposed in a data breach');
                        validation.valid = false;
                        validation.score = 0;
                    }
                }
            } catch (error) {
                console.error('HIBP check failed:', error);
            }
        }

        return Response.json({
            ...validation,
            breached
        });

    } catch (error) {
        console.error('Password validation error:', error);
        return Response.json({ 
            error: 'Validation failed',
            message: error.message
        }, { status: 500 });
    }
});