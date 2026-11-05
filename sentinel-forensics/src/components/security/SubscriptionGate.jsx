import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, Crown, Zap, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TIER_HIERARCHY = {
  free: 0,
  professional: 1,
  enterprise: 2,
  forensic_suite: 3
};

export default function SubscriptionGate({ requiredTier = 'professional', children, featureName }) {
  const navigate = useNavigate();
  
  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  const userTier = user?.subscription_tier || 'free';
  const userTierLevel = TIER_HIERARCHY[userTier] || 0;
  const requiredTierLevel = TIER_HIERARCHY[requiredTier] || 1;

  const hasAccess = userTierLevel >= requiredTierLevel;

  if (hasAccess) {
    return <>{children}</>;
  }

  const tierIcons = {
    professional: Lock,
    enterprise: Crown,
    forensic_suite: Zap
  };

  const tierNames = {
    professional: 'Professional',
    enterprise: 'Enterprise',
    forensic_suite: 'Forensic Suite'
  };

  const tierColors = {
    professional: 'from-blue-600 to-cyan-600',
    enterprise: 'from-purple-600 to-pink-600',
    forensic_suite: 'from-red-600 to-orange-600'
  };

  const Icon = tierIcons[requiredTier] || Lock;

  return (
    <div className="p-6 min-h-[600px] flex items-center justify-center">
      <Card className="max-w-2xl w-full bg-slate-900/50 border-slate-800">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center border-2 border-slate-700">
            <Icon className="w-10 h-10 text-slate-400" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-white mb-2">
              Premium Feature
            </CardTitle>
            <p className="text-slate-400">
              {featureName || 'This feature'} requires a {tierNames[requiredTier]} subscription or higher
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">Your Current Plan</p>
                <p className="text-lg font-semibold text-white capitalize">{userTier.replace('_', ' ')}</p>
              </div>
              <Badge className="bg-slate-700 text-slate-300">
                Active
              </Badge>
            </div>
          </div>

          <div className={`bg-gradient-to-br ${tierColors[requiredTier]} rounded-lg p-6 border-2 border-white/20`}>
            <div className="text-center text-white space-y-4">
              <div className="mx-auto w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Icon className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">{tierNames[requiredTier]} Plan</h3>
                <p className="text-white/90 text-sm">
                  Unlock advanced forensic capabilities, threat intelligence, and military-grade security features
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-300">Unlocked with {tierNames[requiredTier]}:</p>
            <ul className="space-y-2 text-sm text-slate-400">
              {requiredTier === 'professional' && (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">✓</span>
                    <span>Advanced Pegasus Defense Suite</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">✓</span>
                    <span>AI-Powered Forensic Reports</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">✓</span>
                    <span>Threat Intelligence Integration</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">✓</span>
                    <span>IOC Extraction & Correlation</span>
                  </li>
                </>
              )}
              {requiredTier === 'enterprise' && (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">✓</span>
                    <span>Unlimited Device Monitoring</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">✓</span>
                    <span>Zero-Click Exploit Scanning</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">✓</span>
                    <span>Advanced API Access</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">✓</span>
                    <span>Priority Support</span>
                  </li>
                </>
              )}
              {requiredTier === 'forensic_suite' && (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 mt-0.5">✓</span>
                    <span>Military-Grade Security</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 mt-0.5">✓</span>
                    <span>Automated Threat Hunting</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 mt-0.5">✓</span>
                    <span>Unlimited API Calls</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 mt-0.5">✓</span>
                    <span>Federal Compliance</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => navigate('/subscription')}
              className={`flex-1 bg-gradient-to-r ${tierColors[requiredTier]} hover:opacity-90 text-white font-semibold`}
            >
              Upgrade to {tierNames[requiredTier]}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Go Back
            </Button>
          </div>

          {requiredTier === 'forensic_suite' && (
            <div className="text-center pt-4 border-t border-slate-700">
              <p className="text-sm text-slate-400">
                Need custom deployment or federal compliance?
              </p>
              <Button
                variant="link"
                className="text-blue-400 hover:text-blue-300"
                onClick={() => window.location.href = 'mailto:sales@sentinel-forensics.com'}
              >
                Contact Sales Team
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}