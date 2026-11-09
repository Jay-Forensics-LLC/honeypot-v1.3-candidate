import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../components/hooks/useUser';
import { useOrgQuery } from '../components/hooks/useOrgQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/components/utils';
import ProactiveRiskAlertsWidget from '../components/dashboard/ProactiveRiskAlertsWidget';
import {
  Shield,
  AlertTriangle,
  Activity,
  Laptop,
  FileText,
  TrendingUp,
  Clock,
  ChevronRight,
  Cpu,
  HardDrive,
  CheckCircle,
  Radio,
  Wifi,
  Network,
  Eye,
  Lock,
  Zap
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';

export default function Dashboard() {
  const { data: user } = useUser();
  
  const [systemDiagnostics, setSystemDiagnostics] = useState({
    serviceWorker: 'checking',
    storage: { used: 0, quota: 0 },
    crypto: false,
    csp: false
  });

  // Fetch key metrics
  const { data: cases = [] } = useOrgQuery('Case', {}, '-created_date', 10);
  const { data: evidence = [] } = useOrgQuery('EvidenceV2', {}, '-created_date', 10);
  const { data: alerts = [] } = useOrgQuery('Alert', {}, '-created_date', 10);
  const { data: devices = [] } = useOrgQuery('Device', {}, '-agent_last_seen_at', 10);
  
  const { data: sessions = [] } = useQuery({
    queryKey: ['scan-sessions'],
    queryFn: () => base44.entities.ScanSession.list('-start_timestamp', 20),
    initialData: []
  });

  const activeCases = cases.filter(c => c.status !== 'closed').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
  const onlineDevices = devices.filter(d => d.agent_status === 'online').length;
  const recentEvidence = evidence.length;
  
  // System diagnostics check
  useEffect(() => {
    checkSystemDiagnostics();
  }, []);
  
  const checkSystemDiagnostics = async () => {
    const diagnostics = { ...systemDiagnostics };
    
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      diagnostics.serviceWorker = registration ? 'active' : 'not_registered';
    } else {
      diagnostics.serviceWorker = 'not_supported';
    }
    
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      diagnostics.storage = {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }
    
    diagnostics.crypto = 'crypto' in window && 'subtle' in window.crypto;
    diagnostics.csp = true;
    
    setSystemDiagnostics(diagnostics);
  };
  
  // Session timeline data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });
  
  const sessionTimeline = last7Days.map(date => ({
    date: format(new Date(date), 'MMM dd'),
    sessions: sessions.filter(s => s.start_timestamp?.startsWith(date)).length,
    anomalies: sessions.filter(s => s.start_timestamp?.startsWith(date) && s.anomaly_count > 0).length
  }));

  const quickActions = [
    { label: 'Start Scan', icon: Zap, path: 'NewScanSession', color: 'bg-emerald-500' },
    { label: 'New Case', icon: FileText, path: 'Cases', color: 'bg-blue-500' },
    { label: 'Add Evidence', icon: Shield, path: 'Evidence', color: 'bg-green-500' },
    { label: 'View Alerts', icon: AlertTriangle, path: 'AlertManagement', color: 'bg-red-500' },
    { label: 'Devices', icon: Laptop, path: 'DeviceInventory', color: 'bg-purple-500' },
    { label: 'Reports', icon: TrendingUp, path: 'Reports', color: 'bg-orange-500' }
  ];

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6 pb-24 md:pb-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Dashboard</h1>
            <p className="text-sm md:text-base text-slate-400">Welcome back, {user?.full_name || 'User'}</p>
          </div>
          <Badge variant="outline" className="text-slate-300 border-slate-700/50">
            <Clock className="w-4 h-4 mr-2" />
            {new Date().toLocaleDateString()}
          </Badge>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <Card className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 border-slate-800/50 hover:border-blue-500/50 transition-all backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">Active Cases</CardTitle>
              <FileText className="w-4 h-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{activeCases}</div>
              <p className="text-xs text-slate-500 mt-1">Total: {cases.length}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 border-slate-800/50 hover:border-red-500/50 transition-all backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">Critical Alerts</CardTitle>
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{criticalAlerts}</div>
              <p className="text-xs text-slate-500 mt-1">Total: {alerts.length}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 border-slate-800/50 hover:border-green-500/50 transition-all backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">Online Devices</CardTitle>
              <Laptop className="w-4 h-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{onlineDevices}</div>
              <p className="text-xs text-slate-500 mt-1">Total: {devices.length}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 border-slate-800/50 hover:border-purple-500/50 transition-all backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">Recent Evidence</CardTitle>
              <Shield className="w-4 h-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{recentEvidence}</div>
              <p className="text-xs text-slate-500 mt-1">Last 10 items</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 border-slate-800/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
              {quickActions.map((action) => (
                <Link
                  key={action.path}
                  to={createPageUrl(action.path)}
                  className="no-underline"
                >
                  <Button
                    variant="outline"
                    className="w-full h-auto flex flex-col items-center gap-2 p-3 md:p-4 hover:bg-slate-800/80 border-slate-700/50 bg-slate-800/30 transition-all"
                  >
                    <div className={`${action.color} p-2 rounded-lg shadow-lg`}>
                      <action.icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    </div>
                    <span className="text-xs md:text-sm text-slate-300">{action.label}</span>
                  </Button>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* System Diagnostics */}
        <Card className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 border-slate-800/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Cpu className="w-5 h-5" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Service Worker</span>
                  {systemDiagnostics.serviceWorker === 'active' ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  )}
                </div>
                <p className="text-xs text-white capitalize">{systemDiagnostics.serviceWorker.replace('_', ' ')}</p>
              </div>
              
              <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Storage</span>
                  <HardDrive className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-xs text-white">
                  {(systemDiagnostics.storage.used / 1024 / 1024).toFixed(2)} MB
                </p>
                <Progress 
                  value={(systemDiagnostics.storage.used / systemDiagnostics.storage.quota) * 100} 
                  className="h-1 mt-2"
                />
              </div>
              
              <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">WebCrypto</span>
                  {systemDiagnostics.crypto ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  )}
                </div>
                <p className="text-xs text-white">{systemDiagnostics.crypto ? 'Supported' : 'Not Available'}</p>
              </div>
              
              <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Security</span>
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-xs text-white">Protected</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Session Activity Chart */}
        {sessions.length > 0 && (
          <Card className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 border-slate-800/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white">Session Activity (Last 7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={sessionTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                    labelStyle={{ color: '#f1f5f9' }}
                  />
                  <Line type="monotone" dataKey="sessions" stroke="#3b82f6" strokeWidth={2} name="Sessions" />
                  <Line type="monotone" dataKey="anomalies" stroke="#ef4444" strokeWidth={2} name="Anomalies" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Proactive Risk Alerts Widget */}
        <ProactiveRiskAlertsWidget />

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Recent Cases */}
          <Card className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 border-slate-800/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white">Recent Cases</CardTitle>
              <Link to={createPageUrl('Cases')}>
                <Button variant="ghost" size="sm" className="text-blue-400">
                  View All <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {cases.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/60 transition-all border border-slate-700/30"
                  >
                    <div className="flex-1">
                      <p className="text-white font-medium text-sm">{item.case_name || item.case_number}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(item.created_date).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      className={
                        item.status === 'active' ? 'bg-green-500/20 text-green-400' :
                        item.status === 'closed' ? 'bg-slate-500/20 text-slate-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>
                ))}
                {cases.length === 0 && (
                  <p className="text-slate-400 text-center py-4">No cases yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Alerts */}
          <Card className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 border-slate-800/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white">Recent Alerts</CardTitle>
              <Link to={createPageUrl('AlertManagement')}>
                <Button variant="ghost" size="sm" className="text-blue-400">
                  View All <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {alerts.slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/60 transition-all border border-slate-700/30"
                  >
                    <div className="flex-1">
                      <p className="text-white font-medium text-sm">{alert.title}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(alert.created_date).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      className={
                        alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        alert.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        alert.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-blue-500/20 text-blue-400'
                      }
                    >
                      {alert.severity}
                    </Badge>
                  </div>
                ))}
                {alerts.length === 0 && (
                  <p className="text-slate-400 text-center py-4">No alerts</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}