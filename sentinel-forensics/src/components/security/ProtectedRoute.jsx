
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, Shield, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const tierHierarchy = {
  free: 0,
  plus: 1,
  pro: 2
};

export default function ProtectedRoute({ children, requiredTier, requiredFeature, featureName }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      
      const userTierLevel = tierHierarchy[userData.subscription_tier] || 0;
      const requiredTierLevel = tierHierarchy[requiredTier] || 0;
      
      const meetsRequirement = userTierLevel >= requiredTierLevel && 
                               userData.subscription_status === 'active';
      
      setHasAccess(meetsRequirement);
    } catch (error) {
      console.error('Access check failed:', error);
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 md:p-6">
        <Card className="max-w-lg w-full bg-slate-900/50 border-slate-800 backdrop-blur-xl">
          <CardHeader className="text-center p-6 md:p-8">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/20">
              <Lock className="w-8 h-8 md:w-10 md:h-10 text-white" />
            </div>
            <CardTitle className="text-xl md:text-2xl text-white mb-2">
              Premium Feature Locked
            </CardTitle>
            <p className="text-sm md:text-base text-slate-400">
              {featureName || 'This feature'} requires a {requiredTier} subscription or higher.
            </p>
          </CardHeader>
          <CardContent className="p-6 md:p-8 pt-0 space-y-4">
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">Advanced Security Tools</p>
                  <p className="text-xs text-slate-400">Nation-state threat detection</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-purple-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">Real-time Monitoring</p>
                  <p className="text-xs text-slate-400">24/7 surveillance detection</p>
                </div>
              </div>
            </div>
            
            <div className="text-center pt-2">
              <p className="text-xs md:text-sm text-slate-400 mb-4">
                Current Plan: <span className="text-white font-semibold">{(user?.subscription_tier || 'free').toUpperCase()}</span>
              </p>
              <Link to={createPageUrl('Profile')} className="w-full">
                <Button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-sm md:text-base">
                  Upgrade to {requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return children;
}
