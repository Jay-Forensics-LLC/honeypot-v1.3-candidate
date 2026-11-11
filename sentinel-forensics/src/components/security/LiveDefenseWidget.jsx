import { Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Live Defense Status Widget - iOS SAFE v2
 * Shows defense system status in dashboard/header
 * CRITICAL: Handles errors gracefully on iOS
 */
export default function LiveDefenseWidget({ compact = false }) {
  const { data: user, error } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
    retry: 0,
    useErrorBoundary: false
  });

  // iOS FIX: Gracefully handle missing user
  if (error || !user) {
    console.warn('LiveDefenseWidget: User not available');
    return null; // Don't render if user unavailable
  }

  const defensePreferences = user?.defense_preferences || {
    network_monitoring: true,
    behavioral_analysis: true,
    api_hooking_detection: true,
    memory_integrity: true,
    privilege_monitoring: true,
    zero_day_protection: true
  };

  const activeCount = Object.values(defensePreferences).filter(Boolean).length;
  const totalCount = Object.keys(defensePreferences).length;
  const allActive = activeCount === totalCount;
  const noneActive = activeCount === 0;

  if (compact) {
    return (
      <Badge 
        variant="outline" 
        className={
          allActive 
            ? 'bg-green-500/20 text-green-400 border-green-500/50' 
            : noneActive
            ? 'bg-red-500/20 text-red-400 border-red-500/50'
            : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
        }
      >
        <Shield className="w-3 h-3 mr-1" />
        {activeCount}/{totalCount}
      </Badge>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              allActive ? 'bg-green-500/20' : noneActive ? 'bg-red-500/20' : 'bg-yellow-500/20'
            }`}>
              <Shield className={`w-6 h-6 ${
                allActive ? 'text-green-400' : noneActive ? 'text-red-400' : 'text-yellow-400'
              }`} />
            </div>
            <div>
              <h4 className="font-semibold text-white text-sm">Live Defense</h4>
              <p className="text-xs text-slate-400">
                {allActive ? 'All systems active' : noneActive ? 'All systems inactive' : `${activeCount}/${totalCount} active`}
              </p>
            </div>
          </div>
          {allActive ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : noneActive ? (
            <AlertTriangle className="w-5 h-5 text-red-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}