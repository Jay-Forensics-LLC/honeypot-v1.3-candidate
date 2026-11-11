import { Badge } from '@/components/ui/badge';
import { Crown, Zap, Gift } from 'lucide-react';

/**
 * CRITICAL iOS FIX: Error-safe TierBadge
 */
export default function TierBadge({ tier }) {
  // iOS FIX: Safe fallback if tier is undefined
  if (!tier) {
    console.warn('TierBadge: No tier provided');
    return null;
  }

  const config = {
    free: {
      label: 'Free',
      icon: Gift,
      className: 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    },
    plus: {
      label: 'Plus',
      icon: Zap,
      className: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    },
    pro: {
      label: 'Pro',
      icon: Crown,
      className: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    }
  };

  const tierConfig = config[tier] || config.free;
  const Icon = tierConfig.icon;

  try {
    return (
      <Badge className={tierConfig.className}>
        <Icon className="w-3 h-3 mr-1" />
        {tierConfig.label}
      </Badge>
    );
  } catch (error) {
    console.error('TierBadge render error:', error);
    return null;
  }
}