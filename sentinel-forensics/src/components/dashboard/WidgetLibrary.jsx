import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Shield, AlertTriangle, Database, FileText, Activity, 
  TrendingUp, TrendingDown, Network, Radio, Loader2,
  CheckCircle, XCircle, Clock, Target
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981'];

// Threat Overview Widget
export function ThreatOverviewWidget({ user }) {
  const { data: threats = [], isLoading } = useQuery({
    queryKey: ['threats-overview', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.ThreatDetection.filter(
        { organization_id: user.organization_id },
        '-detection_timestamp', 
        50
      );
    },
    enabled: !!user?.organization_id,
    staleTime: 2 * 60 * 1000,
    suspense: false,
    useErrorBoundary: false
  });

  const criticalCount = threats.filter(t => t.severity === 'critical' && t.status !== 'resolved').length;
  const highCount = threats.filter(t => t.severity === 'high' && t.status !== 'resolved').length;
  const mediumCount = threats.filter(t => t.severity === 'medium' && t.status !== 'resolved').length;

  const chartData = [
    { name: 'Critical', value: criticalCount, color: '#EF4444' },
    { name: 'High', value: highCount, color: '#F97316' },
    { name: 'Medium', value: mediumCount, color: '#F59E0B' }
  ];

  return (
    <Card className="bg-slate-900/50 border-slate-800 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-white flex items-center gap-2">
          <Target className="w-5 h-5 text-red-400" />
          Threat Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                <p className="text-2xl font-bold text-red-400">{criticalCount}</p>
                <p className="text-xs text-red-300">Critical</p>
              </div>
              <div className="text-center p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                <p className="text-2xl font-bold text-orange-400">{highCount}</p>
                <p className="text-xs text-orange-300">High</p>
              </div>
              <div className="text-center p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                <p className="text-2xl font-bold text-yellow-400">{mediumCount}</p>
                <p className="text-xs text-yellow-300">Medium</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={50}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Device Status Widget
export function DeviceStatusWidget({ user }) {
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices-status', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.Device.filter(
        { organization_id: user.organization_id },
        '-last_seen_at',
        100
      );
    },
    enabled: !!user?.organization_id,
    staleTime: 5 * 60 * 1000,
    suspense: false,
    useErrorBoundary: false
  });

  const online = devices.filter(d => d.status === 'enrolled').length;
  const offline = devices.filter(d => d.status === 'suspended' || d.status === 'revoked').length;
  const compromised = devices.filter(d => d.isolation_status?.is_isolated).length;

  return (
    <Card className="bg-slate-900/50 border-slate-800 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-green-400" />
          Device Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border border-green-500/20">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-sm text-white">Online</span>
              </div>
              <span className="text-lg font-bold text-green-400">{online}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg border border-slate-600">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-400" />
                <span className="text-sm text-white">Offline</span>
              </div>
              <span className="text-lg font-bold text-slate-400">{offline}</span>
            </div>
            {compromised > 0 && (
              <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-400" />
                  <span className="text-sm text-white">Compromised</span>
                </div>
                <span className="text-lg font-bold text-red-400">{compromised}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Security Posture Widget
export function SecurityPostureWidget({ user }) {
  const { data: posture, isLoading } = useQuery({
    queryKey: ['security-posture', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return null;
      const profiles = await base44.entities.SecurityProfile.filter(
        { organization_id: user.organization_id },
        '-timestamp',
        1
      );
      return profiles[0] || null;
    },
    enabled: !!user?.organization_id,
    staleTime: 5 * 60 * 1000,
    suspense: false,
    useErrorBoundary: false
  });

  const score = posture?.posture_score || 0;
  const color = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';

  return (
    <Card className="bg-slate-900/50 border-slate-800 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          Security Posture
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-5xl font-bold text-white mb-2">{score}</p>
              <Badge className={`bg-${color}-500/20 text-${color}-400`}>
                {score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : 'Needs Attention'}
              </Badge>
            </div>
            <Progress value={score} className="h-3" />
            {posture && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-slate-800/50 rounded">
                  <p className="text-slate-400">Checks</p>
                  <p className="text-white font-bold">{posture.checks_performed}</p>
                </div>
                <div className="p-2 bg-slate-800/50 rounded">
                  <p className="text-slate-400">Critical Issues</p>
                  <p className="text-red-400 font-bold">{posture.critical_issues}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Evidence & Cases Widget
export function EvidenceCasesWidget({ user }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['evidence-cases', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return { cases: 0, evidence: 0 };
      const [cases, evidence] = await Promise.all([
        base44.entities.Case.filter({ organization_id: user.organization_id }, '-created_date', 100),
        base44.entities.EvidenceV2.filter({ organization_id: user.organization_id }, '-created_date', 100)
      ]);
      return { cases: cases.length, evidence: evidence.length };
    },
    enabled: !!user?.organization_id,
    staleTime: 5 * 60 * 1000,
    suspense: false,
    useErrorBoundary: false
  });

  return (
    <Card className="bg-slate-900/50 border-slate-800 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-white flex items-center gap-2">
          <Database className="w-5 h-5 text-purple-400" />
          Forensics Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="space-y-3">
            <Link to={createPageUrl('Cases')} className="block">
              <div className="flex items-center justify-between p-4 bg-blue-500/10 rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-colors">
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-blue-400" />
                  <div>
                    <p className="text-sm text-slate-400">Active Cases</p>
                    <p className="text-2xl font-bold text-white">{stats.cases}</p>
                  </div>
                </div>
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
            </Link>
            <Link to={createPageUrl('Evidence')} className="block">
              <div className="flex items-center justify-between p-4 bg-purple-500/10 rounded-lg border border-purple-500/20 hover:bg-purple-500/20 transition-colors">
                <div className="flex items-center gap-3">
                  <Database className="w-6 h-6 text-purple-400" />
                  <div>
                    <p className="text-sm text-slate-400">Evidence Items</p>
                    <p className="text-2xl font-bold text-white">{stats.evidence}</p>
                  </div>
                </div>
                <TrendingUp className="w-5 h-5 text-purple-400" />
              </div>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Network Activity Widget
export function NetworkActivityWidget({ user }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['network-activity', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.NetworkLog.filter(
        { organization_id: user.organization_id },
        '-timestamp',
        100
      );
    },
    enabled: !!user?.organization_id,
    staleTime: 2 * 60 * 1000,
    suspense: false,
    useErrorBoundary: false
  });

  const suspicious = logs.filter(l => l.suspicious).length;
  const total = logs.length;

  return (
    <Card className="bg-slate-900/50 border-slate-800 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-white flex items-center gap-2">
          <Network className="w-5 h-5 text-cyan-400" />
          Network Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                <p className="text-2xl font-bold text-cyan-400">{total}</p>
                <p className="text-xs text-cyan-300">Total Connections</p>
              </div>
              <div className="text-center p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                <p className="text-2xl font-bold text-orange-400">{suspicious}</p>
                <p className="text-xs text-orange-300">Suspicious</p>
              </div>
            </div>
            <Progress value={(suspicious / total) * 100 || 0} className="h-2" />
            <p className="text-xs text-slate-400 text-center">
              {((suspicious / total) * 100 || 0).toFixed(1)}% flagged as suspicious
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// BLE Monitoring Widget
export function BLEMonitoringWidget({ user }) {
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['ble-devices', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.BLEDevice.filter(
        { organization_id: user.organization_id },
        '-last_seen',
        50
      );
    },
    enabled: !!user?.organization_id,
    staleTime: 2 * 60 * 1000,
    suspense: false,
    useErrorBoundary: false
  });

  const trusted = devices.filter(d => d.trust_level === 'trusted').length;
  const unknown = devices.filter(d => d.trust_level === 'unknown').length;
  const suspicious = devices.filter(d => d.trust_level === 'suspicious').length;

  return (
    <Card className="bg-slate-900/50 border-slate-800 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-white flex items-center gap-2">
          <Radio className="w-5 h-5 text-indigo-400" />
          BLE Monitoring
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between items-center p-2 bg-green-500/10 rounded border border-green-500/20">
              <span className="text-sm text-white">Trusted</span>
              <Badge className="bg-green-500/20 text-green-400">{trusted}</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-slate-700/50 rounded border border-slate-600">
              <span className="text-sm text-white">Unknown</span>
              <Badge className="bg-slate-500/20 text-slate-400">{unknown}</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-500/10 rounded border border-red-500/20">
              <span className="text-sm text-white">Suspicious</span>
              <Badge className="bg-red-500/20 text-red-400">{suspicious}</Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const widgetRegistry = {
  'threat-overview': { component: ThreatOverviewWidget, title: 'Threat Overview', category: 'threats' },
  'device-status': { component: DeviceStatusWidget, title: 'Device Status', category: 'devices' },
  'security-posture': { component: SecurityPostureWidget, title: 'Security Posture', category: 'security' },
  'evidence-cases': { component: EvidenceCasesWidget, title: 'Forensics Overview', category: 'forensics' },
  'network-activity': { component: NetworkActivityWidget, title: 'Network Activity', category: 'network' },
  'ble-monitoring': { component: BLEMonitoringWidget, title: 'BLE Monitoring', category: 'monitoring' }
};