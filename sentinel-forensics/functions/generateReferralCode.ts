import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * USER - Generate referral code
 * Fixes Issue #014: Referral codes are backend-generated, not user-chosen
 * 
 * Flow:
 * 1. User requests referral code generation
 * 2. Backend generates unique code
 * 3. Backend updates user.referral_code via service role
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Issue #014: Check if user already has a referral code
    if (user.referral_code) {
      return Response.json({ 
        success: true,
        referral_code: user.referral_code,
        message: 'Referral code already exists'
      });
    }

    // Generate unique referral code
    const referralCode = await generateUniqueCode(base44);

    // Update user with referral code using service role
    await base44.asServiceRole.entities.User.update(user.id, {
      referral_code: referralCode
    });

    // Create audit log
    await base44.functions.invoke('createAuditLog', {
      event_type: 'referral_code_generated',
      severity: 'info',
      description: 'Referral code generated',
      resource_type: 'User',
      resource_id: user.id,
      action_performed: 'generate_referral_code',
      fields_changed: ['referral_code'],
      metadata: {
        user_email: user.email,
        referral_code: referralCode
      }
    });

    return Response.json({ 
      success: true,
      referral_code: referralCode,
      message: 'Referral code generated successfully'
    });

  } catch (error) {
    console.error('Referral code generation failed:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});

/**
 * Generate unique 8-character alphanumeric code
 * Issue #014: Backend-controlled generation
 */
async function generateUniqueCode(base44) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const codeLength = 8;

  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < codeLength; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    // Check if code already exists
    const existing = await base44.asServiceRole.entities.User.filter({ 
      referral_code: code 
    });

    if (!existing || existing.length === 0) {
      return code;
    }
  }

  throw new Error('Failed to generate unique referral code after 10 attempts');
}