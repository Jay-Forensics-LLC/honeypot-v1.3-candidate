import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send, Loader2, Clock, User } from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/components/utils';

export default function IncidentChatPanel({ incidentId, incidentType }) {
  const [newComment, setNewComment] = useState('');
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['incident-comments', incidentId],
    queryFn: async () => {
      // SECURITY FIX: Validate organization access
      if (!user?.organization_id) return [];
      
      return await base44.entities.IncidentComment.filter(
        { 
          incident_id: incidentId, 
          incident_type: incidentType,
          organization_id: user.organization_id 
        },
        '-created_date',
        100
      );
    },
    refetchInterval: 10000, // SECURITY FIX: Reduced polling frequency to 10s
    enabled: !!incidentId && !!user?.organization_id
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content) => {
      // SECURITY FIX: Add organization_id
      return await base44.entities.IncidentComment.create({
        incident_id: incidentId,
        incident_type: incidentType,
        organization_id: user?.organization_id,
        author_name: user?.full_name || 'Unknown',
        author_email: user?.email,
        content,
        comment_type: 'comment'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['incident-comments', incidentId]);
      setNewComment('');
      toast.success('Comment added');
    },
    onError: (error) => {
      toast.error('Failed to add comment: ' + error.message);
    }
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    addCommentMutation.mutate(newComment.trim());
  };

  const getCommentTypeColor = (type) => {
    switch (type) {
      case 'status_update': return 'bg-blue-500/20 text-blue-300';
      case 'assignment': return 'bg-purple-500/20 text-purple-300';
      case 'resolution': return 'bg-green-500/20 text-green-300';
      default: return 'bg-slate-700 text-slate-300';
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <MessageSquare className="w-5 h-5 text-blue-500" />
          Incident Chat
          <Badge variant="outline" className="ml-auto">
            {comments.length} messages
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[400px] overflow-y-auto space-y-3 p-3 bg-slate-950/50 rounded-lg border border-slate-800">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <MessageSquare className="w-12 h-12 mb-2" />
              <p className="text-sm">No comments yet. Start the conversation!</p>
            </div>
          ) : (
            <>
              {comments.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)).map((comment) => (
                <div
                  key={comment.id}
                  className={`p-3 rounded-lg ${
                    comment.author_email === user?.email
                      ? 'bg-blue-900/20 border border-blue-500/30 ml-8'
                      : 'bg-slate-800/50 mr-8'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                        <User className="w-4 h-4 text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {comment.author_name}
                          {comment.author_email === user?.email && (
                            <span className="text-xs text-blue-400 ml-2">(You)</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(comment.created_date)}
                        </div>
                      </div>
                    </div>
                    {comment.comment_type !== 'comment' && (
                      <Badge className={getCommentTypeColor(comment.comment_type)}>
                        {comment.comment_type.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{comment.content}</p>
                  
                  {comment.metadata && (
                    <div className="mt-2 pt-2 border-t border-slate-700 text-xs text-slate-400">
                      {comment.metadata.status_change && (
                        <span>Status: {comment.metadata.status_change.from} → {comment.metadata.status_change.to}</span>
                      )}
                      {comment.metadata.assigned_to && (
                        <span>Assigned to: {comment.metadata.assigned_to}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Type a comment... (Use @email to mention team members)"
            className="flex-1 bg-slate-800 border-slate-700 text-white min-h-[80px]"
            disabled={addCommentMutation.isPending}
          />
          <Button
            type="submit"
            disabled={!newComment.trim() || addCommentMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {addCommentMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}