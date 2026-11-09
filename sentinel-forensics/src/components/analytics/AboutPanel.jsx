import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { format } from 'date-fns';

export default function AboutPanel({ meta, provenance, className = '' }) {
  return (
    <Alert className={`bg-blue-500/10 border-blue-500/30 ${className}`}>
      <Info className="w-4 h-4 text-blue-400" />
      <AlertDescription className="text-xs text-blue-300">
        <strong className="block mb-2">Data Provenance:</strong>
        {meta && (
          <div className="space-y-1 mb-2">
            <div>Generated: {format(new Date(meta.generatedAt), 'PPpp')}</div>
            <div>Query time: {meta.queryTimeMs}ms</div>
            {meta.rowCount !== undefined && <div>Rows: {meta.rowCount}</div>}
            {meta.totalFindings !== undefined && <div>Total findings: {meta.totalFindings}</div>}
            {meta.bucketSize && <div>Bucket: {formatBucketSize(meta.bucketSize)}</div>}
          </div>
        )}
        {provenance && (
          <div className="space-y-1">
            <div>Source: {provenance.sourceEntities?.join(', ')}</div>
            <div className="break-all">
              Query signature: <code className="text-xs">{provenance.querySignature?.substring(0, 16)}...</code>
            </div>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

function formatBucketSize(ms) {
  if (ms >= 24 * 60 * 60 * 1000) return `${ms / (24 * 60 * 60 * 1000)}d`;
  if (ms >= 60 * 60 * 1000) return `${ms / (60 * 60 * 1000)}h`;
  return `${ms / (60 * 1000)}min`;
}