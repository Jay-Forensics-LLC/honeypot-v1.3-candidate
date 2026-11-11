import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { checkSubscriptionLimit } from '@/functions/checkSubscriptionLimit';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';
import { Shield, Crown, Zap } from 'lucide-react';

/**
 * SUBSCRIPTION GATE v2.0
 * Server-side entitlement enforcement wrapper
 * 
 * CRITICAL: All usage checks happen server-side
 * Frontend only displays result, never makes decisions
 */

export default function SubscriptionGate({ 
  children, 
  feature, 
  limitType, // 'scans', 'evidence_storage', 'devices'
  requiredTier, // 'free', 'plus', 'pro'
  onBlock 
}) {
  const navigate = useNavigate();
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: limitCheck, isLoading } = useQuery({
    queryKey: ['subscription-limit', limitType, user?.email],
    queryFn: async () => {
      if (!limitType) return { allowed: true };
      
      const response = await checkSubscriptionLimit({
        limit_type: limitType,
        increment: false // Just check, don't increment
      });
      
      return response.data;
    },
    enabled: !!user && !!limitType,
    staleTime: 10000, // Cache for 10 seconds
    retry: 1
  });

  useEffect(() => {
    if (limitCheck && !limitCheck.allowed && !isLoading) {
      const tierNames = {
        free: 'Free',
        plus: 'Plus',
        pro: 'Pro'
      };
      
      toast.error(`${tierNames[requiredTier] || 'Upgrade'} Required`, {
        description: `You've reached your ${limitType} limit. Upgrade to continue.`,
        action: {
          label: 'View Plans',
          onClick: () => navigate(createPageUrl('Pricing'))
        },
        duration: 6000
      });

      if (onBlock) {
        onBlock(limitCheck);
      }
    }
  }, [limitCheck, isLoading, limitType, requiredTier, onBlock]);

  // Check tier requirement
  if (requiredTier && user) {
    const tierLevels = { free: 1, plus: 2, pro: 3 };
    const userTierLevel = tierLevels[user.subscription_tier || 'free'];
    const requiredTierLevel = tierLevels[requiredTier];

    if (userTierLevel < requiredTierLevel) {
      return (
        <div className="p-6 text-center bg-slate-900/50 border border-slate-800 rounded-lg">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
            {requiredTier === 'pro' ? <Crown className="w-8 h-8 text-white" /> : <Zap className="w-8 h-8 text-white" />}
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            {requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)} Feature
          </h3>
          <p className="text-slate-400 mb-4">
            This feature requires a {requiredTier} subscription or higher.
          </p>
          <button 
            onClick={() => navigate(createPageUrl('Pricing'))}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-2 rounded-lg font-semibold min-h-[44px]"
          >
            Upgrade to {requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)}
          </button>
        </div>
      );
    }
  }

  // Check usage limits
  if (limitType && limitCheck && !limitCheck.allowed) {
    return (
      <div className="p-6 text-center bg-slate-900/50 border border-yellow-500/30 rounded-lg">
        <Shield className="w-16 h-16 mx-auto mb-4 text-yellow-400" />
        <h3 className="text-xl font-bold text-white mb-2">Limit Reached</h3>
        <p className="text-slate-400 mb-4">
          You've used {limitCheck.current} of {limitCheck.limit} {limitType} this month.
        </p>
        <button 
          onClick={() => navigate(createPageUrl('Pricing'))}
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-2 rounded-lg font-semibold min-h-[44px]"
        >
          Upgrade for More
        </button>
      </div>
    );
  }

  return children;
}