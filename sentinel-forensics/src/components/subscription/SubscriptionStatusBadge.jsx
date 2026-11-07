import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Crown, CheckCircle, AlertTriangle, Clock, XCircle } from 'lucide-react';

/**
 * SUBSCRIPTION STATUS BADGE
 * Displays user's current subscription tier and status
 */
export default function SubscriptionStatusBadge({ user, variant = 'default', showIcon = true }) {
  if (!user) return null;

  const tier = user.subscription_tier || 'free';
  const status = user.subscription_status || 'active';

  // Tier styling
  const tierConfig = {
    free: {
      label: 'Free',
      className: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
      icon: null
    },
    plus: {
      label: 'Plus',
      className: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      icon: Crown
    },
    pro: {
      label: 'Pro',
      className: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      icon: Crown
    },
    forensic_suite: {
      label: 'Forensic Suite',
      className: 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border-purple-500/30',
      icon: Crown
    }
  };

  // Status styling
  const statusConfig = {
    active: {
      label: 'Active',
      icon: CheckCircle,
      className: 'text-green-400'
    },
    trialing: {
      label: 'Trial',
      icon: Clock,
      className: 'text-blue-400'
    },
    past_due: {
      label: 'Past Due',
      icon: AlertTriangle,
      className: 'text-orange-400'
    },
    canceled: {
      label: 'Canceled',
      icon: XCircle,
      className: 'text-red-400'
    },
    incomplete: {
      label: 'Incomplete',
      icon: AlertTriangle,
      className: 'text-yellow-400'
    }
  };

  const tierInfo = tierConfig[tier] || tierConfig.free;
  const statusInfo = statusConfig[status] || statusConfig.active;
  const TierIcon = tierInfo.icon;
  const StatusIcon = statusInfo.icon;

  if (variant === 'compact') {
    return (
      <Badge className={tierInfo.className}>
        {showIcon && TierIcon && <TierIcon className="w-3 h-3 mr-1" />}
        {tierInfo.label}
      </Badge>
    );
  }

  if (variant === 'detailed') {
    return (
      <div className="flex items-center gap-2">
        <Badge className={tierInfo.className}>
          {showIcon && TierIcon && <TierIcon className="w-3 h-3 mr-1" />}
          {tierInfo.label}
        </Badge>
        {status !== 'active' && (
          <Badge variant="outline" className={statusInfo.className}>
            {showIcon && <StatusIcon className="w-3 h-3 mr-1" />}
            {statusInfo.label}
          </Badge>
        )}
      </div>
    );
  }

  // Default variant
  return (
    <Badge className={tierInfo.className}>
      {showIcon && TierIcon && <TierIcon className="w-3 h-3 mr-1" />}
      {tierInfo.label}
    </Badge>
  );
}