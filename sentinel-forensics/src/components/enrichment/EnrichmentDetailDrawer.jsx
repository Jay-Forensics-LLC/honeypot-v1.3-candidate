import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Shield, CheckCircle2, AlertTriangle, Database } from 'lucide-react';
import { format } from 'date-fns';

export default function EnrichmentDetailDrawer({ result, indicator, onClose }) {
  const getRiskColor = (score) => {
    if (!score) return 'text-slate-400';
    if (score >= 70) return 'text-red-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-green-400';
  };

  return (
    <Dialog open={!!result} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#EF4444]" />
            Enrichment Result Detail
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Indicator */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2">Indicator</h3>
            <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
              <p className="text-white font-mono">{indicator?.value}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                  {indicator?.indicator_type}
                </Badge>
              </div>
            </div>
          </div>

          {/* Risk Assessment */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2">Risk Assessment</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-400">Risk Score</p>
                <p className={`text-3xl font-bold mt-1 ${getRiskColor(result.risk_score)}`}>
                  {result.risk_score !== null ? result.risk_score : 'N/A'}
                </p>
              </div>
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-400">Confidence</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {Math.round(result.confidence * 100)}%
                </p>
              </div>
            </div>
          </div>

          {/* Summary */}
          {result.summary && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Summary</h3>
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-300">{result.summary}</p>
              </div>
            </div>
          )}

          {/* Tags */}
          {result.tags && result.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {result.tags.map((tag, idx) => (
                  <Badge key={idx} className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Traceability */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2 flex items-center gap-2">
              <Database className="w-4 h-4" />
              Traceability
            </h3>
            <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 space-y-3">
              {result.traceability?.source_event_ids?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Source Events</p>
                  <p className="text-sm text-slate-300">
                    {result.traceability.source_event_ids.length} events referenced
                  </p>
                </div>
              )}
              {result.traceability?.source_artifact_ids?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Source Artifacts</p>
                  <p className="text-sm text-slate-300">
                    {result.traceability.source_artifact_ids.length} artifacts referenced
                  </p>
                </div>
              )}
              {result.traceability?.time_range && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Time Range</p>
                  <p className="text-sm text-slate-300">
                    {format(new Date(result.traceability.time_range.start), 'MMM d, HH:mm')} - 
                    {format(new Date(result.traceability.time_range.end), 'MMM d, HH:mm')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Integrity */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Integrity Verification
            </h3>
            <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
              {result.raw_json_sha256 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-green-400">Raw data hash verified</span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono">
                    SHA-256: {result.raw_json_sha256}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                  <span className="text-sm text-orange-400">No integrity hash available</span>
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2">Metadata</h3>
            <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Provider</span>
                <span className="text-slate-300">{result.provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Schema Version</span>
                <span className="text-slate-300">{result.schema_version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Created</span>
                <span className="text-slate-300">
                  {format(new Date(result.created_date), 'MMM d, yyyy HH:mm:ss')}
                </span>
              </div>
              {result.expires_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Expires</span>
                  <span className="text-slate-300">
                    {format(new Date(result.expires_at), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Normalized JSON */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2">Normalized Data</h3>
            <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 max-h-64 overflow-auto">
              <pre className="text-xs text-slate-300 font-mono">
                {JSON.stringify(result.normalized_json, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}