import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Monitor, Activity, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export default function DeviceFingerprintDetailDrawer({ fingerprint, caseId, onClose }) {
  const { data: events = [] } = useQuery({
    queryKey: ['fingerprint-events', fingerprint.id],
    queryFn: async () => {
      const eventIds = fingerprint.traceability.source_event_ids || [];
      const allEvents = await base44.entities.NormalizedEvent.filter({ case_id: caseId });
      return allEvents.filter(e => eventIds.includes(e.id));
    },
    enabled: !!fingerprint
  });

  const getRiskColor = (score) => {
    if (score >= 70) return 'text-red-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-green-400';
  };

  return (
    <Dialog open={!!fingerprint} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-[#EF4444]" />
            Device Fingerprint Detail
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Fingerprint ID */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2">Fingerprint ID</h3>
            <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
              <p className="text-white font-mono text-xs break-all">{fingerprint.fingerprint_id}</p>
            </div>
          </div>

          {/* Risk Assessment */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2">Risk Assessment</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-400">Risk Score</p>
                <p className={`text-4xl font-bold mt-1 ${getRiskColor(fingerprint.risk_score)}`}>
                  {fingerprint.risk_score}/100
                </p>
              </div>
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-400">Confidence</p>
                <p className="text-4xl font-bold text-white mt-1">
                  {Math.round(fingerprint.confidence * 100)}%
                </p>
              </div>
            </div>
          </div>

          {/* Detection Signals */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Detection Signals
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <Badge className={fingerprint.derived_signals.spoofing_likely ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'}>
                Spoofing: {fingerprint.derived_signals.spoofing_likely ? 'Yes' : 'No'}
              </Badge>
              <Badge className={fingerprint.derived_signals.headless_likely ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-500/20 text-slate-400'}>
                Headless: {fingerprint.derived_signals.headless_likely ? 'Yes' : 'No'}
              </Badge>
              <Badge className={fingerprint.derived_signals.vm_likely ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-500/20 text-slate-400'}>
                VM: {fingerprint.derived_signals.vm_likely ? 'Yes' : 'No'}
              </Badge>
            </div>
          </div>

          {/* Tags */}
          {fingerprint.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {fingerprint.tags.map((tag, idx) => (
                  <Badge key={idx} className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* User Agent */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2">User Agent</h3>
            <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
              <p className="text-white text-sm break-all">{fingerprint.user_agent || 'Not available'}</p>
            </div>
          </div>

          {/* Client Hints */}
          {fingerprint.client_hints_json && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Client Hints</h3>
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 space-y-2 text-sm">
                {Object.entries(fingerprint.client_hints_json).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-slate-400">{key}</span>
                    <span className="text-white">{value || 'N/A'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related Events */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Related Events ({events.length})
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {events.slice(0, 10).map((event) => (
                <div key={event.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                      {event.event_type}
                    </Badge>
                    <span className="text-slate-500">
                      {format(new Date(event.event_time), 'MMM d, HH:mm:ss')}
                    </span>
                  </div>
                  {event.src_ip && <p className="text-slate-400">IP: {event.src_ip}</p>}
                  {event.actor_user && <p className="text-slate-400">User: {event.actor_user}</p>}
                </div>
              ))}
              {events.length > 10 && (
                <p className="text-xs text-slate-500 text-center py-2">
                  +{events.length - 10} more events
                </p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}