import React from 'react';
import { Brain, Play, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function AnalysisPanel({ evidenceId, findings = [] }) {
  const [selectedJobs, setSelectedJobs] = React.useState(['metadata_extract', 'anomaly_detect']);
  const queryClient = useQueryClient();

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      await base44.functions.invoke('evidenceAnalyzeStart', {
        evidence_id: evidenceId,
        job_types: selectedJobs
      });
    },
    onSuccess: () => {
      toast.success('Analysis jobs queued');
      queryClient.invalidateQueries({ queryKey: ['evidence-findings', evidenceId] });
    }
  });

  const jobTypes = [
    { key: 'metadata_extract', label: 'Extract Metadata', description: 'Parse file metadata and headers' },
    { key: 'anomaly_detect', label: 'Detect Anomalies', description: 'AI-powered anomaly detection' },
    { key: 'summarize', label: 'Summarize Content', description: 'Generate evidence summary' },
    { key: 'ioc_correlate', label: 'Correlate IOCs', description: 'Match against threat intelligence' }
  ];

  const severityColors = {
    CRITICAL: 'bg-red-600',
    HIGH: 'bg-orange-600',
    MEDIUM: 'bg-yellow-600',
    LOW: 'bg-blue-600',
    INFO: 'bg-gray-600'
  };

  return (
    <div className="space-y-6">
      {/* Analysis Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI-Assisted Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {jobTypes.map(job => (
              <div key={job.key} className="flex items-start gap-3 p-3 border rounded hover:bg-gray-50">
                <Checkbox
                  checked={selectedJobs.includes(job.key)}
                  onCheckedChange={(checked) => {
                    setSelectedJobs(prev =>
                      checked ? [...prev, job.key] : prev.filter(j => j !== job.key)
                    );
                  }}
                />
                <div className="flex-1">
                  <div className="font-medium">{job.label}</div>
                  <div className="text-sm text-gray-600">{job.description}</div>
                </div>
              </div>
            ))}
          </div>

          <Button 
            onClick={() => analyzeMutation.mutate()}
            disabled={selectedJobs.length === 0 || analyzeMutation.isPending}
            className="w-full"
          >
            <Play className="w-4 h-4 mr-2" />
            {analyzeMutation.isPending ? 'Queuing Analysis...' : 'Run Analysis'}
          </Button>
        </CardContent>
      </Card>

      {/* Findings */}
      {findings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Findings ({findings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {findings.map((finding, idx) => (
              <div key={idx} className="p-4 border rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={severityColors[finding.severity] || 'bg-gray-600'}>
                      {finding.severity}
                    </Badge>
                    <Badge variant="outline">{finding.finding_type}</Badge>
                  </div>
                  {finding.confidence_score && (
                    <span className="text-sm text-gray-600">
                      {finding.confidence_score}% confidence
                    </span>
                  )}
                </div>
                <h4 className="font-semibold mb-1">{finding.title}</h4>
                {finding.details_json && (
                  <pre className="text-xs text-gray-600 mt-2 p-2 bg-gray-50 rounded overflow-auto max-h-32">
                    {JSON.stringify(finding.details_json, null, 2)}
                  </pre>
                )}
                {finding.model_provider && (
                  <div className="text-xs text-gray-500 mt-2">
                    Model: {finding.model_provider} {finding.model_version}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}