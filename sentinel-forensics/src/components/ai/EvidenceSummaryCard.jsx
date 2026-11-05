import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, AlertTriangle, Target, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

/**
 * Evidence Summary Card - Inline AI summary for evidence items
 */
export default function EvidenceSummaryCard({ evidence }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Auto-generate for high-priority or threat-classified evidence
    if (evidence.threat_classification && evidence.threat_classification !== 'benign') {
      generateQuickInsights();
    }
  }, [evidence.id]);

  const generateQuickInsights = async () => {
    if (loading || insights) return;
    
    setLoading(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Provide a ONE-SENTENCE forensic insight for this evidence:
File: ${evidence.file_name}
Type: ${evidence.evidence_type}
Threat: ${evidence.threat_classification || 'unknown'}

Return ONLY one critical finding or recommendation.`,
        add_context_from_internet: false
      });
      setInsights(result);
    } catch (error) {
      console.error('Failed to generate insights:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!insights && !loading) return null;

  return (
    <div className="mt-2">
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-purple-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Analyzing...</span>
        </div>
      ) : (
        <div className="flex items-start gap-2 bg-purple-950/20 border border-purple-500/30 rounded-lg p-2">
          <Sparkles className="w-3 h-3 text-purple-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-purple-200 leading-relaxed">{insights}</p>
        </div>
      )}
    </div>
  );
}