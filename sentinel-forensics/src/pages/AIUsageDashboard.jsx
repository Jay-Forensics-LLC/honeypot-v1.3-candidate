import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, DollarSign, Zap, AlertCircle } from 'lucide-react';
import { useUser } from '../components/hooks/useUser';

export default function AIUsageDashboard() {
  const { data: user } = useUser();
  const currentMonth = new Date().toISOString().slice(0, 7);

  const { data: metrics = [] } = useQuery({
    queryKey: ['usage-metrics', user?.organization_id, currentMonth],
    queryFn: async () => {
      return await base44.entities.UsageMetric.filter({
        organization_id: user.organization_id,
        metric_type: 'ai_tokens',
        month: currentMonth
      });
    },
    enabled: !!user?.organization_id
  });

  const tierLimits = {
    'free': 10000,
    'professional': 100000,
    'enterprise': 1000000,
    'forensic_suite': -1
  };

  const currentUsage = metrics[0]?.value || 0;
  const tier = user?.subscription_tier || 'free';
  const limit = tierLimits[tier];
  const percentage = limit === -1 ? 0 : (currentUsage / limit) * 100;

  const totalCost = metrics.reduce((sum, m) => 
    sum + (m.metadata?.cost_incurred || 0), 0
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">AI Usage Dashboard</h1>
        <p className="text-slate-400">Monitor your AI model usage and costs</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Sparkles className="w-10 h-10 text-purple-400" />
              <div>
                <p className="text-sm text-slate-400">Tokens Used</p>
                <p className="text-3xl font-bold text-white">{currentUsage.toLocaleString()}</p>
                <p className="text-xs text-slate-500">
                  {limit === -1 ? 'Unlimited' : `of ${limit.toLocaleString()}`}
                </p>
              </div>
            </div>
            {limit !== -1 && (
              <div className="mt-4">
                <div className="w-full bg-slate-800 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      percentage > 90 ? 'bg-red-500' : 
                      percentage > 70 ? 'bg-yellow-500' : 
                      'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">{percentage.toFixed(1)}% used</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <DollarSign className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-sm text-slate-400">Total Cost</p>
                <p className="text-3xl font-bold text-white">${totalCost.toFixed(2)}</p>
                <p className="text-xs text-slate-500">This month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Zap className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-sm text-slate-400">Subscription Tier</p>
                <Badge className="bg-gradient-to-r from-purple-600 to-blue-600 text-white mt-2">
                  {tier.toUpperCase()}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {percentage > 80 && limit !== -1 && (
        <Card className="bg-yellow-950/20 border-yellow-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-yellow-400" />
            <div>
              <p className="text-yellow-200 font-medium">
                Approaching Usage Limit
              </p>
              <p className="text-sm text-yellow-300">
                You've used {percentage.toFixed(1)}% of your monthly AI token allowance. 
                Consider upgrading to continue using AI features.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}