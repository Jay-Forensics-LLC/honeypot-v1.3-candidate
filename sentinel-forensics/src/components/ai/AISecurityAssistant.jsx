import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Shield, Sparkles, AlertTriangle, CheckCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

export default function AISecurityAssistant() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    const userMessage = { role: 'user', content: query, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsLoading(true);

    try {
      const response = await base44.functions.invoke('aiSecurityAssistant', { 
        query,
        context: {}
      });

      // Check for error response
      if (response.error) {
        throw new Error(response.error);
      }

      const assistantMessage = {
        role: 'assistant',
        content: response.response || response.data?.response || 'No response received',
        context_used: response.context_used || response.data?.context_used,
        timestamp: response.timestamp || new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI Assistant error:', error);
      
      // More detailed error message
      let errorMsg = 'Failed to process your request. Please try again.';
      if (error.message.includes('not configured')) {
        errorMsg = 'AI service not configured. Please contact your administrator.';
      } else if (error.message.includes('temporarily unavailable')) {
        errorMsg = 'AI service temporarily unavailable. Please try again in a moment.';
      } else if (error.message.includes('Unauthorized')) {
        errorMsg = 'Authentication error. Please refresh the page and try again.';
      }
      
      toast.error(errorMsg);
      
      setMessages(prev => [...prev, {
        role: 'error',
        content: errorMsg,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions = [
    { label: 'Analyze recent alerts', query: 'Analyze my recent security alerts and identify any patterns or threats that need immediate attention.' },
    { label: 'Incident response plan', query: 'What are the recommended steps for responding to a potential data breach based on current best practices?' },
    { label: 'Compliance status', query: 'Review my current security posture and identify any compliance gaps for GDPR, HIPAA, and SOC 2.' },
    { label: 'Security recommendations', query: 'Provide actionable security recommendations based on my current device and threat landscape.' }
  ];

  return (
    <Card className="bg-slate-900/50 border-slate-800 flex flex-col h-[calc(100vh-12rem)]">
      <CardHeader className="border-b border-slate-800">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            AI Security Assistant
          </CardTitle>
          <Badge className="bg-purple-500/20 text-purple-300">
            Powered by Claude
          </Badge>
        </div>
        <p className="text-sm text-slate-400 mt-2">
          Get real-time security analysis, incident response guidance, and compliance recommendations
        </p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-4 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Shield className="w-16 h-16 text-slate-600 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Welcome to AI Security Assistant</h3>
              <p className="text-slate-400 mb-6 max-w-md">
                Ask me anything about security analysis, threat detection, incident response, or compliance.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-2xl">
                {quickActions.map((action, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    className="bg-slate-800/50 border-slate-700 hover:bg-slate-800 text-left h-auto py-3"
                    onClick={() => setQuery(action.query)}
                  >
                    <span className="text-sm text-slate-300">{action.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg p-4 ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white' 
                      : msg.role === 'error'
                      ? 'bg-red-900/20 border border-red-500/30 text-red-200'
                      : 'bg-slate-800/50 border border-slate-700'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <>
                        <ReactMarkdown 
                          className="prose prose-sm prose-invert max-w-none"
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0 text-slate-200">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc ml-4 mb-2 text-slate-200">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 text-slate-200">{children}</ol>,
                            li: ({ children }) => <li className="mb-1 text-slate-200">{children}</li>,
                            strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                            code: ({ inline, children }) => 
                              inline ? (
                                <code className="bg-slate-900 px-1 py-0.5 rounded text-blue-300">{children}</code>
                              ) : (
                                <code className="block bg-slate-900 p-2 rounded my-2 text-blue-300">{children}</code>
                              )
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                        {msg.context_used && (
                          <div className="mt-3 pt-3 border-t border-slate-700 flex gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {msg.context_used.alerts_count} alerts analyzed
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {msg.context_used.devices_count} devices reviewed
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {msg.context_used.threats_count} threats assessed
                            </Badge>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm">{msg.content}</p>
                    )}
                    <p className="text-xs opacity-60 mt-2">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about security alerts, threats, compliance, or incident response..."
            className="flex-1 bg-slate-800/50 border-slate-700 text-white resize-none"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button 
            type="submit" 
            disabled={!query.trim() || isLoading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}