import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, RefreshCw, Zap } from 'lucide-react';
import { useAIOrchestrator } from '../hooks/useAIOrchestrator';
import { toast } from 'sonner';

/**
 * PHASE 5: AI Summary Component with Orchestrator Integration
 * Generates intelligent summaries with sensitivity control
 */
export default function AISummary({ type, data, sensitivity = 'medium', onSummaryGenerated }) {
  const [summary, setSummary] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const orchestrator = useAIOrchestrator();

  const generateSummary = async () => {
    try {
      let prompt = '';
      let taskType = '';
      let sensitivityLevel = sensitivity;
      let latency = 10000;
      
      if (type === 'case') {
        taskType = 'forensic_report';
        sensitivityLevel = 'high'; // Cases are always high sensitivity
        latency = 15000;
        
        prompt = `Analyze this forensic case and provide a concise summary highlighting:
1. Key findings and critical evidence
2. Potential leads and investigative directions
3. Risk assessment and threat indicators
4. Recommended next actions

Case Details:
- Title: ${data.title}
- Status: ${data.status}
- Priority: ${data.priority || 'N/A'}
- Description: ${data.description || 'No description'}
- Created: ${new Date(data.created_date).toLocaleDateString()}
${data.evidence_count ? `- Evidence Items: ${data.evidence_count}` : ''}
${data.tags?.length ? `- Tags: ${data.tags.join(', ')}` : ''}

Provide a professional forensic analysis summary in 3-4 paragraphs.`;
      } else if (type === 'evidence') {
        taskType = 'quick_summary';
        sensitivityLevel = 'low'; // Quick summaries can be low sensitivity
        latency = 5000;
        
        prompt = `Analyze this digital evidence and provide a concise forensic summary highlighting:
1. Key findings and significance
2. Potential connections and patterns
3. Security implications and threat indicators
4. Recommended analysis steps

Evidence Details:
- File: ${data.file_name}
- Type: ${data.evidence_type}
- Hash: ${data.file_hash || 'N/A'}
- Size: ${data.file_size ? Math.round(data.file_size / 1024) + ' KB' : 'N/A'}
- Status: ${data.verification_status || 'pending'}
- Description: ${data.description || 'No description'}
${data.tags?.length ? `- Tags: ${data.tags.join(', ')}` : ''}
${data.threat_classification ? `- Threat Level: ${data.threat_classification}` : ''}

Provide a professional forensic analysis summary in 2-3 paragraphs.`;
      }

      const result = await orchestrator.mutateAsync({
        taskType,
        prompt,
        sensitivity: sensitivityLevel,
        latencyToleranceMs: latency,
        rawDataRefs: data.id ? [data.id] : undefined
      });

      setSummary(result.response);
      setMetadata(result.metadata);

      if (onSummaryGenerated) {
        onSummaryGenerated(result.response);
      }
      toast.success('AI summary generated successfully');
    } catch (error) {
      console.error('Failed to generate summary:', error);
      toast.error('Failed to generate AI summary');
    }
  };

  const isLoading = orchestrator.isPending;

  return (
    <Card className="bg-gradient-to-br from-purple-950/30 to-blue-950/30 border-purple-500/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium text-purple-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI-Powered Analysis
            </CardTitle>
            {metadata && (
              <Badge variant="outline" className="text-xs bg-purple-500/20 border-purple-500/40">
                <Zap className="w-3 h-3 mr-1" />
                {metadata.model}
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={generateSummary}
            disabled={isLoading}
            className="h-8 text-purple-200 hover:text-white hover:bg-purple-500/20"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : summary ? (
              <>
                <RefreshCw className="w-3 h-3 mr-1" />
                Regenerate
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 mr-1" />
                Generate
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-2" />
              <p className="text-sm text-slate-400">Analyzing with AI...</p>
            </div>
          </div>
        ) : summary ? (
          <div className="space-y-3">
            <div className="prose prose-sm prose-invert max-w-none">
              <div className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                {summary}
              </div>
            </div>
            {metadata && (
              <div className="flex gap-2 text-xs text-slate-400 pt-2 border-t border-slate-700">
                <span>Tokens: {metadata.tokens_used}</span>
                <span>•</span>
                <span>Cost: ${metadata.cost_usd}</span>
                <span>•</span>
                <span>{metadata.duration_ms}ms</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6">
            <Sparkles className="w-12 h-12 text-purple-400/50 mx-auto mb-2" />
            <p className="text-sm text-slate-400 mb-3">
              Generate an AI-powered analysis to identify key findings and potential leads
            </p>
            <Button
              onClick={generateSummary}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate AI Summary
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}