import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * USER - Enable or disable MFA
 * Fixes Issue #011: MFA can only be toggled via backend
 * 
 * Flow:
 * 1. User requests MFA enable/disable
 * 2. Backend validates user identity
 * 3. Backend updates mfa_enabled via service role
 * 4. Audit log created
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { enabled, method } = await req.json();

    if (typeof enabled !== 'boolean') {
      return Response.json({ 
        error: 'enabled must be boolean' 
      }, { status: 400 });
    }

    // Validate MFA method
    const validMethods = ['none', 'email', 'webauthn'];
    const mfaMethod = enabled ? (method || 'email') : 'none';

    if (!validMethods.includes(mfaMethod)) {
      return Response.json({ 
        error: 'Invalid MFA method. Must be: none, email, webauthn' 
      }, { status: 400 });
    }

    // Issue #011: Require admin MFA (cannot disable if admin)
    if (user.role === 'admin' && !enabled) {
      return Response.json({ 
        error: 'Admins must have MFA enabled',
        issue: '#011'
      }, { status: 403 });
    }

    const previousState = {
      mfa_enabled: user.mfa_enabled,
      mfa_method: user.mfa_method
    };

    // Update MFA status using service role (bypasses RLS)
    await base44.asServiceRole.entities.User.update(user.id, {
      mfa_enabled: enabled,
      mfa_method: mfaMethod
    });

    // Create audit log
    await base44.functions.invoke('createAuditLog', {
      event_type: enabled ? 'mfa_enabled' : 'mfa_disabled',
      severity: 'warning',
      description: `MFA ${enabled ? 'enabled' : 'disabled'} with method: ${mfaMethod}`,
      resource_type: 'User',
      resource_id: user.id,
      action_performed: 'toggle_mfa',
      fields_changed: ['mfa_enabled', 'mfa_method'],
      previous_state: previousState,
      new_state: {
        mfa_enabled: enabled,
        mfa_method: mfaMethod
      },
      metadata: {
        user_email: user.email,
        mfa_method: mfaMethod
      }
    });

    return Response.json({ 
      success: true,
      mfa_enabled: enabled,
      mfa_method: mfaMethod,
      message: `MFA ${enabled ? 'enabled' : 'disabled'} successfully`
    });

  } catch (error) {
    console.error('MFA toggle failed:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});