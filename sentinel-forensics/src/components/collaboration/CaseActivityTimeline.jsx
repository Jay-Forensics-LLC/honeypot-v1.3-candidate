import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  MessageSquare, Send, Loader2, User, Settings, CheckCircle, 
  Database, UserPlus, UserMinus, AlertCircle 
} from 'lucide-react';
import { toast } from 'sonner';
import { DateUtils } from '../utils/DateUtils';

/**
 * CASE ACTIVITY TIMELINE
 * Unified, append-only activity feed for case collaboration
 * 
 * AUDIT COMPLIANCE:
 * - Immutable records (no edits/deletes)
 * - Chronological ordering
 * - Full attribution
 * - System events auto-logged
 */
export default function CaseActivityTimeline({ caseId }) {
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['case-activity', caseId],
    queryFn: async () => {
      const results = await base44.entities.CaseActivity.filter({ case_id: caseId });
      return results.sort((a, b) => 
        new Date(a.created_date) - new Date(b.created_date)
      );
    },
    enabled: !!caseId,
    refetchInterval: 10000, // Poll every 10s for real-time feel
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content) => {
      if (!content.trim()) {
        throw new Error('Comment cannot be empty');
      }

      return base44.entities.CaseActivity.create({
        organization_id: user.organization_id,
        case_id: caseId,
        user_email: user.email,
        user_name: user.full_name,
        type: 'comment',
        content: content.trim(),
        metadata: {},
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-activity', caseId] });
      setNewComment('');
      toast.success('Comment added');
    },
    onError: (error) => {
      toast.error('Failed to add comment: ' + error.message);
    },
  });

  const getActivityIcon = (type) => {
    switch (type) {
      case 'comment':
        return <MessageSquare className="w-4 h-4 text-blue-400" />;
      case 'system':
        return <Settings className="w-4 h-4 text-slate-400" />;
      case 'task_update':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'assignment_change':
        return <User className="w-4 h-4 text-purple-400" />;
      case 'status_change':
        return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      case 'evidence_added':
        return <Database className="w-4 h-4 text-green-400" />;
      case 'member_added':
        return <UserPlus className="w-4 h-4 text-blue-400" />;
      case 'member_removed':
        return <UserMinus className="w-4 h-4 text-red-400" />;
      default:
        return <MessageSquare className="w-4 h-4 text-slate-400" />;
    }
  };

  const getActivityBadgeColor = (type) => {
    switch (type) {
      case 'comment':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
      case 'system':
        return 'bg-slate-500/20 text-slate-300 border-slate-500/50';
      case 'task_update':
        return 'bg-green-500/20 text-green-300 border-green-500/50';
      case 'member_added':
      case 'member_removed':
      case 'assignment_change':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/50';
      case 'evidence_added':
        return 'bg-green-500/20 text-green-300 border-green-500/50';
      case 'status_change':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/50';
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-400" />
          Activity Feed ({activities.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comment Input */}
        <div className="space-y-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="bg-slate-800 border-slate-700 text-white min-h-[80px]"
          />
          <div className="flex justify-end">
            <Button
              onClick={() => addCommentMutation.mutate(newComment)}
              disabled={!newComment.trim() || addCommentMutation.isPending}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              {addCommentMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Post
            </Button>
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {activities.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400">No activity yet</p>
            </div>
          ) : (
            activities.map((activity) => (
              <div
                key={activity.id}
                className="flex gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700"
              >
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-white font-medium">
                      {activity.user_name || activity.user_email || 'System'}
                    </span>
                    <Badge className={getActivityBadgeColor(activity.type)}>
                      {activity.type.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {DateUtils.safeFormatDate(activity.created_date)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">
                    {activity.content}
                  </p>
                  {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                    <div className="mt-2 text-xs text-slate-500">
                      {Object.entries(activity.metadata).map(([key, value]) => (
                        <span key={key} className="mr-3">
                          {key}: {JSON.stringify(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}