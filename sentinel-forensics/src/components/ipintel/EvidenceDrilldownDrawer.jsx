import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, Activity, Download } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

/**
 * EVIDENCE DRILLDOWN DRAWER
 * Shows events where IP appeared (src or dst)
 */

export default function EvidenceDrilldownDrawer({ ip, caseId, timeRange, onClose }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['ip-events', caseId, ip],
    queryFn: async () => {
      // Fetch events where IP appears
      const allEvents = await base44.entities.NormalizedEvent.filter({ case_id: caseId });
      return allEvents.filter(e => e.src_ip === ip || e.dst_ip === ip);
    },
    enabled: !!ip
  });

  const eventTypeColors = {
    net_flow: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    dns_query: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    tls_handshake: 'bg-green-500/20 text-green-400 border-green-500/30',
    http_meta: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    process_start: 'bg-red-500/20 text-red-400 border-red-500/30'
  };

  const exportCSV = async () => {
    if (events.length === 0) {
      toast.error('No events to export');
      return;
    }

    try {
      // Build CSV
      const headers = ['event_time', 'event_type', 'src_ip', 'src_port', 'dst_ip', 'dst_port', 'domain', 'process_name'];
      const rows = events.map(e => [
        e.event_time,
        e.event_type,
        e.src_ip || '',
        e.src_port || '',
        e.dst_ip || '',
        e.dst_port || '',
        e.domain || '',
        e.process_name || ''
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      
      // Calculate hash
      const encoder = new TextEncoder();
      const data = encoder.encode(csv);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evidence_${ip}_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('CSV exported', {
        description: `${events.length} rows | SHA-256: ${hash.substring(0, 16)}...`
      });
    } catch (error) {
      toast.error('Export failed', { description: error.message });
    }
  };

  return (
    <Dialog open={!!ip} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[#EF4444]" />
            Evidence for IP: {ip}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-400">{events.length} events found</span>
            </div>
            <Button
              size="sm"
              onClick={exportCSV}
              variant="outline"
              className="border-slate-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {isLoading ? (
              <p className="text-slate-400 text-center py-8">Loading events...</p>
            ) : events.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No events found</p>
            ) : (
              events.map((event) => (
                <div key={event.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={eventTypeColors[event.event_type] || 'bg-slate-500/20 text-slate-400'}>
                      {event.event_type}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {format(new Date(event.event_time), 'MMM d, yyyy HH:mm:ss')}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm">
                    {event.src_ip && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Source IP:</span>
                        <span className={`font-mono ${event.src_ip === ip ? 'text-[#EF4444]' : 'text-white'}`}>
                          {event.src_ip}
                          {event.src_port && `:${event.src_port}`}
                        </span>
                      </div>
                    )}
                    {event.dst_ip && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Dest IP:</span>
                        <span className={`font-mono ${event.dst_ip === ip ? 'text-[#EF4444]' : 'text-white'}`}>
                          {event.dst_ip}
                          {event.dst_port && `:${event.dst_port}`}
                        </span>
                      </div>
                    )}
                    {event.domain && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Domain:</span>
                        <span className="text-white font-mono">{event.domain}</span>
                      </div>
                    )}
                    {event.process_name && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Process:</span>
                        <span className="text-white">{event.process_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}