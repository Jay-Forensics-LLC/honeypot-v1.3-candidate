import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useUser } from '../hooks/useUser';
import { Send, AlertCircle, Users, Bell } from 'lucide-react';
import { formatRelativeTime } from '../utils';

export default function TeamMessaging({ caseId, evidenceId, channel = 'general' }) {
  const { data: user } = useUser();
  const [message, setMessage] = useState('');
  const [isPriority, setIsPriority] = useState(false);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['team-messages', caseId, channel, user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      const filter = {
        organization_id: user.organization_id,
        channel,
        ...(caseId && { case_id: caseId }),
        ...(evidenceId && { evidence_id: evidenceId })
      };
      return await base44.entities.TeamMessage.filter(filter, '-created_date', 100);
    },
    enabled: !!user?.organization_id,
    refetchInterval: 3000, // Real-time polling
    suspense: false
  });

  const sendMutation = useMutation({
    mutationFn: async (messageData) => {
      return await base44.entities.TeamMessage.create({
        organization_id: user.organization_id,
        case_id: caseId,
        evidence_id: evidenceId,
        channel,
        sender_name: user.full_name || user.email,
        message: messageData.content,
        message_type: messageData.type || 'text',
        is_priority: messageData.isPriority,
        read_by: [user.email]
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-messages'] });
      setMessage('');
      setIsPriority(false);
    }
  });

  const markReadMutation = useMutation({
    mutationFn: async (msgId) => {
      const msg = messages.find(m => m.id === msgId);
      if (!msg || msg.read_by?.includes(user.email)) return;
      return await base44.entities.TeamMessage.update(msgId, {
        read_by: [...(msg.read_by || []), user.email]
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-messages'] });
    }
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;
    sendMutation.mutate({ content: message, isPriority });
  };

  const channelColors = {
    general: 'bg-slate-600',
    incident: 'bg-red-600',
    investigation: 'bg-blue-600',
    urgent: 'bg-orange-600'
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800 h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            Team Chat
            <Badge className={channelColors[channel]}>
              {channel}
            </Badge>
          </CardTitle>
          <Badge variant="outline" className="text-slate-400">
            {messages.length} messages
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto space-y-3 mb-4">
          {isLoading ? (
            <div className="text-center text-slate-400 py-4">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-slate-400 py-8">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.created_by === user?.email;
              const unread = !msg.read_by?.includes(user?.email);

              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  onMouseEnter={() => unread && markReadMutation.mutate(msg.id)}
                >
                  <div className={`max-w-[80%] ${isOwn ? 'bg-blue-600' : 'bg-slate-800'} rounded-lg p-3`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-white">
                        {msg.sender_name}
                      </span>
                      {msg.is_priority && (
                        <AlertCircle className="w-3 h-3 text-red-400" />
                      )}
                      {unread && (
                        <Bell className="w-3 h-3 text-yellow-400" />
                      )}
                    </div>
                    <p className="text-sm text-white break-words">{msg.message}</p>
                    <span className="text-xs text-slate-400 mt-1 block">
                      {formatRelativeTime(msg.created_date)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={isPriority ? 'destructive' : 'outline'}
            onClick={() => setIsPriority(!isPriority)}
            className="shrink-0"
          >
            <AlertCircle className="w-4 h-4" />
          </Button>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="bg-slate-800 border-slate-700 text-white"
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}