import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Check, Crown, Zap, Shield, Loader2, CreditCard, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { FEATURE_FLAGS } from '../components/config/featureFlags';

export default function Subscription() {
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const [portalLoading, setPortalLoading] = useState(false);

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const result = await base44.functions.invoke('createCustomerPortalSession', {
        return_url: window.location.origin + '/Subscription'
      });

      if (result.data?.url) {
        window.location.href = result.data.url;
      } else {
        toast.error('Failed to open subscription portal');
        setPortalLoading(false);
      }
    } catch (error) {
      console.error('Portal error:', error);
      toast.error('Unable to access subscription management');
      setPortalLoading(false);
    }
  };

  const tiers = [
    {
      name: 'Free',
      price: '$0',
      period: '/month',
      priceId: null,
      tier: 'free',
      icon: Shield,
      color: 'from-slate-600 to-slate-700',
      features: [
        '5 active devices',
        '100 MB evidence storage',
        'Basic case management',
        'Device integrity scans',
        'Network traffic monitoring',
        'Standard threat detection',
        'Manual evidence uploads',
        'Community support'
      ]
    },
    {
      name: 'Plus',
      price: '$19.99',
      period: '/month',
      priceId: null,
      tier: 'plus',
      icon: Zap,
      color: 'from-blue-600 to-cyan-600',
      popular: true,
      features: [
        '25 active devices',
        '5 GB evidence storage',
        'AI-powered threat monitoring',
        'BLE anomaly detection',
        'Zero-click exploit detection',
        'Automated threat correlation',
        'APT defense playbooks',
        'Vulnerability management',
        'Chain of custody logging',
        'PDF/CSV report exports',
        'Email support (48hr)'
      ]
    },
    {
      name: 'Pro',
      price: '$49.99',
      period: '/month',
      priceId: null,
      tier: 'pro',
      icon: Crown,
      color: 'from-purple-600 to-pink-600',
      features: [
        'Unlimited devices',
        '50 GB evidence storage',
        'Real-time security orchestration',
        'Automated defense actions',
        'SIEM & log analytics',
        'Threat intelligence feeds',
        'Incident response playbooks',
        'Compliance reporting (SOC2, ISO27001)',
        'Asset lifecycle management',
        'Multi-factor authentication',
        'Role-based access control',
        'Forensic playback & replay',
        'API access & webhooks',
        'Priority support (24hr)'
      ]
    }
  ];

  const createCheckoutMutation = useMutation({
    mutationFn: async ({ priceId, tier }) => {
      setIsProcessing(true);
      
      const response = await base44.functions.invoke('createCheckoutSession', {
        priceId,
        tier
      });
      
      return response.data;
    },
    onSuccess: (data) => {
      if (data.sessionId && data.url) {
        window.location.href = data.url;
      } else {
        toast.error('Invalid checkout session');
        setIsProcessing(false);
      }
    },
    onError: (error) => {
      setIsProcessing(false);
      toast.error('Failed to start checkout', {
        description: error.message || 'Please try again'
      });
    }
  });

  const handleUpgrade = (priceId, tier) => {
    if (!priceId) {
      toast.info('Please contact support to set up payment plans', {
        description: 'Stripe products need to be configured'
      });
      return;
    }

    if (FEATURE_FLAGS.STRIPE_STUBS) {
      toast.info('Demo Mode - Payments Disabled', {
        description: 'Payment processing is disabled in demo mode'
      });
      return;
    }
    
    createCheckoutMutation.mutate({ priceId, tier });
  };

  const currentTier = user?.subscription_tier || 'free';

  if (FEATURE_FLAGS.PUBLIC_DEMO_MODE) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
          <Alert className="bg-blue-500/10 border-blue-500/30 mb-6">
            <Shield className="h-5 w-5 text-blue-400" />
            <AlertDescription className="text-blue-300">
              <strong>Public Demo Mode</strong> - All features are unlocked until {FEATURE_FLAGS.FREE_TRIAL_UNTIL}. 
              Subscription management will be available after the trial period.
            </AlertDescription>
          </Alert>

          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-4">
              All Features Unlocked
            </h1>
            <p className="text-slate-400 text-lg">
              Enjoy full access to Sentinel Forensics during the public preview period
            </p>
            <Badge className="mt-4 bg-green-500/20 text-green-400 px-4 py-2">
              <Check className="w-4 h-4 mr-2" />
              Forensic Suite Access (Full)
            </Badge>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {tiers.map((tier) => {
              const Icon = tier.icon;
              
              return (
                <Card 
                  key={tier.tier}
                  className="relative overflow-hidden border-2 border-slate-800 bg-slate-900/50"
                >
                  {tier.popular && (
                    <div className="absolute top-0 right-0 bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-4 py-1 text-sm font-semibold">
                      MOST POPULAR
                    </div>
                  )}
                  
                  <CardHeader className="text-center pb-4">
                    <div className={`w-16 h-16 mx-auto mb-4 bg-gradient-to-br ${tier.color} rounded-full flex items-center justify-center`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-white">{tier.name}</CardTitle>
                    <div className="mt-4">
                      <span className="text-4xl font-bold text-white">{tier.price}</span>
                      <span className="text-slate-400">{tier.period}</span>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    <ul className="space-y-3">
                      {tier.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-300">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <Button
                      disabled
                      className="w-full bg-slate-700 text-slate-400 cursor-not-allowed"
                    >
                      Available After Trial
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
        <Alert className="bg-orange-500/10 border-orange-500/30">
          <AlertTriangle className="h-5 w-5 text-orange-400" />
          <AlertDescription className="text-orange-200">
            <strong>Payment Plans Not Configured</strong> - Create products in your Stripe dashboard and update price IDs in the code.
          </AlertDescription>
        </Alert>

        <div className="text-center mb-8 md:mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Choose Your Plan
          </h1>
          <p className="text-slate-400 text-base md:text-lg mb-4">
            Unlock powerful forensics and security features
          </p>
          {user && user.subscription_tier !== 'free' && (
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <span className="text-slate-400">Current Plan:</span>
              <SubscriptionStatusBadge user={user} variant="detailed" />
              {user.stripe_customer_id && (
                <Button
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  size="sm"
                  variant="outline"
                  className="border-slate-700"
                >
                  {portalLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Manage Subscription'
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {tiers.map((tier) => {
            const Icon = tier.icon;
            const isCurrentTier = currentTier === tier.tier;
            
            return (
              <Card 
                key={tier.tier}
                className={`relative overflow-hidden border-2 bg-slate-900/50 ${
                  tier.popular 
                    ? 'border-blue-500 shadow-xl shadow-blue-500/20' 
                    : 'border-slate-800'
                } ${isCurrentTier ? 'ring-2 ring-green-500' : ''}`}
              >
                {tier.popular && (
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-4 py-1 text-sm font-semibold">
                    MOST POPULAR
                  </div>
                )}
                
                <CardHeader className="text-center pb-4 pt-6">
                  <div className={`w-16 h-16 mx-auto mb-4 bg-gradient-to-br ${tier.color} rounded-full flex items-center justify-center`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-xl md:text-2xl font-bold text-white">{tier.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-3xl md:text-4xl font-bold text-white">{tier.price}</span>
                    <span className="text-slate-400 text-sm md:text-base">{tier.period}</span>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <ul className="space-y-3">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                        <span className="text-slate-300">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button
                    onClick={() => handleUpgrade(tier.priceId, tier.tier)}
                    disabled={isCurrentTier || isProcessing || !tier.priceId}
                    className={`w-full min-h-[44px] ${
                      isCurrentTier
                        ? 'bg-green-600 hover:bg-green-700'
                        : tier.popular
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700'
                        : 'bg-slate-700 hover:bg-slate-600'
                    }`}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : isCurrentTier ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Current Plan
                      </>
                    ) : tier.priceId ? (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Upgrade Now
                      </>
                    ) : (
                      'Contact Support'
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}