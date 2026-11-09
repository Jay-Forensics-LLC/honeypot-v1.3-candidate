import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle, MessageSquare, Users, CheckCircle2, Loader2 } from 'lucide-react';

export default function IncidentTimelineVisualization({ incidentId, incidentType, incidentData }) {
  const { data: comments = [] } = useQuery({
    queryKey: ['incident-comments', incidentId],
    queryFn: async () => {
      return await base44.entities.IncidentComment.filter(
        { incident_id: incidentId, incident_type: incidentType },
        '-created_date',
        100
      );
    },
    enabled: !!incidentId
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['incident-assignments', incidentId],
    queryFn: async () => {
      return await base44.entities.IncidentAssignment.filter(
        { incident_id: incidentId, incident_type: incidentType },
        '-created_date',
        50
      );
    },
    enabled: !!incidentId
  });

  // Build timeline events
  const timelineEvents = [
    {
      type: 'creation',
      timestamp: incidentData?.created_date || incidentData?.detection_timestamp,
      title: `${incidentType === 'alert' ? 'Alert' : 'Case'} Created`,
      description: incidentData?.title || incidentData?.case_number,
      icon: AlertTriangle,
      color: 'text-orange-500'
    },
    ...comments.map(comment => ({
      type: 'comment',
      timestamp: comment.created_date,
      title: comment.comment_type === 'comment' ? 'Comment Added' : comment.comment_type.replace('_', ' ').toUpperCase(),
      description: `${comment.author_name}: ${comment.content.substring(0, 50)}${comment.content.length > 50 ? '...' : ''}`,
      icon: MessageSquare,
      color: 'text-blue-500'
    })),
    ...assignments.map(assignment => ({
      type: 'assignment',
      timestamp: assignment.created_date,
      title: assignment.status === 'active' ? 'Team Member Assigned' : 'Assignment Removed',
      description: `${assignment.assigned_to_name} (${assignment.role})`,
      icon: Users,
      color: 'text-purple-500'
    }))
  ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (timelineEvents.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Clock className="w-5 h-5 text-blue-500" />
            Incident Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Clock className="w-5 h-5 text-blue-500" />
          Incident Timeline
          <Badge variant="outline" className="ml-auto">
            {timelineEvents.length} events
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-700" />

          <div className="space-y-6">
            {timelineEvents.map((event, idx) => {
              const Icon = event.icon;
              return (
                <div key={idx} className="relative flex gap-4">
                  {/* Timeline dot */}
                  <div className="relative z-10 flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center">
                      <Icon className={`w-4 h-4 ${event.color}`} />
                    </div>
                  </div>

                  {/* Event content */}
                  <div className="flex-1 pb-6">
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-medium text-white">{event.title}</h4>
                        <span className="text-xs text-slate-500">
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400">{event.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Current status indicator */}
            {incidentData?.status && (
              <div className="relative flex gap-4">
                <div className="relative z-10 flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-green-900/20 border-2 border-green-500/50 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="bg-green-900/10 rounded-lg p-3 border border-green-500/30">
                    <h4 className="text-sm font-medium text-green-300">Current Status</h4>
                    <p className="text-sm text-green-400 capitalize">{incidentData.status}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}