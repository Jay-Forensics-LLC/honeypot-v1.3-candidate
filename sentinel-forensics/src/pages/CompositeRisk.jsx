import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Play, Loader2, AlertTriangle, Eye, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import CompositeRiskDetailDrawer from '../components/composite/CompositeRiskDetailDrawer';

export default function CompositeRisk() {
  const { id: caseId } = useParams();
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedFinding, setSelectedFinding] = useState(null);

  const { data: findings = [] } = useQuery({
    queryKey: ['composite-risk-findings', caseId],
    queryFn: async () => {
      return await base44.entities.CompositeRiskFinding.filter({ case_id: caseId });
    }
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('runCompositeRisk', {
        caseId,
        parametersJson: {
          weightConfig: {
            ipWeight: 0.45,
            emailWeight: 0.25,
            behaviorWeight: 0.30
          },
          thresholds: {
            high: 80,
            medium: 50
          }
        }
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['composite-risk-findings', caseId] });
      toast.success(`Analysis complete: ${data.findings.length} findings`, {
        description: `${data.stats.critical} critical, ${data.stats.high} high risk`
      });
    },
    onError: (error) => {
      toast.error('Analysis failed', { description: error.message });
    }
  });

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/30',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      info: 'bg-slate-500/20 text-slate-400 border-slate-500/30'
    };
    return colors[severity] || colors.info;
  };

  const getStatusIcon = (status) => {
    if (status === 'reviewed') return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    if (status === 'dismissed') return <CheckCircle2 className="w-4 h-4 text-slate-400" />;
    return <AlertTriangle className="w-4 h-4 text-orange-400" />;
  };

  const filtered = findings.filter(f => {
    const severityMatch = severityFilter === 'all' || f.severity === severityFilter;
    const statusMatch = statusFilter === 'all' || f.reviewed_status === statusFilter;
    return severityMatch && statusMatch;
  });

  const sorted = [...filtered].sort((a, b) => b.risk_score - a.risk_score);

  const stats = {
    total: findings.length,
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    avgScore: findings.length > 0
      ? Math.round(findings.reduce((sum, f) => sum + f.risk_score, 0) / findings.length)
      : 0,
    unreviewed: findings.filter(f => f.reviewed_status === 'unreviewed').length
  };

  return (
    <>
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Composite Risk Analysis</h1>
              <p className="text-slate-400">Multi-vector session and user risk scoring</p>
            </div>
            <Button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              className="bg-[#EF4444] hover:bg-[#DC2626]"
            >
              {analyzeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Analysis
                </>
              )}
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">Total Findings</p>
                <p className="text-3xl font-bold text-white mt-1">{stats.total}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">Critical</p>
                <p className="text-3xl font-bold text-red-400 mt-1">{stats.critical}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">High Risk</p>
                <p className="text-3xl font-bold text-orange-400 mt-1">{stats.high}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">Avg Score</p>
                <p className="text-3xl font-bold text-white mt-1">{stats.avgScore}</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex gap-4">
            <div className="flex-1">
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="bg-slate-900 border-slate-800 text-white">
                  <SelectValue placeholder="Filter by severity" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-slate-900 border-slate-800 text-white">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="unreviewed">Unreviewed</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Findings List */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Risk Findings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sorted.length === 0 ? (
                  <div className="text-center py-12">
                    <Shield className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No risk findings yet</p>
                    <p className="text-sm text-slate-500 mt-2">Run analysis to generate findings</p>
                  </div>
                ) : (
                  sorted.map((finding) => (
                    <div
                      key={finding.id}
                      className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
                      onClick={() => setSelectedFinding(finding)}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {getStatusIcon(finding.reviewed_status)}
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate">{finding.title}</p>
                          <p className="text-sm text-slate-400 line-clamp-1 mt-1">{finding.description}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge className={getSeverityColor(finding.severity)}>
                              {finding.severity.toUpperCase()}
                            </Badge>
                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                              Score: {finding.risk_score}/100
                            </Badge>
                            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                              {finding.finding_type}
                            </Badge>
                            <span className="text-xs text-slate-500">
                              Confidence: {Math.round(finding.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs text-slate-400">
                          {format(new Date(finding.created_date), 'MMM d, HH:mm')}
                        </span>
                        <Eye className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {selectedFinding && (
        <CompositeRiskDetailDrawer
          finding={selectedFinding}
          caseId={caseId}
          onClose={() => setSelectedFinding(null)}
        />
      )}
    </>
  );
}