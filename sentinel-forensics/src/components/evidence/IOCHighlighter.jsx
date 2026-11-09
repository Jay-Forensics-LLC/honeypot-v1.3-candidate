import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield } from 'lucide-react';

export default function IOCHighlighter({ text, caseId }) {
  const { data: iocs = [] } = useQuery({
    queryKey: ['iocs', caseId],
    queryFn: () => base44.entities.IOCIndicator.filter({ case_id: caseId })
  });

  if (!text || iocs.length === 0) {
    return <span>{text}</span>;
  }

  // Build regex patterns for each IOC
  const maliciousIOCs = iocs.filter(i => i.threat_classification === 'malicious');
  const suspiciousIOCs = iocs.filter(i => i.threat_classification === 'suspicious');

  let highlightedText = text;
  const highlights = [];

  // Find and mark malicious IOCs
  maliciousIOCs.forEach((ioc) => {
    const escapedValue = ioc.indicator_value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedValue, 'gi');
    
    let match;
    while ((match = regex.exec(text)) !== null) {
      highlights.push({
        start: match.index,
        end: match.index + match[0].length,
        ioc,
        severity: 'malicious'
      });
    }
  });

  // Find and mark suspicious IOCs
  suspiciousIOCs.forEach((ioc) => {
    const escapedValue = ioc.indicator_value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedValue, 'gi');
    
    let match;
    while ((match = regex.exec(text)) !== null) {
      // Only add if not already marked as malicious
      const overlaps = highlights.some(h => 
        (match.index >= h.start && match.index < h.end) ||
        (match.index + match[0].length > h.start && match.index + match[0].length <= h.end)
      );
      
      if (!overlaps) {
        highlights.push({
          start: match.index,
          end: match.index + match[0].length,
          ioc,
          severity: 'suspicious'
        });
      }
    }
  });

  // Sort highlights by position
  highlights.sort((a, b) => a.start - b.start);

  if (highlights.length === 0) {
    return <span>{text}</span>;
  }

  // Build highlighted text
  const parts = [];
  let lastIndex = 0;

  highlights.forEach((highlight, idx) => {
    // Add text before highlight
    if (highlight.start > lastIndex) {
      parts.push(
        <span key={`text-${idx}`}>
          {text.substring(lastIndex, highlight.start)}
        </span>
      );
    }

    // Add highlighted IOC
    const highlightedValue = text.substring(highlight.start, highlight.end);
    const bgColor = highlight.severity === 'malicious' 
      ? 'bg-red-500/30 border-b-2 border-red-500' 
      : 'bg-yellow-500/30 border-b-2 border-yellow-500';

    parts.push(
      <TooltipProvider key={`ioc-${idx}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`${bgColor} cursor-help font-semibold`}>
              {highlightedValue}
            </span>
          </TooltipTrigger>
          <TooltipContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {highlight.severity === 'malicious' ? (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                ) : (
                  <Shield className="w-4 h-4 text-yellow-400" />
                )}
                <Badge className={
                  highlight.severity === 'malicious'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-yellow-500/20 text-yellow-400'
                }>
                  {highlight.severity.toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs font-semibold">{highlight.ioc.indicator_type.replace('_', ' ')}</p>
              {highlight.ioc.threat_names?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400">Threats:</p>
                  <p className="text-xs text-white">{highlight.ioc.threat_names.slice(0, 2).join(', ')}</p>
                </div>
              )}
              <p className="text-xs text-slate-400">
                Confidence: {highlight.ioc.confidence_score}%
              </p>
              {highlight.ioc.sources?.length > 0 && (
                <p className="text-xs text-slate-500">
                  Sources: {highlight.ioc.sources.map(s => s.feed_name).join(', ')}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    lastIndex = highlight.end;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key="text-end">
        {text.substring(lastIndex)}
      </span>
    );
  }

  return <>{parts}</>;
}