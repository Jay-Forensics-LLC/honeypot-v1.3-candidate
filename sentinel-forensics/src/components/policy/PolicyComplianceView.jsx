import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { CheckCircle, AlertTriangle, Clock, Download, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function PolicyComplianceView({ evaluations }) {
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);

  const compliantCount = evaluations.filter(e => e.status === 'COMPLIANT').length;
  const nonCompliantCount = evaluations.filter(e => e.status === 'NON_COMPLIANT').length;
  const pendingCount = evaluations.filter(e => e.status === 'PENDING').length;

  const handleExport = () => {
    const csv = [
      ['Device ID', 'Status', 'Compliance Score', 'Last Evaluated', 'Findings Count'],
      ...evaluations.map(e => [
        e.device_id,
        e.status,
        e.compliance_score || 'N/A',
        format(new Date(e.last_evaluated_at), 'yyyy-MM-dd HH:mm:ss'),
        Object.values(e.findings_json || {}).flat().length
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance_report_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Compliance report exported');
  };

  const getStatusColor = (status) => {
    const colors = {
      COMPLIANT: 'bg-green-500/20 text-green-400',
      NON_COMPLIANT: 'bg-red-500/20 text-red-400',
      PENDING: 'bg-yellow-500/20 text-yellow-400',
      ERROR: 'bg-red-500/20 text-red-400'
    };
    return colors[status] || colors.PENDING;
  };

  return (
    <>
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-10 h-10 text-green-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{compliantCount}</p>
                  <p className="text-xs text-slate-400">Compliant</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-10 h-10 text-red-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{nonCompliantCount}</p>
                  <p className="text-xs text-slate-400">Non-Compliant</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Clock className="w-10 h-10 text-yellow-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{pendingCount}</p>
                  <p className="text-xs text-slate-400">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Evaluations List */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white">Device Compliance</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={evaluations.length === 0}
                className="border-slate-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {evaluations.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">No compliance evaluations yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {evaluations.map((evaluation) => (
                  <div
                    key={evaluation.id}
                    className="p-4 bg-slate-800/30 rounded-lg border border-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-white font-mono text-sm">
                            {evaluation.device_id.slice(0, 8)}...
                          </span>
                          <Badge className={getStatusColor(evaluation.status)}>
                            {evaluation.status}
                          </Badge>
                          {evaluation.compliance_score !== undefined && (
                            <Badge variant="outline" className="text-slate-400">
                              {evaluation.compliance_score}% compliant
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          Last evaluated: {format(new Date(evaluation.last_evaluated_at), 'MMM d, yyyy HH:mm')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedEvaluation(evaluation)}
                        className="border-slate-700"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Evaluation Details Dialog */}
      <Dialog open={!!selectedEvaluation} onOpenChange={() => setSelectedEvaluation(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl">
          {selectedEvaluation && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-3">
                  Compliance Findings
                  <Badge className={getStatusColor(selectedEvaluation.status)}>
                    {selectedEvaluation.status}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {Object.entries(selectedEvaluation.findings_json || {}).map(([domain, findings]) => (
                  <div key={domain} className="space-y-2">
                    <Label className="text-white">{domain.replace(/_/g, ' ').toUpperCase()}</Label>
                    {findings.length === 0 ? (
                      <p className="text-sm text-slate-500">No findings</p>
                    ) : (
                      <div className="space-y-2">
                        {findings.map((finding, idx) => (
                          <div key={idx} className="p-3 bg-slate-800/50 rounded border border-slate-700">
                            <p className="text-sm text-white">{finding.message}</p>
                            <Badge className="mt-2 text-xs" variant="outline">
                              {finding.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}