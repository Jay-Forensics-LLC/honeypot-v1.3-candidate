export const FEATURE_FLAGS = Object.freeze({
  PUBLIC_DEMO_MODE: false,
  FREE_TRIAL_UNTIL: null,
  STRIPE_STUBS: false,
  ENABLE_TELEMETRY: true
});

export const DEMO_USER = Object.freeze({
  id: 'demo-user',
  email: 'demo@example.invalid',
  full_name: 'Demo User',
  role: 'user'
});

export function getDemoMessage() {
  return FEATURE_FLAGS.PUBLIC_DEMO_MODE ? 'Public demo mode is active.' : null;
}
