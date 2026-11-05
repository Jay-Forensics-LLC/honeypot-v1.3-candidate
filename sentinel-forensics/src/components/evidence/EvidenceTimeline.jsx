import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, FileText, AlertTriangle } from 'lucide-react';

export default function EvidenceTimeline({ caseId }) {
  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence-timeline', caseId],
    queryFn: () => base44.entities.EvidenceV2.filter({ case_id: caseId }),
    enabled: !!caseId
  });

  const { data: chainLogs = [] } = useQuery({
    queryKey: ['chain-logs', caseId],
    queryFn: async () => {
      const logs = [];
      for (const e of evidence) {
        const eLogs = await base44.entities.ChainOfCustodyLog.filter({ evidence_id: e.id });
        logs.push(...eLogs.map(log => ({ ...log, evidence_name: e.evidence_name })));
      }
      return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    },
    enabled: evidence.length > 0
  });

  const allEvents = [
    ...evidence.map(e => ({
      date: e.created_date,
      type: 'evidence_collected',
      description: `Evidence collected: ${e.evidence_name}`,
      evidence_id: e.id,
      risk_score: e.spoliation_risk_score
    })),
    ...chainLogs.map(log => ({
      date: log.timestamp,
      type: 'custody_transfer',
      description: `${log.action}: ${log.evidence_name} (${log.custodian})`,
      evidence_id: log.evidence_id
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Evidence Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {allEvents.map((event, idx) => (
            <div key={idx} className="flex gap-3 relative">
              {idx < allEvents.length - 1 && (
                <div className="absolute left-3 top-8 bottom-0 w-0.5 bg-slate-700" />
              )}
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                event.type === 'evidence_collected' ? 'bg-blue-500' : 'bg-slate-600'
              }`}>
                {event.type === 'evidence_collected' ? <FileText className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              </div>
              <div className="flex-1 pb-4">
                <div className="flex items-start justify-between">
                  <p className="text-white text-sm">{event.description}</p>
                  {event.risk_score > 50 && (
                    <Badge variant="destructive" className="ml-2">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      High Risk
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(event.date).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}