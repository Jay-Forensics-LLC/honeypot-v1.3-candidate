import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Download, Search, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '../components/common/PageHeader';
import { format } from 'date-fns';

export default function PolicyComplianceDashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  const { data: evaluations = [], isLoading } = useQuery({
    queryKey: ['policy-evaluations'],
    queryFn: async () => {
      const user = await base44.auth.me();
      return await base44.entities.PolicyEvaluation.filter({
        organization_id: user.organization_id
      }, '-last_evaluated_at');
    }
  });

  const { data: policies = [] } = useQuery({
    queryKey: ['security-policies'],
    queryFn: async () => {
      const user = await base44.auth.me();
      return await base44.entities.SecurityPolicy.filter({
        organization_id: user.organization_id
      });
    }
  });

  const compliantCount = evaluations.filter(e => e.status === 'COMPLIANT').length;
  const nonCompliantCount = evaluations.filter(e => e.status === 'NON_COMPLIANT').length;
  const pendingCount = evaluations.filter(e => e.status === 'PENDING').length;
  const overallCompliance = evaluations.length > 0 
    ? Math.round((compliantCount / evaluations.length) * 100)
    : 0;

  const handleExport = () => {
    const exportData = {
      watermark: "NOT LEGALLY ADMISSIBLE UNTIL VERIFIED",
      export_timestamp: new Date().toISOString(),
      summary: {
        total_evaluations: evaluations.length,
        compliant: compliantCount,
        non_compliant: nonCompliantCount,
        pending: pendingCount,
        compliance_percentage: overallCompliance
      },
      evaluations: filteredEvaluations
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance_report_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Compliance report exported');
  };

  const filteredEvaluations = evaluations.filter(evaluation => {
    const matchesSearch = evaluation.device_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || evaluation.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
    <div className="min-h-screen bg-black text-white p-6">
      <PageHeader
        title="Policy Compliance Dashboard"
        description="Monitor device compliance across security policies"
        icon={Shield}
        actions={[
          {
            label: 'Export Report',
            icon: Download,
            variant: 'outline',
            onClick: handleExport,
            disabled: evaluations.length === 0
          }
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Shield className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-2xl font-bold text-white">{overallCompliance}%</p>
                <p className="text-xs text-slate-400">Overall Compliance</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-800 mb-6">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by device ID..."
                className="pl-10 bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="COMPLIANT">Compliant</SelectItem>
                <SelectItem value="NON_COMPLIANT">Non-Compliant</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Compliance Evaluations</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">Loading evaluations...</div>
          ) : filteredEvaluations.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 mb-2">
                {evaluations.length === 0 
                  ? 'No compliance evaluations yet'
                  : 'No evaluations match your filters'
                }
              </p>
              {evaluations.length === 0 && (
                <p className="text-xs text-slate-500">
                  Deploy agents and assign policies to start compliance monitoring
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEvaluations.map((evaluation) => (
                <div
                  key={evaluation.id}
                  className="p-4 bg-slate-800/30 rounded border border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-white font-mono text-sm">
                          Device: {evaluation.device_id.slice(0, 16)}...
                        </span>
                        <Badge className={getStatusColor(evaluation.status)}>
                          {evaluation.status}
                        </Badge>
                        {evaluation.compliance_score !== undefined && (
                          <Badge variant="outline" className="text-slate-400">
                            {evaluation.compliance_score}%
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Last evaluated: {format(new Date(evaluation.last_evaluated_at), 'MMM d, yyyy HH:mm')}
                      </p>
                      {evaluation.findings_json && Object.keys(evaluation.findings_json).length > 0 && (
                        <div className="mt-2 flex gap-2 flex-wrap">
                          {Object.entries(evaluation.findings_json).map(([domain, findings]) => (
                            findings.length > 0 && (
                              <Badge key={domain} variant="outline" className="text-xs">
                                {domain}: {findings.length} finding{findings.length !== 1 ? 's' : ''}
                              </Badge>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}