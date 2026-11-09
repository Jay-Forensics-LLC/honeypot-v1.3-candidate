import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import UpgradeButton from './UpgradeButton';

export default function UsageMeter({ metricType, label, unit = 'items' }) {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: usageData, isLoading, error } = useQuery({
    queryKey: ['usage-limit', metricType],
    queryFn: async () => {
      try {
        const { data } = await base44.functions.invoke('checkUsageLimit', { metricType });
        return data;
      } catch (error) {
        console.warn('Usage check failed (non-critical):', error);
        // Return safe defaults
        return {
          currentUsage: 0,
          limit: 100,
          remaining: 100,
          limitExceeded: false
        };
      }
    },
    enabled: !!user,
    retry: 0,
    staleTime: 60000,
    useErrorBoundary: false
  });

  // iOS FIX: Handle loading and error states gracefully
  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </CardContent>
      </Card>
    );
  }

  if (error || !usageData) {
    console.warn('UsageMeter error:', error);
    return null; // Gracefully hide on error
  }

  const { currentUsage, limit, remaining, limitExceeded } = usageData;
  const percentage = limit === -1 ? 0 : Math.min(100, (currentUsage / limit) * 100);
  const isUnlimited = limit === -1;

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white text-sm flex items-center justify-between">
          <span>{label}</span>
          {limitExceeded && (
            <Badge className="bg-red-500/20 text-red-300 border-red-500/30">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Limit Reached
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isUnlimited ? (
          <div className="text-center py-2">
            <p className="text-2xl font-bold text-green-400">∞</p>
            <p className="text-xs text-slate-400">Unlimited</p>
          </div>
        ) : (
          <>
            <Progress 
              value={percentage} 
              className={`h-2 ${
                limitExceeded 
                  ? 'bg-red-900/20 [&>div]:bg-red-500' 
                  : percentage > 80 
                  ? 'bg-yellow-900/20 [&>div]:bg-yellow-500'
                  : 'bg-blue-900/20 [&>div]:bg-blue-500'
              }`}
            />
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">
                {currentUsage} / {limit} {unit}
              </span>
              <span className={limitExceeded ? 'text-red-400' : 'text-slate-400'}>
                {remaining} remaining
              </span>
            </div>
          </>
        )}

        {limitExceeded && (
          <UpgradeButton feature={label.toLowerCase()} className="w-full mt-2" />
        )}
      </CardContent>
    </Card>
  );
}