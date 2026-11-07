import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function HuntReport({ runId, findings }) {
  const generateReport = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      
      // Generate report data
      const reportData = {
        run_id: runId,
        generated_at: new Date().toISOString(),
        organization_id: user.organization_id,
        summary: {
          total_findings: findings.length,
          critical: findings.filter(f => f.severity === 'critical').length,
          high: findings.filter(f => f.severity === 'high').length,
          medium: findings.filter(f => f.severity === 'medium').length,
          low: findings.filter(f => f.severity === 'low').length
        },
        findings: findings.map(f => ({
          finding_id: f.finding_id,
          title: f.title,
          category: f.category,
          severity: f.severity,
          risk_score: f.risk_score,
          confidence: f.confidence,
          hypothesis: f.hypothesis,
          recommended_next_steps: f.recommended_next_steps,
          blast_radius: f.blast_radius
        }))
      };

      // Create downloadable JSON
      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hunt-report-${runId}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return reportData;
    },
    onSuccess: () => {
      toast.success('Hunt report generated and downloaded');
    }
  });

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-green-400" />
          Export Report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-xs text-green-300">
            Generate a comprehensive report of all findings from this hunt run
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-slate-800 rounded-lg">
            <p className="text-slate-400 mb-1">Total Findings</p>
            <p className="text-2xl font-bold text-white">{findings.length}</p>
          </div>
          <div className="p-3 bg-slate-800 rounded-lg">
            <p className="text-slate-400 mb-1">Critical</p>
            <p className="text-2xl font-bold text-red-400">
              {findings.filter(f => f.severity === 'critical').length}
            </p>
          </div>
        </div>

        <Button
          onClick={() => generateReport.mutate()}
          disabled={generateReport.isPending || findings.length === 0}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          {generateReport.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Generate Report
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}