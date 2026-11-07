import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  FileText,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';
import { toast } from 'sonner';

export default function ComplianceDashboard({ caseId }) {
  const [selectedFramework, setSelectedFramework] = useState('GDPR');
  const queryClient = useQueryClient();

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['compliance-reports', caseId, selectedFramework],
    queryFn: () => base44.entities.ComplianceReport.filter(
      { case_id: caseId, framework_name: selectedFramework },
      '-assessed_at',
      1
    )
  });

  const assessMutation = useMutation({
    mutationFn: () => base44.functions.invoke('assessCaseCompliance', {
      case_id: caseId,
      framework_name: selectedFramework
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-reports', caseId] });
      toast.success('Compliance assessment complete');
    },
    onError: () => {
      toast.error('Assessment failed');
    }
  });

  const latestReport = reports[0];

  const getStatusColor = (status) => {
    const colors = {
      compliant: 'bg-green-500/20 text-green-400 border-green-500/50',
      partially_compliant: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      non_compliant: 'bg-red-500/20 text-red-400 border-red-500/50',
      not_applicable: 'bg-slate-500/20 text-slate-400 border-slate-500/50'
    };
    return colors[status] || colors.not_applicable;
  };

  const getRequirementStatusIcon = (status) => {
    const icons = {
      met: <CheckCircle className="w-5 h-5 text-green-400" />,
      failed: <XCircle className="w-5 h-5 text-red-400" />,
      partial: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
      'n/a': <span className="w-5 h-5 text-slate-400">—</span>
    };
    return icons[status] || icons['n/a'];
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Compliance Assessment
          </CardTitle>
          <div className="flex items-center gap-3">
            <Select value={selectedFramework} onValueChange={setSelectedFramework}>
              <SelectTrigger className="w-40 bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                <SelectItem value="GDPR">GDPR</SelectItem>
                <SelectItem value="HIPAA">HIPAA</SelectItem>
                <SelectItem value="PCI_DSS">PCI DSS</SelectItem>
                <SelectItem value="NIST_CSF">NIST CSF</SelectItem>
                <SelectItem value="ISO_27001">ISO 27001</SelectItem>
                <SelectItem value="SOC2">SOC 2</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => assessMutation.mutate()}
              disabled={assessMutation.isPending}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              {assessMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Assess
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {!latestReport ? (
          <div className="text-center py-12">
            <Shield className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400 mb-4">No compliance assessment yet</p>
            <Button
              onClick={() => assessMutation.mutate()}
              disabled={assessMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {assessMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <TrendingUp className="w-4 h-4 mr-2" />
              )}
              Run Assessment
            </Button>
          </div>
        ) : (
          <>
            {/* Overall Status */}
            <div className={`rounded-lg p-6 border ${
              latestReport.compliance_status === 'compliant'
                ? 'bg-green-900/20 border-green-500/30'
                : latestReport.compliance_status === 'partially_compliant'
                ? 'bg-yellow-900/20 border-yellow-500/30'
                : 'bg-red-900/20 border-red-500/30'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">
                    {latestReport.overall_score}% Compliant
                  </h3>
                  <Badge className={getStatusColor(latestReport.compliance_status)}>
                    {latestReport.compliance_status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-400">
                    {latestReport.requirements_met}/{latestReport.requirements_assessed} Requirements
                  </p>
                  <p className="text-xs text-slate-500">
                    Assessed {DateUtils.safeRelativeTime(latestReport.assessed_at)}
                  </p>
                </div>
              </div>
              <Progress value={latestReport.overall_score} className="h-2" />
            </div>

            {/* Critical Gaps */}
            {latestReport.critical_gaps?.length > 0 && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  Critical Compliance Gaps
                </h3>
                <div className="space-y-2">
                  {latestReport.critical_gaps.map((gap, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <span className="text-red-200">{gap}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Requirements Breakdown */}
            <div>
              <h3 className="text-white font-semibold mb-4">Requirements Detail</h3>
              <div className="space-y-3">
                {latestReport.detailed_results?.map((result, idx) => (
                  <Card key={idx} className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          {getRequirementStatusIcon(result.status)}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-white font-medium text-sm">
                                {result.requirement_title}
                              </p>
                              <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">
                                {result.requirement_id}
                              </Badge>
                            </div>
                            
                            {result.category && (
                              <Badge className="bg-blue-500/20 text-blue-300 text-xs mb-2">
                                {result.category}
                              </Badge>
                            )}

                            <p className="text-sm text-slate-400">{result.notes}</p>

                            {result.deadline && result.time_remaining_hours !== null && (
                              <div className="flex items-center gap-2 mt-2">
                                <Clock className="w-4 h-4 text-yellow-400" />
                                <span className={`text-xs ${
                                  result.time_remaining_hours < 0
                                    ? 'text-red-400 font-bold'
                                    : result.time_remaining_hours < 24
                                    ? 'text-yellow-400'
                                    : 'text-slate-400'
                                }`}>
                                  {result.time_remaining_hours < 0
                                    ? `OVERDUE by ${Math.abs(Math.floor(result.time_remaining_hours))}h`
                                    : `${Math.floor(result.time_remaining_hours)}h remaining`
                                  }
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            {latestReport.recommendations?.length > 0 && (
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  Recommended Actions
                </h3>
                <div className="space-y-1">
                  {latestReport.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-blue-400">•</span>
                      <span className="text-blue-200">{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}