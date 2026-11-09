import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles,
  Send,
  Loader2,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';

export default function CaseAIAssistant({ caseId, onClose }) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const scrollRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: conversation } = useQuery({
    queryKey: ['ai-conversation', caseId],
    queryFn: async () => {
      const user = await base44.auth.me();
      const convos = await base44.entities.CaseAIConversation.filter(
        { case_id: caseId, user_email: user.email, is_active: true },
        '-created_date',
        1
      );
      return convos[0];
    }
  });

  useEffect(() => {
    if (conversation?.messages) {
      setMessages(conversation.messages);
    }
  }, [conversation]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: (userQuery) => base44.functions.invoke('aiCaseAssistant', {
      case_id: caseId,
      query: userQuery,
      mode: 'chat'
    }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversation', caseId] });
    },
    onError: () => {
      toast.error('AI assistant unavailable');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userMsg = {
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
      evidence_citations: []
    };

    setMessages(prev => [...prev, userMsg]);
    chatMutation.mutate(query);
    setQuery('');
  };

  const suggestedQuestions = [
    "Show me all access logs around the breach time",
    "What evidence suggests lateral movement?",
    "Summarize findings for executive report",
    "Identify gaps in chain of custody",
    "What are the most critical evidence items?"
  ];

  return (
    <Card className="bg-slate-900/50 border-slate-800 flex flex-col h-[600px]">
      <CardHeader className="border-b border-slate-800">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            AI Investigative Assistant
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages Area */}
        <ScrollArea ref={scrollRef} className="flex-1 p-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-purple-400" />
              <p className="text-slate-300 mb-4">Ask me anything about this case</p>
              <div className="space-y-2">
                <p className="text-xs text-slate-500 mb-2">Suggested questions:</p>
                {suggestedQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => setQuery(q)}
                    className="block w-full text-left text-sm text-blue-400 hover:text-blue-300 bg-slate-800/30 hover:bg-slate-800/50 rounded px-3 py-2 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                    </div>
                  )}
                  
                  <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-1' : ''}`}>
                    <div
                      className={`rounded-lg p-3 ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800/50 border border-slate-700 text-slate-200'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    
                    {msg.evidence_citations?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {msg.evidence_citations.map((evidenceId, i) => {
                          const ev = evidence.find(e => e.id === evidenceId);
                          return ev ? (
                            <button
                              key={i}
                              onClick={() => window.location.href = createPageUrl(`EvidenceDetail/${evidenceId}`)}
                              className="text-xs bg-blue-900/30 text-blue-300 px-2 py-1 rounded hover:bg-blue-900/50 transition-colors flex items-center gap-1"
                            >
                              <FileText className="w-3 h-3" />
                              {ev.title}
                            </button>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0 order-2">
                      <span className="text-blue-400 text-xs font-semibold">YOU</span>
                    </div>
                  )}
                </div>
              ))}

              {chatMutation.isPending && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                  </div>
                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                    <p className="text-sm text-slate-400">Analyzing...</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-slate-800 p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about evidence, timelines, patterns..."
              className="bg-slate-800 border-slate-700 text-white"
              disabled={chatMutation.isPending}
            />
            <Button
              type="submit"
              disabled={!query.trim() || chatMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {chatMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}