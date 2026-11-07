import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../components/hooks/useUser';
import { useOrgQuery } from '../components/hooks/useOrgQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Shield, TrendingUp, AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { bulkComplianceCheck } from '@/functions/bulkComplianceCheck';

export default function ComplianceReporting() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();

  const { data: devices = [], isLoading } = useOrgQuery('Device', {}, '-risk_score', 1000);
  const { data: events = [] } = useOrgQuery('DeviceEvent', { event_type: 'compliance_eval' }, '-created_date', 500);
  const { data: violations = [] } = useOrgQuery('DeviceEvent', { event_type: 'policy_violation' }, '-created_date', 1000);

  const bulkCheckMutation = useMutation({
    mutationFn: () => bulkComplianceCheck({ filter_all: true }),
    onSuccess: () => {
      queryClient.invalidateQueries(['Device']);
      queryClient.invalidateQueries(['DeviceEvent']);
      toast.success('Compliance checks initiated for all devices');
    }
  });

  const stats = useMemo(() => {
    const total = devices.length;
    const compliant = devices.filter(d => d.compliance_status === 'pass').length;
    const warning = devices.filter(d => d.compliance_status === 'warn').length;
    const failing = devices.filter(d => d.compliance_status === 'fail').length;
    const unknown = devices.filter(d => !d.compliance_status || d.compliance_status === 'unknown').length;
    
    const complianceRate = total > 0 ? Math.round((compliant / total) * 100) : 0;
    const avgRiskScore = total > 0 ? Math.round(devices.reduce((sum, d) => sum + (d.risk_score || 0), 0) / total) : 0;

    return { total, compliant, warning, failing, unknown, complianceRate, avgRiskScore };
  }, [devices]);

  const policyBreakdown = useMemo(() => {
    const breakdown = {};
    
    violations.forEach(v => {
      const policy = v.payload?.policy_name || v.payload?.policy || 'Unknown';
      breakdown[policy] = (breakdown[policy] || 0) + 1;
    });

    return Object.entries(breakdown)
      .map(([policy, count]) => ({ policy, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [violations]);

  const severityBreakdown = useMemo(() => {
    const breakdown = { critical: 0, high: 0, medium: 0, low: 0 };
    
    violations.forEach(v => {
      const severity = v.payload?.severity || 'medium';
      breakdown[severity] = (breakdown[severity] || 0) + 1;
    });

    return [
      { name: 'Critical', value: breakdown.critical, color: '#ef4444' },
      { name: 'High', value: breakdown.high, color: '#f97316' },
      { name: 'Medium', value: breakdown.medium, color: '#eab308' },
      { name: 'Low', value: breakdown.low, color: '#22c55e' }
    ];
  }, [violations]);

  const complianceTrend = useMemo(() => {
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayEvents = events.filter(e => e.created_date?.startsWith(dateStr));
      const compliant = dayEvents.filter(e => e.payload?.compliance_status === 'pass').length;
      const total = dayEvents.length;
      
      last7Days.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        rate: total > 0 ? Math.round((compliant / total) * 100) : 0
      });
    }
    return last7Days;
  }, [events]);

  const exportReport = () => {
    const headers = ['Device', 'User', 'OS', 'Compliance Status', 'Risk Score', 'Critical Violations', 'Last Seen'];
    const rows = devices.map(d => [
      d.hostname || d.device_id,
      d.user || 'Unassigned',
      `${d.os_family} ${d.os_version}`,
      d.compliance_status || 'unknown',
      d.risk_score || 0,
      d.critical_findings_count || 0,
      d.agent_last_seen_at ? new Date(d.agent_last_seen_at).toLocaleDateString() : 'Never'
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-report-${new Date().toISOString()}.csv`;
    a.click();
    toast.success('Compliance report exported');
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Compliance Reporting</h1>
            <p className="text-slate-300">Analytics and trends across your device fleet</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={exportReport} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button 
              onClick={() => bulkCheckMutation.mutate()}
              disabled={bulkCheckMutation.isPending}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${bulkCheckMutation.isPending ? 'animate-spin' : ''}`} />
              Run All Checks
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                <p className="text-sm text-slate-300">Compliance Rate</p>
              </div>
              <p className="text-3xl font-bold text-white">{stats.complianceRate}%</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-green-400" />
                <p className="text-sm text-slate-300">Compliant</p>
              </div>
              <p className="text-3xl font-bold text-green-400">{stats.compliant}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <p className="text-sm text-slate-300">Non-Compliant</p>
              </div>
              <p className="text-3xl font-bold text-red-400">{stats.failing}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-yellow-400" />
                <p className="text-sm text-slate-300">Avg Risk Score</p>
              </div>
              <p className="text-3xl font-bold text-white">{stats.avgRiskScore}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Compliance Trend (7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={complianceTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="rate" fill="#22c55e" name="Compliance Rate %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Violations by Severity</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={severityBreakdown}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {severityBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Top Policy Violations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {policyBreakdown.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-white">{item.policy}</span>
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
                    {item.count} devices
                  </Badge>
                </div>
              ))}
              {policyBreakdown.length === 0 && (
                <p className="text-center text-slate-400 py-4">No violations recorded</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}