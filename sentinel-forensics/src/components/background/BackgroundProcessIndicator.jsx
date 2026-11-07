import React, { useState } from 'react';
import { useBackgroundProcess } from './BackgroundProcessProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, X, CheckCircle, AlertTriangle, Minimize2, Maximize2 } from 'lucide-react';

export default function BackgroundProcessIndicator() {
  const { activeProcesses, processes, stopProcess, clearCompleted } = useBackgroundProcess();
  const [minimized, setMinimized] = useState(false);

  if (processes.length === 0) return null;

  const completedCount = processes.filter(p => p.status === 'completed').length;
  const failedCount = processes.filter(p => p.status === 'failed').length;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
      <Card className="bg-slate-900/95 border-slate-800 backdrop-blur-sm shadow-2xl">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-sm font-semibold text-white">
                Background Processes ({activeProcesses.length})
              </span>
            </div>
            <div className="flex items-center gap-2">
              {completedCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearCompleted}
                  className="h-6 px-2 text-xs"
                >
                  Clear Completed
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMinimized(!minimized)}
                className="h-6 w-6 p-0"
              >
                {minimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {!minimized && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {processes.map(process => (
                <div
                  key={process.id}
                  className="p-3 bg-slate-800/50 rounded-lg border border-slate-700"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white truncate">
                          {process.name}
                        </span>
                        {process.status === 'running' && (
                          <Badge className="bg-blue-500/20 text-blue-300 text-xs">
                            Running
                          </Badge>
                        )}
                        {process.status === 'completed' && (
                          <Badge className="bg-green-500/20 text-green-300 text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Done
                          </Badge>
                        )}
                        {process.status === 'failed' && (
                          <Badge className="bg-red-500/20 text-red-300 text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{process.type}</span>
                    </div>
                    {process.status === 'running' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => stopProcess(process.id)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {process.status === 'running' && (
                    <div className="space-y-1">
                      <Progress value={process.progress} className="h-1" />
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>{Math.round(process.progress)}%</span>
                        <span>
                          {Math.round((Date.now() - process.startTime) / 1000)}s elapsed
                        </span>
                      </div>
                    </div>
                  )}

                  {process.error && (
                    <p className="text-xs text-red-400 mt-2">{process.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {minimized && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {activeProcesses.length > 0 && (
                <span>{activeProcesses.length} running</span>
              )}
              {completedCount > 0 && (
                <span>{completedCount} completed</span>
              )}
              {failedCount > 0 && (
                <span className="text-red-400">{failedCount} failed</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}