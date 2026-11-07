import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, Shield, FileText, AlertTriangle, 
  CheckCircle, Upload, UserPlus, Settings
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const getActivityIcon = (type) => {
  const icons = {
    case_created: FileText,
    evidence_uploaded: Upload,
    alert_triggered: AlertTriangle,
    scan_completed: CheckCircle,
    user_invited: UserPlus,
    settings_changed: Settings,
    device_enrolled: Shield
  };
  return icons[type] || Activity;
};

const getActivityColor = (type) => {
  const colors = {
    case_created: 'text-blue-400 bg-blue-500/20',
    evidence_uploaded: 'text-purple-400 bg-purple-500/20',
    alert_triggered: 'text-red-400 bg-red-500/20',
    scan_completed: 'text-green-400 bg-green-500/20',
    user_invited: 'text-cyan-400 bg-cyan-500/20',
    settings_changed: 'text-orange-400 bg-orange-500/20',
    device_enrolled: 'text-indigo-400 bg-indigo-500/20'
  };
  return colors[type] || 'text-slate-400 bg-slate-500/20';
};

export default function ActivityFeed({ limit = 20, showTitle = true }) {
  const { data: user } = useUser();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['activity-feed', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      
      const events = await base44.entities.AuditLog.filter(
        { organization_id: user.organization_id },
        '-timestamp',
        limit
      );
      
      return events.map(event => ({
        id: event.id,
        type: event.action || 'activity',
        description: event.details || event.action,
        user: event.user_email || event.actor_email,
        timestamp: event.timestamp || event.created_date,
        metadata: event.metadata || {}
      }));
    },
    enabled: !!user?.organization_id,
    refetchInterval: 30000,
    staleTime: 15000
  });

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        {showTitle && (
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse flex gap-3">
                <div className="w-10 h-10 bg-slate-800 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-800 rounded w-3/4" />
                  <div className="h-3 bg-slate-800 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        {showTitle && (
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div className="text-center py-8">
            <Activity className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 text-sm">No recent activity</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      {showTitle && (
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="p-0">
        <ScrollArea className="h-[400px] px-6 py-4">
          <div className="space-y-4">
            {activities.map((activity) => {
              const Icon = getActivityIcon(activity.type);
              const colorClass = getActivityColor(activity.type);
              
              return (
                <div key={activity.id} className="flex gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium line-clamp-2">
                      {activity.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-400">{activity.user}</span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-slate-500">
                        {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}