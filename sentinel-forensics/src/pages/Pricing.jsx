import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Check,
  Zap,
  Shield,
  Download,
  Wifi,
  Lock,
  Users,
  Loader2,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

export default function Pricing() {
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [loading, setLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  // Get referral code from URL
  const urlParams = new URLSearchParams(window.location.search);
  const referralCode = urlParams.get('ref');

  useEffect(() => {
    if (referralCode) {
      // Store in localStorage for attribution through signup
      localStorage.setItem('sentinel_referral_code', referralCode);
      
      // Track referral click
      base44.functions.invoke('trackReferralClick', { 
        referral_code: referralCode,
        referrer_url: document.referrer || 'direct'
      }).catch(err => console.error('Failed to track referral:', err));
    }
  }, [referralCode]);

  // PHASE 8: Attribution on signup - check if we have a stored referral code
  useEffect(() => {
    const attributeReferral = async () => {
      const storedCode = localStorage.getItem('sentinel_referral_code');
      
      if (storedCode && user) {
        try {
          await base44.functions.invoke('attributeReferralSignup', {
            referral_code: storedCode
          });
          
          // Clear after successful attribution
          localStorage.removeItem('sentinel_referral_code');
          console.log('[Referral] Successfully attributed signup');
        } catch (error) {
          // Only clear if attribution failed with "already attributed" error
          if (error.response?.data?.existing) {
            localStorage.removeItem('sentinel_referral_code');
          }
        }
      }
    };

    attributeReferral();
  }, [user]);

  const plans = [
    {
      id: 'analyst',
      name: 'Analyst',
      price: { monthly: 99, annual: 990 },
      description: 'Solo analysts & small teams',
      features: [
        '1 user seat',
        '5 active cases',
        '50GB evidence storage',
        'Core forensic tools (BLE, Network Monitor)',
        'Basic reporting (PDF/CSV)',
        'Chain of custody tracking',
        'Email support (48hr)'
      ],
      cta: 'Start with Analyst',
      popular: false,
      limits: {
        users: 1,
        cases: 5,
        storage: '50GB',
        ai: 'None',
        integrations: 0
      }
    },
    {
      id: 'professional',
      name: 'Professional',
      price: { monthly: 299, annual: 2990 },
      description: 'Growing teams & MSPs',
      features: [
        '5 user seats (+$50/user/mo)',
        'Unlimited cases',
        '250GB storage (+$25/50GB)',
        'Team collaboration & assignments',
        'Automated reports + scheduling',
        '10 integrations (Threat Intel, SIEM)',
        'AI analysis (10 queries/month)',
        'Compliance (GDPR, HIPAA, SOC2)',
        'Priority email (24hr)'
      ],
      cta: 'Go Professional',
      popular: true,
      badge: 'Most Popular',
      limits: {
        users: 5,
        cases: -1,
        storage: '250GB',
        ai: '10/month',
        integrations: 10
      }
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: { monthly: 799, annual: 7990 },
      description: 'Agencies & large organizations',
      features: [
        '25 user seats (+$40/user/mo)',
        'Unlimited cases',
        '1TB storage (+$20/50GB)',
        'Unlimited integrations',
        'Unlimited AI analysis',
        'Automated remediation engine',
        'Incident playbooks + drill simulator',
        'Expert network access',
        'SSO/SAML + API access',
        'Phone + email (4hr SLA)',
        'Quarterly security reviews'
      ],
      cta: 'Go Enterprise',
      popular: false,
      badge: 'Best Value',
      limits: {
        users: 25,
        cases: -1,
        storage: '1TB',
        ai: 'Unlimited',
        integrations: -1
      }
    },
    {
      id: 'sovereign',
      name: 'Sovereign',
      price: { monthly: 'Custom', annual: 'Custom' },
      description: 'Government & mission-critical',
      features: [
        'Unlimited users & storage',
        'Dedicated instance (isolated tenant)',
        'FedRAMP/CJIS compliance',
        'Blockchain-anchored evidence',
        'Court-ready reports + affidavits',
        'Guardian review workflows',
        '24/7 support (1hr critical SLA)',
        'Custom development (40 hrs/yr)',
        'On-premise deployment option',
        'Annual security audit + pen testing',
        'Training credits ($10K/yr)',
        'White-label reporting'
      ],
      cta: 'Contact Sales',
      popular: false,
      badge: 'Custom',
      customPricing: true,
      limits: {
        users: -1,
        cases: -1,
        storage: 'Unlimited',
        ai: 'Unlimited',
        integrations: -1
      }
    }
  ];

  const handleSubscribe = async (tier) => {
    if (!user) {
      toast.error('Please sign in to subscribe');
      return;
    }

    // Sovereign tier requires sales contact
    if (tier === 'sovereign') {
      window.location.href = 'mailto:sales@sentinelforensics.com?subject=Sovereign%20Tier%20Inquiry';
      return;
    }

    setLoading(true);
    setSelectedTier(tier);

    try {
      const { data } = await base44.functions.invoke('createStripeCheckout', {
        tier,
        period: billingPeriod,
        referralCode
      });

      // Track analytics
      await base44.entities.AnalyticsEvent.create({
        event_type: 'upgrade_clicked',
        user_email: user.email,
        timestamp: new Date().toISOString(),
        metadata: {
          tier,
          period: billingPeriod,
          referral_code: referralCode || null
        }
      });

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Failed to start checkout', {
        description: error.message,
        style: {
          background: '#7F1D1D',
          border: '1px solid #DC2626',
          color: '#FEE2E2'
        }
      });
      setLoading(false);
      setSelectedTier(null);
    }
  };

  const currentTier = user?.subscription_tier || 'analyst';
  const annualSavings = (plan) => {
    if (plan.customPricing) return 0;
    const monthlyCost = plan.price.monthly * 12;
    const annualCost = plan.price.annual;
    return monthlyCost - annualCost;
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 px-4 py-1">
            PRICING
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-white">
            Choose Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-red-600">Investigation Platform</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            From solo analysts to federal agencies — forensic-grade evidence management and threat intelligence
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-4">
          <Label className={billingPeriod === 'monthly' ? 'text-white font-semibold' : 'text-slate-400'}>
            Monthly
          </Label>
          <Switch
            checked={billingPeriod === 'annual'}
            onCheckedChange={(checked) => setBillingPeriod(checked ? 'annual' : 'monthly')}
            className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-red-600 data-[state=checked]:to-red-700"
          />
          <Label className={billingPeriod === 'annual' ? 'text-white font-semibold' : 'text-slate-400'}>
            Annual
            <Badge className="ml-2 bg-green-500/20 text-green-300 border-green-500/30">
              2 months free
            </Badge>
          </Label>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const price = plan.customPricing ? 'Custom' : plan.price[billingPeriod];
            const isCurrentTier = currentTier === plan.id;

            return (
              <Card
                key={plan.id}
                className={`relative ${
                  plan.popular
                    ? 'bg-gradient-to-br from-red-900/30 to-red-800/30 border-red-500/50 scale-105'
                    : 'bg-slate-900/50 border-slate-800'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className={`${
                      plan.popular 
                        ? 'bg-gradient-to-r from-red-600 to-red-700' 
                        : 'bg-gradient-to-r from-slate-600 to-slate-700'
                    } text-white px-4 py-1`}>
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                <CardHeader className="pt-8">
                  <CardTitle className="text-white">
                    <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                    <p className="text-sm text-slate-400 font-normal">{plan.description}</p>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                  <div className="text-center py-4">
                    <div className="flex items-baseline justify-center gap-2">
                      {plan.customPricing ? (
                        <span className="text-4xl font-bold text-white">Custom Pricing</span>
                      ) : (
                        <>
                          <span className="text-5xl font-bold text-white">
                            ${price}
                          </span>
                          <span className="text-slate-400">
                            /{billingPeriod === 'monthly' ? 'mo' : 'yr'}
                          </span>
                        </>
                      )}
                    </div>
                    {!plan.customPricing && billingPeriod === 'annual' && annualSavings(plan) > 0 && (
                      <p className="text-sm text-green-400 mt-2">
                        Save ${annualSavings(plan).toFixed(0)}/year
                      </p>
                    )}
                  </div>

                  <div className="space-y-3 min-h-[300px]">
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-slate-300">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loading || isCurrentTier}
                    className={`w-full min-h-[44px] ${
                      plan.popular
                        ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800'
                        : 'bg-slate-800 hover:bg-slate-700 border border-slate-700'
                    }`}
                  >
                    {loading && selectedTier === plan.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : isCurrentTier ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Current Plan
                      </>
                    ) : (
                      <>
                        {plan.cta}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Features Comparison */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-xl">Feature Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left text-slate-400 p-4">Feature</th>
                    <th className="text-center text-slate-400 p-4">Analyst</th>
                    <th className="text-center text-slate-400 p-4">Professional</th>
                    <th className="text-center text-slate-400 p-4">Enterprise</th>
                    <th className="text-center text-slate-400 p-4">Sovereign</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-800/50">
                    <td className="text-slate-300 p-4">User Seats</td>
                    <td className="text-center text-white p-4">1</td>
                    <td className="text-center text-white p-4">5</td>
                    <td className="text-center text-white p-4">25</td>
                    <td className="text-center text-white p-4">Unlimited</td>
                  </tr>
                  <tr className="border-b border-slate-800/50">
                    <td className="text-slate-300 p-4">Active Cases</td>
                    <td className="text-center text-white p-4">5</td>
                    <td className="text-center text-white p-4">Unlimited</td>
                    <td className="text-center text-white p-4">Unlimited</td>
                    <td className="text-center text-white p-4">Unlimited</td>
                  </tr>
                  <tr className="border-b border-slate-800/50">
                    <td className="text-slate-300 p-4">Evidence Storage</td>
                    <td className="text-center text-white p-4">50GB</td>
                    <td className="text-center text-white p-4">250GB</td>
                    <td className="text-center text-white p-4">1TB</td>
                    <td className="text-center text-white p-4">Unlimited</td>
                  </tr>
                  <tr className="border-b border-slate-800/50">
                    <td className="text-slate-300 p-4">AI Analysis</td>
                    <td className="text-center text-slate-500 p-4">—</td>
                    <td className="text-center text-white p-4">10/month</td>
                    <td className="text-center p-4"><Check className="w-5 h-5 text-green-400 mx-auto" /></td>
                    <td className="text-center p-4"><Check className="w-5 h-5 text-green-400 mx-auto" /></td>
                  </tr>
                  <tr className="border-b border-slate-800/50">
                    <td className="text-slate-300 p-4">Integrations</td>
                    <td className="text-center text-slate-500 p-4">—</td>
                    <td className="text-center text-white p-4">10</td>
                    <td className="text-center p-4"><Check className="w-5 h-5 text-green-400 mx-auto" /></td>
                    <td className="text-center p-4"><Check className="w-5 h-5 text-green-400 mx-auto" /></td>
                  </tr>
                  <tr className="border-b border-slate-800/50">
                    <td className="text-slate-300 p-4">Automation & Remediation</td>
                    <td className="text-center text-slate-500 p-4">—</td>
                    <td className="text-center p-4"><Check className="w-5 h-5 text-green-400 mx-auto" /></td>
                    <td className="text-center p-4"><Check className="w-5 h-5 text-green-400 mx-auto" /></td>
                    <td className="text-center p-4"><Check className="w-5 h-5 text-green-400 mx-auto" /></td>
                  </tr>
                  <tr className="border-b border-slate-800/50">
                    <td className="text-slate-300 p-4">Compliance Frameworks</td>
                    <td className="text-center text-slate-500 p-4">—</td>
                    <td className="text-center p-4"><Check className="w-5 h-5 text-green-400 mx-auto" /></td>
                    <td className="text-center p-4"><Check className="w-5 h-5 text-green-400 mx-auto" /></td>
                    <td className="text-center p-4"><Check className="w-5 h-5 text-green-400 mx-auto" /></td>
                  </tr>
                  <tr className="border-b border-slate-800/50">
                    <td className="text-slate-300 p-4">SSO/SAML + API Access</td>
                    <td className="text-center text-slate-500 p-4">—</td>
                    <td className="text-center text-slate-500 p-4">—</td>
                    <td className="text-center p-4"><Check className="w-5 h-5 text-green-400 mx-auto" /></td>
                    <td className="text-center p-4"><Check className="w-5 h-5 text-green-400 mx-auto" /></td>
                  </tr>
                  <tr className="border-b border-slate-800/50">
                    <td className="text-slate-300 p-4">Blockchain Evidence</td>
                    <td className="text-center text-slate-500 p-4">—</td>
                    <td className="text-center text-slate-500 p-4">—</td>
                    <td className="text-center text-slate-500 p-4">—</td>
                    <td className="text-center p-4"><Check className="w-5 h-5 text-green-400 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="text-slate-300 p-4">Support SLA</td>
                    <td className="text-center text-white p-4">48hr</td>
                    <td className="text-center text-white p-4">24hr</td>
                    <td className="text-center text-white p-4">4hr</td>
                    <td className="text-center text-white p-4">1hr (24/7)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Referral Banner */}
        {referralCode && (
          <Card className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border-green-500/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-green-400" />
                <div>
                  <p className="text-lg font-semibold text-green-300">
                    You've been referred to Sentinel Forensics!
                  </p>
                  <p className="text-sm text-green-200 mt-1">
                    Your referrer earns 10% recurring commission when you subscribe. No extra cost to you!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* FAQ */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-xl">Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-white font-semibold mb-2">Can I change plans later?</h4>
              <p className="text-sm text-slate-400">
                Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, and we'll prorate the difference.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-2">What payment methods do you accept?</h4>
              <p className="text-sm text-slate-400">
                We accept all major credit cards through Stripe, and PayPal for added flexibility.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-2">Is there a free trial?</h4>
              <p className="text-sm text-slate-400">
                Yes! We offer a 14-day trial on the Professional tier with full feature access. No credit card required.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-2">How does the referral program work?</h4>
              <p className="text-sm text-slate-400">
                Share your unique referral link and earn 10% recurring commission on every paying subscriber you refer. Payouts are processed monthly.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}