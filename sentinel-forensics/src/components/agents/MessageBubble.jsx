import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Copy, CheckCircle2, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const FunctionDisplay = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);
  const name = toolCall?.name || 'Function';
  const status = toolCall?.status || 'pending';
  const results = toolCall?.results;
  
  const parsedResults = (() => {
    if (!results) return null;
    try {
      return typeof results === 'string' ? JSON.parse(results) : results;
    } catch {
      return results;
    }
  })();
  
  const isError = results && (
    (typeof results === 'string' && /error|failed/i.test(results)) ||
    (parsedResults?.success === false)
  );
  
  const statusConfig = {
    pending: { icon: Loader2, color: 'text-slate-400', text: 'Pending', spin: false },
    running: { icon: Loader2, color: 'text-blue-500', text: 'Running...', spin: true },
    in_progress: { icon: Loader2, color: 'text-blue-500', text: 'Running...', spin: true },
    completed: isError ? 
      { icon: AlertCircle, color: 'text-red-500', text: 'Failed', spin: false } : 
      { icon: CheckCircle2, color: 'text-green-600', text: 'Success', spin: false },
    success: { icon: CheckCircle2, color: 'text-green-600', text: 'Success', spin: false },
    failed: { icon: AlertCircle, color: 'text-red-500', text: 'Failed', spin: false },
    error: { icon: AlertCircle, color: 'text-red-500', text: 'Failed', spin: false }
  }[status] || { icon: Loader2, color: 'text-slate-500', text: '', spin: false };
  
  const Icon = statusConfig.icon;
  const formattedName = name.split('.').reverse().join(' ').toLowerCase();
  
  return (
    <div className="mt-2 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
          expanded ? 'bg-slate-800 border-slate-600' : 'bg-slate-900/50 border-slate-700'
        } hover:bg-slate-800`}
      >
        <Icon className={`h-3 w-3 ${statusConfig.color} ${statusConfig.spin ? 'animate-spin' : ''}`} />
        <span className="text-slate-200">{formattedName}</span>
        {statusConfig.text && (
          <span className={`text-slate-400 ${isError ? 'text-red-400' : ''}`}>
            • {statusConfig.text}
          </span>
        )}
        {!statusConfig.spin && (toolCall.arguments_string || results) && (
          <ChevronRight className={`h-3 w-3 text-slate-400 transition-transform ml-auto ${
            expanded ? 'rotate-90' : ''
          }`} />
        )}
      </button>
      
      {expanded && !statusConfig.spin && (
        <div className="mt-1.5 ml-3 pl-3 border-l-2 border-slate-700 space-y-2">
          {toolCall.arguments_string && (
            <div>
              <div className="text-xs text-slate-400 mb-1">Parameters:</div>
              <pre className="bg-slate-900 rounded-md p-2 text-xs text-slate-300 whitespace-pre-wrap overflow-x-auto">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(toolCall.arguments_string), null, 2);
                  } catch {
                    return toolCall.arguments_string;
                  }
                })()}
              </pre>
            </div>
          )}
          {parsedResults && (
            <div>
              <div className="text-xs text-slate-400 mb-1">Result:</div>
              <pre className="bg-slate-900 rounded-md p-2 text-xs text-slate-300 whitespace-pre-wrap max-h-48 overflow-auto">
                {typeof parsedResults === 'object' ? 
                  JSON.stringify(parsedResults, null, 2) : parsedResults}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
          <div className="h-2 w-2 rounded-full bg-white" />
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? 'flex flex-col items-end' : ''}`}>
        {message.content && (
          <div className={`rounded-2xl px-4 py-2.5 ${
            isUser ? 'bg-blue-600 text-white' : 'bg-slate-800 border border-slate-700'
          }`}>
            {isUser ? (
              <p className="text-sm leading-relaxed">{message.content}</p>
            ) : (
              <ReactMarkdown 
                className="text-sm prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                components={{
                  code: ({ inline, className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <div className="relative group/code">
                        <pre className="bg-slate-950 text-slate-100 rounded-lg p-3 overflow-x-auto my-2">
                          <code className={className} {...props}>{children}</code>
                        </pre>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover/code:opacity-100 bg-slate-900 hover:bg-slate-800"
                          onClick={() => {
                            navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
                            toast.success('Code copied');
                          }}
                        >
                          <Copy className="h-3 w-3 text-slate-400" />
                        </Button>
                      </div>
                    ) : (
                      <code className="px-1 py-0.5 rounded bg-slate-900 text-blue-300 text-xs">
                        {children}
                      </code>
                    );
                  },
                  a: ({ children, ...props }) => (
                    <a {...props} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                  p: ({ children }) => <p className="my-1 leading-relaxed text-slate-200">{children}</p>,
                  ul: ({ children }) => <ul className="my-1 ml-4 list-disc text-slate-200">{children}</ul>,
                  ol: ({ children }) => <ol className="my-1 ml-4 list-decimal text-slate-200">{children}</ol>,
                  li: ({ children }) => <li className="my-0.5 text-slate-200">{children}</li>,
                  h1: ({ children }) => <h1 className="text-lg font-semibold my-2 text-white">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-semibold my-2 text-white">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold my-2 text-white">{children}</h3>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-blue-500 pl-3 my-2 text-slate-300">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        )}
        
        {message.tool_calls?.length > 0 && (
          <div className="space-y-1 mt-2">
            {message.tool_calls.map((toolCall, idx) => (
              <FunctionDisplay key={idx} toolCall={toolCall} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}