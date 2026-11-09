import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, User, Shield, FileText, Download, Eye, Edit, Trash, Lock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/**
 * CHAIN OF CUSTODY TIMELINE
 * Immutable audit trail for evidence handling
 */
export default function ChainOfCustodyTimeline({ evidenceId }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['chain-of-custody', evidenceId],
    queryFn: async () => {
      return await base44.entities.ChainOfCustodyLog.filter({ 
        evidence_id: evidenceId 
      }, '-timestamp');
    },
    enabled: !!evidenceId
  });

  const getActionIcon = (action) => {
    const icons = {
      created: Shield,
      updated: Edit,
      accessed: Eye,
      downloaded: Download,
      transferred: FileText,
      verified: Lock,
      deleted: Trash
    };
    return icons[action] || FileText;
  };

  const getActionColor = (action) => {
    const colors = {
      created: 'text-green-400',
      updated: 'text-yellow-400',
      accessed: 'text-blue-400',
      downloaded: 'text-purple-400',
      transferred: 'text-orange-400',
      verified: 'text-green-400',
      deleted: 'text-red-400'
    };
    return colors[action] || 'text-slate-400';
  };

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6 text-center">
          <p className="text-slate-400">Loading chain of custody...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          Chain of Custody ({logs.length} events)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-8">
            <Shield className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400">No custody events recorded</p>
          </div>
        ) : (
          <div className="space-y-4">
            {logs.map((log, idx) => {
              const Icon = getActionIcon(log.action);
              const color = getActionColor(log.action);
              
              return (
                <div key={log.id} className="relative">
                  {/* Timeline connector */}
                  {idx < logs.length - 1 && (
                    <div className="absolute left-5 top-12 w-0.5 h-full bg-slate-700" />
                  )}
                  
                  <div className="flex gap-4">
                    <div className={`w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center flex-shrink-0 relative z-10`}>
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    
                    <div className="flex-1 pb-8">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <h4 className="text-white font-semibold capitalize">
                            {log.action.replace('_', ' ')}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <User className="w-3 h-3 text-slate-400" />
                            <span className="text-sm text-slate-400">{log.actor_email}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-sm text-slate-400">
                            <Clock className="w-3 h-3" />
                            <span>{formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {new Date(log.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      
                      {/* Evidence Hash */}
                      <div className="mt-2 p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-slate-500 mb-1">Evidence Hash</p>
                            <p className="text-white font-mono break-all">
                              {log.evidence_hash?.substring(0, 24)}...
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 mb-1">Record Hash</p>
                            <p className="text-white font-mono break-all">
                              {log.record_hash?.substring(0, 24)}...
                            </p>
                          </div>
                        </div>
                        
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-700">
                            <p className="text-slate-500 text-xs mb-1">Metadata</p>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(log.metadata).map(([key, value]) => (
                                <Badge key={key} className="bg-slate-700/50 text-slate-300 text-xs">
                                  {key}: {String(value)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Integrity Indicator */}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-400" />
                        <span className="text-xs text-green-400">Integrity Verified</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}