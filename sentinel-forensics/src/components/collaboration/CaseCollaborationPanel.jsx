import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MessageSquare, FileText, Send, Pin, Edit2, Trash2, 
  Paperclip, AtSign, Clock, User
} from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '../hooks/useUser';
import { formatDistanceToNow } from 'date-fns';

export default function CaseCollaborationPanel({ caseId }) {
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('chat');
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();
  const { data: user } = useUser();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['collaboration', caseId],
    queryFn: () => base44.entities.CaseCollaboration.filter({
      case_id: caseId,
      organization_id: user.organization_id
    }, '-created_date'),
    enabled: !!caseId && !!user?.organization_id,
    refetchInterval: 5000 // Poll every 5 seconds for real-time updates
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.CaseCollaboration.create({
        organization_id: user.organization_id,
        case_id: caseId,
        author_id: user.email,
        author_name: user.full_name || user.email,
        ...data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaboration', caseId] });
      setMessage('');
      scrollToBottom();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CaseCollaboration.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaboration', caseId] });
      toast.success('Message deleted');
    }
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, isPinned }) => 
      base44.entities.CaseCollaboration.update(id, { is_pinned: !isPinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaboration', caseId] });
    }
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  function handleSend(type = 'chat') {
    if (!message.trim()) return;

    sendMessageMutation.mutate({
      message_type: type,
      message: message.trim()
    });
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(activeTab);
    }
  }

  const chatMessages = messages.filter(m => m.message_type === 'chat');
  const notes = messages.filter(m => m.message_type === 'note');
  const pinnedMessages = messages.filter(m => m.is_pinned);

  const MessageItem = ({ msg }) => (
    <div className="flex gap-3 p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-colors group">
      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
        <User className="w-4 h-4 text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-white">{msg.author_name}</span>
          <span className="text-xs text-slate-500">
            {formatDistanceToNow(new Date(msg.created_date), { addSuffix: true })}
          </span>
          {msg.is_pinned && <Pin className="w-3 h-3 text-yellow-400" />}
          {msg.message_type === 'note' && (
            <Badge variant="outline" className="text-xs text-purple-400 border-purple-500/30">
              Note
            </Badge>
          )}
        </div>
        <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">
          {msg.message}
        </p>
      </div>
      {msg.author_id === user?.email && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => pinMutation.mutate({ id: msg.id, isPinned: msg.is_pinned })}
            className="h-8 w-8 text-slate-400 hover:text-yellow-400"
          >
            <Pin className="w-3 h-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => deleteMutation.mutate(msg.id)}
            className="h-8 w-8 text-slate-400 hover:text-red-400"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Team Collaboration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pinned Messages */}
        {pinnedMessages.length > 0 && (
          <div className="space-y-2 pb-4 border-b border-slate-800">
            <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1">
              <Pin className="w-3 h-3" />
              Pinned
            </p>
            {pinnedMessages.map(msg => (
              <MessageItem key={msg.id} msg={msg} />
            ))}
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 bg-slate-800">
            <TabsTrigger value="chat" className="text-xs">
              Chat ({chatMessages.length})
            </TabsTrigger>
            <TabsTrigger value="note" className="text-xs">
              Notes ({notes.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="space-y-2 max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
            ) : chatMessages.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No messages yet</p>
            ) : (
              <>
                {chatMessages.map(msg => (
                  <MessageItem key={msg.id} msg={msg} />
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </TabsContent>

          <TabsContent value="note" className="space-y-2 max-h-96 overflow-y-auto">
            {notes.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No notes yet</p>
            ) : (
              <>
                {notes.map(msg => (
                  <MessageItem key={msg.id} msg={msg} />
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Input */}
        <div className="flex gap-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={activeTab === 'chat' ? 'Type a message...' : 'Add a note...'}
            className="bg-slate-800 border-slate-700 text-white text-sm"
            rows={2}
          />
          <Button
            onClick={() => handleSend(activeTab)}
            disabled={!message.trim() || sendMessageMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}