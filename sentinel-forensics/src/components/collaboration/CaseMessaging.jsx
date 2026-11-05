import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageCircle, Shield, Send, AlertTriangle } from 'lucide-react';
import { formatRelativeTime } from '../utils';
import { toast } from 'sonner';

export default function CaseMessaging({ legalCaseId }) {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const [isPrivileged, setIsPrivileged] = useState(false);
  const messagesEndRef = useRef(null);

  const { data: messages = [] } = useQuery({
    queryKey: ['case-messages', legalCaseId],
    queryFn: () => base44.entities.CaseMessage.filter({ legal_case_id: legalCaseId }, '-created_date', 100),
    enabled: !!legalCaseId,
    refetchInterval: 5000
  });

  const sendMessageMutation = useMutation({
    mutationFn: (messageData) => base44.entities.CaseMessage.create(messageData),
    onSuccess: () => {
      queryClient.invalidateQueries(['case-messages']);
      setNewMessage('');
      setIsPrivileged(false);
    }
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!newMessage.trim()) return;

    sendMessageMutation.mutate({
      organization_id: user.organization_id,
      legal_case_id: legalCaseId,
      sender_email: user.email,
      sender_name: user.full_name || user.email,
      message: newMessage,
      message_type: isPrivileged ? 'privileged' : 'general',
      is_privileged: isPrivileged
    });
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800 h-[600px] flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Case Communications
          </CardTitle>
          <Badge variant="outline">{messages.length} messages</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {isPrivileged && (
          <Card className="bg-amber-900/20 border-amber-500/50 mb-4">
            <CardContent className="p-3">
              <div className="flex gap-2">
                <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-amber-200 text-xs">
                  Privileged mode active - communications protected by attorney-client privilege
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 mb-4">
          {messages.map(msg => (
            <div key={msg.id} className={`p-3 rounded-lg ${
              msg.sender_email === user?.email 
                ? 'bg-blue-900/30 ml-8' 
                : 'bg-slate-800/50 mr-8'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-medium text-sm">{msg.sender_name}</span>
                {msg.is_privileged && (
                  <Badge className="bg-amber-500/20 text-amber-300 text-xs">
                    <Shield className="w-3 h-3 mr-1" />
                    Privileged
                  </Badge>
                )}
                <span className="text-xs text-slate-400">
                  {formatRelativeTime(msg.created_date)}
                </span>
              </div>
              <p className="text-slate-300 text-sm whitespace-pre-wrap">{msg.message}</p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox 
              checked={isPrivileged} 
              onCheckedChange={setIsPrivileged}
              id="privileged"
            />
            <label htmlFor="privileged" className="text-sm text-slate-300 cursor-pointer">
              Mark as privileged communication
            </label>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              className="bg-slate-800 border-slate-700 text-white"
            />
            <Button onClick={handleSend} disabled={!newMessage.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}