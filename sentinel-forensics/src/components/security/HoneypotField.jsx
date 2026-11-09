import { base44 } from '@/api/base44Client';

/**
 * Honeypot field to detect bots
 * Hidden from users but visible to bots
 */
export default function HoneypotField({ onBotDetected }) {
  const handleChange = async (e) => {
    if (e.target.value) {
      // Bot detected!
      try {
        await base44.entities.SecurityEvent.create({
          event_type: 'honeypot_triggered',
          severity: 'critical',
          ip_address: await fetch('https://api.ipify.org?format=json')
            .then(r => r.json())
            .then(d => d.ip)
            .catch(() => 'unknown'),
          user_agent: navigator.userAgent,
          details: {
            honeypot_field: 'email_confirm',
            value_entered: e.target.value.substring(0, 50)
          },
          timestamp: new Date().toISOString(),
          risk_score: 100
        });
      } catch (error) {
        console.error('Failed to log honeypot trigger:', error);
      }

      if (onBotDetected) {
        onBotDetected();
      }
    }
  };

  return (
    <input
      type="text"
      name="email_confirm"
      tabIndex="-1"
      autoComplete="off"
      onChange={handleChange}
      style={{
        position: 'absolute',
        left: '-9999px',
        width: '1px',
        height: '1px',
        opacity: 0,
        pointerEvents: 'none'
      }}
      aria-hidden="true"
    />
  );
}