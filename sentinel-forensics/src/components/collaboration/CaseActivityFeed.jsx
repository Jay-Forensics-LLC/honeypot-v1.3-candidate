import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity,
  FileText,
  CheckCircle,
  UserPlus,
  FileDown,
  Scale,
  Shield,
  Edit
} from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';

export default function CaseActivityFeed({ caseId }) {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['case-activities', caseId],
    queryFn: () => base44.entities.CaseActivity.filter({ case_id: caseId }, '-timestamp', 50)
  });

  const getActivityIcon = (type) => {
    const icons = {
      evidence_added: FileText,
      evidence_verified: CheckCircle,
      annotation_added: Edit,
      role_assigned: UserPlus,
      report_generated: FileDown,
      legal_hold_issued: Scale,
      court_approval: Shield,
      case_status_changed: Activity,
      export_created: FileDown
    };
    return icons[type] || Activity;
  };

  const getActivityColor = (type) => {
    const colors = {
      evidence_added: 'text-blue-400',
      evidence_verified: 'text-green-400',
      annotation_added: 'text-purple-400',
      role_assigned: 'text-yellow-400',
      report_generated: 'text-cyan-400',
      legal_hold_issued: 'text-red-400',
      court_approval: 'text-green-400',
      case_status_changed: 'text-orange-400',
      export_created: 'text-blue-400'
    };
    return colors[type] || 'text-slate-400';
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400">No recent activity</p>
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="space-y-3">
              {activities.map((activity) => {
                const Icon = getActivityIcon(activity.activity_type);
                const iconColor = getActivityColor(activity.activity_type);

                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
                  >
                    <div className={`w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">{activity.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400">{activity.actor_email}</span>
                        {activity.actor_role && (
                          <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">
                            {activity.actor_role.replace('_', ' ')}
                          </Badge>
                        )}
                        <span className="text-xs text-slate-500">
                          {DateUtils.safeRelativeTime(activity.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}