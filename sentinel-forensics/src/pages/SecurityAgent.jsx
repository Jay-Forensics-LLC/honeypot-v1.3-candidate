import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Bot,
  MessageSquare,
  Plus,
  Trash2,
  Send,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import MessageBubble from '../components/agents/MessageBubble';

export default function SecurityAgent() {
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
    retry: false
  });

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery({
    queryKey: ['security-agent-conversations'],
    queryFn: async () => {
      try {
        const convos = await base44.agents.listConversations({
          agent_name: 'security_monitor'
        });
        return convos || [];
      } catch (error) {
        console.warn('Failed to load conversations:', error.message);
        return [];
      }
    },
    refetchInterval: 60000,
    retry: 1,
    staleTime: 30000,
    initialData: []
  });

  const safeFormatWithCount = (dateString, messageCount) => {
    if (!dateString) return `${messageCount} messages`;
    try {
      const formattedDate = format(new Date(dateString), 'MMM d, yyyy');
      return `${formattedDate} (${messageCount} messages)`;
    } catch (e) {
      return `${messageCount} messages`;
    }
  };

  useEffect(() => {
    if (!selectedConversation) return;

    const unsubscribe = base44.agents.subscribeToConversation(
      selectedConversation.id,
      (data) => {
        setMessages(data.messages || []);
      }
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedConversation?.id]);

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const conversation = await base44.agents.createConversation({
        agent_name: 'security_monitor',
        metadata: {
          name: `Security Analysis ${format(new Date(), 'MMM d, yyyy')}`,
          description: 'AI-powered security monitoring conversation'
        }
      });
      return conversation;
    },
    onSuccess: (newConvo) => {
      queryClient.invalidateQueries({ queryKey: ['security-agent-conversations'] });
      setSelectedConversation(newConvo);
      setMessages(newConvo.messages || []);
      toast.success('New conversation started');
    },
    onError: (error) => {
      console.error('Create conversation error:', error);
      toast.error('Failed to create conversation');
    }
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async (conversationId) => {
      try {
        await base44.agents.updateConversation(conversationId, {
          metadata: {
            archived: true,
            archived_at: new Date().toISOString()
          }
        });
        return conversationId;
      } catch (error) {
        console.warn('Failed to archive conversation:', error.message);
        return conversationId;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-agent-conversations'] });
      setSelectedConversation(null);
      setMessages([]);
      setDeleteConfirm(null);
      toast.success('Conversation deleted');
    },
    onError: (error) => {
      console.error('Delete conversation error:', error);
      setDeleteConfirm(null);
      toast.error('Failed to delete conversation');
    }
  });

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !selectedConversation || isSending) return;

    setIsSending(true);
    const messageText = inputMessage;
    setInputMessage('');

    try {
      await base44.agents.addMessage(selectedConversation, {
        role: 'user',
        content: messageText
      });
    } catch (error) {
      console.error('Send message error:', error);
      setInputMessage(messageText);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Security Agent</h1>
          <p className="text-slate-400">AI-powered security analysis and threat monitoring</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Conversations List */}
          <Card className="bg-slate-900/50 border-slate-800 lg:col-span-1">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Bot className="w-5 h-5 text-blue-400" />
                  Conversations
                </CardTitle>
                <Button
                  onClick={() => createConversationMutation.mutate()}
                  disabled={createConversationMutation.isPending}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {conversationsLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-400" />
                    <p className="text-sm text-slate-400">Loading...</p>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-12 h-12 mx-auto mb-2 text-slate-600" />
                    <p className="text-sm text-slate-400 mb-4">No conversations</p>
                    <Button
                      onClick={() => createConversationMutation.mutate()}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Start Chat
                    </Button>
                  </div>
                ) : (
                  conversations
                    .filter(c => !c.metadata?.archived)
                    .map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          setSelectedConversation(conv);
                          setMessages(conv.messages || []);
                        }}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          selectedConversation?.id === conv.id
                            ? 'bg-blue-600/30 border border-blue-500/50'
                            : 'bg-slate-800/50 hover:bg-slate-800 border border-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white text-sm truncate">
                              {conv.metadata?.name || 'Conversation'}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {safeFormatWithCount(
                                conv.updated_date || conv.created_date,
                                conv.messages?.length || 0
                              )}
                            </p>
                          </div>
                          {selectedConversation?.id === conv.id && (
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(conv);
                              }}
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 flex-shrink-0"
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </Button>
                          )}
                        </div>
                      </button>
                    ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Chat Area */}
          <Card className="bg-slate-900/50 border-slate-800 lg:col-span-2">
            <CardContent className="p-0">
              {!selectedConversation ? (
                <div className="flex items-center justify-center p-12">
                  <div className="text-center">
                    <Bot className="w-20 h-20 mx-auto mb-4 text-slate-600" />
                    <h3 className="text-xl font-bold text-white mb-2">Security Monitor Agent</h3>
                    <p className="text-slate-400 mb-6">
                      AI-powered security analysis and threat monitoring
                    </p>
                    <Button
                      onClick={() => createConversationMutation.mutate()}
                      disabled={createConversationMutation.isPending}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    >
                      {createConversationMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Start Conversation
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Messages */}
                  <div className="h-[500px] overflow-y-auto p-6 space-y-4">
                    {messages.length === 0 ? (
                      <div className="text-center py-12">
                        <MessageSquare className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                        <p className="text-slate-400">Start your security analysis conversation</p>
                      </div>
                    ) : (
                      messages.map((msg, idx) => (
                        <MessageBubble key={idx} message={msg} />
                      ))
                    )}
                  </div>

                  {/* Input Area */}
                  <div className="border-t border-slate-800 p-4 bg-slate-800/50">
                    <form onSubmit={handleSendMessage} className="flex gap-2">
                      <Input
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        placeholder="Ask about threats, evidence, or security..."
                        disabled={isSending}
                        className="flex-1 bg-slate-700 border-slate-600 text-white"
                      />
                      <Button
                        type="submit"
                        disabled={isSending || !inputMessage.trim()}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {isSending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </Button>
                    </form>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete this conversation and all messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteConversationMutation.mutate(deleteConfirm.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}