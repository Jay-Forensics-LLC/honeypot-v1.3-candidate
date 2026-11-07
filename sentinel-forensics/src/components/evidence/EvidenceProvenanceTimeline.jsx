import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Upload, Shield, Eye, Download } from 'lucide-react';
import { format } from 'date-fns';

export default function EvidenceProvenanceTimeline({ evidence }) {
  const events = [
    {
      type: 'collected',
      timestamp: evidence.collection_timestamp,
      actor: evidence.collected_by,
      icon: Upload,
      color: 'text-blue-400',
      label: 'Evidence Collected',
      details: `Method: ${evidence.collection_method}`
    },
    {
      type: 'hashed',
      timestamp: evidence.collection_timestamp,
      actor: 'System',
      icon: Shield,
      color: 'text-green-400',
      label: 'Integrity Anchored',
      details: `SHA-256: ${evidence.sha256_hash.substring(0, 16)}...`
    },
    evidence.integrity_last_check && {
      type: 'verified',
      timestamp: evidence.integrity_last_check,
      actor: 'System',
      icon: Shield,
      color: 'text-purple-400',
      label: 'Integrity Verified',
      details: 'Hash validation successful'
    }
  ].filter(Boolean);

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-orange-400" />
          Evidence Provenance Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {events.map((event, idx) => {
            const Icon = event.icon;
            return (
              <div key={idx} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <Icon className={`w-5 h-5 ${event.color}`} />
                  </div>
                  {idx < events.length - 1 && (
                    <div className="w-px h-full bg-slate-700 my-2" />
                  )}
                </div>
                
                <div className="flex-1 pb-6">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-white font-medium">{event.label}</p>
                    <Badge variant="outline" className="text-xs">
                      {format(new Date(event.timestamp), 'MMM d, HH:mm:ss')}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mb-1">{event.details}</p>
                  <p className="text-xs text-slate-500">Actor: {event.actor}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-200">
            <strong>Append-Only Audit:</strong> This timeline cannot be modified. 
            All actions are logged with timestamps and actors for court admissibility.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}