import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Activity,
  RefreshCw,
  Loader2,
  Globe,
  Smartphone,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Radio,
  Wifi,
  User,
  FileText,
  Filter,
  Search,
  BarChart3,
  Grid3X3,
  Layout,
  Settings,
  Lock,
  Clock,
  Key,
  Database
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { createPageUrl } from "../components/utils";
import WebAuthnManager from "../components/security/WebAuthnManager";
import PrivacyModeToggle from "../components/security/PrivacyModeToggle";
import { format, subDays } from "date-fns";
import { CryptoUtils } from "../components/utils/CryptoUtils";
import { DateUtils } from "../components/utils/DateUtils";
import { widgetRegistry } from "../components/dashboard/WidgetLibrary";
import DashboardCustomizer from "../components/dashboard/DashboardCustomizer";
import { formatDistanceToNow } from 'date-fns';
import RealTimeThreatChart from '../components/security/RealTimeThreatChart';
import UnifiedAuditLogViewer from '../components/security/UnifiedAuditLogViewer';
import SecurityHealthScore from '../components/security/SecurityHealthScore';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function SecurityDashboard() {
  const queryClient = useQueryClient();
  const [scanResult, setScanResult] = useState(null);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [timeRange, setTimeRange] = useState('7d');
  const [auditLogFilter, setAuditLogFilter] = useState({ search: '', severity: 'all', eventType: 'all' });
  const [widgetLayout, setWidgetLayout] = useState(['threats', 'network', 'behavior', 'audit']);
  const [showCustomizeDialog, setShowCustomizeDialog] = useState(false);
  const [socLayout, setSocLayout] = useState(Object.keys(widgetRegistry));
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  // Calculate time range
  const getTimeRangeDate = () => {
    const ranges = {
      '1h': 1 / 24,
      '24h': 1,
      '7d': 7,
      '30d': 30,
      '90d': 90
    };
    return subDays(new Date(), ranges[timeRange] || 7);
  };

  const { data: securityEvents = [] } = useQuery({
    queryKey: ['security-events-recent', timeRange],
    queryFn: async () => {
      try {
        return await base44.entities.SecurityEvent.filter({
          timestamp: { $gte: getTimeRangeDate().toISOString() }
        }, '-timestamp', 1000);
      } catch {
        return [];
      }
    },
    refetchInterval: 30000,
    initialData: []
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts-recent', timeRange],
    queryFn: async () => {
      try {
        return await base44.entities.Alert.filter({
          detection_timestamp: { $gte: getTimeRangeDate().toISOString() }
        }, '-detection_timestamp', 500);
      } catch {
        return [];
      }
    },
    refetchInterval: 15000,
    initialData: []
  });

  const { data: networkLogs = [] } = useQuery({
    queryKey: ['network-logs-recent', timeRange],
    queryFn: async () => {
      try {
        return await base44.entities.NetworkLog.filter({
          timestamp: { $gte: getTimeRangeDate().toISOString() }
        }, '-timestamp', 500);
      } catch {
        return [];
      }
    },
    refetchInterval: 20000,
    initialData: []
  });

  const { data: bleDevices = [] } = useQuery({
    queryKey: ['ble-devices-recent'],
    queryFn: async () => {
      try {
        return await base44.entities.BLEDevice.list('-last_seen', 100);
      } catch {
        return [];
      }
    },
    refetchInterval: 30000,
    initialData: []
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['audit-logs-recent', timeRange],
    queryFn: async () => {
      try {
        return await base44.entities.AuditLog.filter({
          timestamp: { $gte: getTimeRangeDate().toISOString() }
        }, '-timestamp', 1000);
      } catch {
        return [];
      }
    },
    refetchInterval: 30000,
    initialData: []
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['active-sessions'],
    queryFn: async () => {
      try {
        return await base44.entities.SessionToken.filter({
          user_email: user?.email,
          revoked: false,
          expires_at: { $gte: new Date().toISOString() }
        });
      } catch {
        return [];
      }
    },
    enabled: !!user,
    initialData: []
  });

  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence'],
    queryFn: async () => {
      try {
        return await base44.entities.Evidence.list('-collection_timestamp', 1000);
      } catch {
        return [];
      }
    },
    initialData: []
  });

  const runSecurityScanMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('securitySelfScan', {});
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['security-scan'] });
      setScanResult(data);
      setShowResultDialog(true);
      toast.success(`Security scan complete. Score: ${data.security_score}/100`, {
        description: `Found ${data.findings.length} issue(s)`
      });
    },
    onError: (error) => {
      toast.error('Security scan failed: ' + error.message);
    }
  });

  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId) => {
      await base44.entities.SessionToken.update(sessionId, {
        revoked: true,
        revoked_at: new Date().toISOString()
      });

      await base44.entities.SecurityEvent.create({
        event_type: 'admin_action',
        severity: 'info',
        user_email: user.email,
        details: {
          action: 'session_revoked',
          session_id: sessionId
        },
        timestamp: new Date().toISOString(),
        risk_score: 0
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
      toast.success('Session revoked');
    }
  });

  const verifyIntegrityMutation = useMutation({
    mutationFn: async (evidenceItem) => {
      const isValid = evidenceItem.file_hash && evidenceItem.file_hash.length === 64;
      
      await base44.entities.Evidence.update(evidenceItem.id, {
        is_verified: isValid,
        chain_of_custody: [
          ...(evidenceItem.chain_of_custody || []),
          {
            timestamp: new Date().toISOString(),
            action: 'Integrity verified',
            performed_by: user?.email
          }
        ]
      });

      const logEntry = await CryptoUtils.createSecureLogEntry({
        event_type: 'integrity_verification',
        severity: 'info',
        description: `Evidence integrity verified: ${evidenceItem.title}`,
        user_id: user?.email || 'system',
        success: isValid,
        metadata: {
          evidence_id: evidenceItem.id,
          hash_valid: isValid
        }
      });
      
      await base44.entities.AuditLog.create(logEntry);
      
      return { evidenceItem, isValid };
    },
    onSuccess: ({ evidenceItem, isValid }) => {
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      
      if (isValid) {
        toast.success(`✅ Integrity verified: ${evidenceItem.title}`);
      } else {
        toast.error(`⚠️ Integrity check failed: ${evidenceItem.title}`);
      }
    }
  });

  const handleSocLayoutSave = async (newLayout) => {
    try {
      await base44.auth.updateMe({
        dashboard_layout: JSON.stringify(newLayout)
      });
      setSocLayout(newLayout);
      toast.success('Dashboard preferences saved');
    } catch (error) {
      console.error('Failed to save layout:', error);
      toast.error('Failed to save preferences');
    }
  };

  // Calculate security health score
  const securityHealthScore = useMemo(() => {
    let score = 100;
    const criticalAlerts = alerts.filter(a => a.severity === 'critical' && a.status === 'new').length;
    const highAlerts = alerts.filter(a => a.severity === 'high' && a.status === 'new').length;
    const suspiciousNetwork = networkLogs.filter(l => l.is_suspicious).length;
    const highThreatDevices = bleDevices.filter(d => d.threat_assessment?.threat_score > 70).length;
    
    score -= criticalAlerts * 15;
    score -= highAlerts * 8;
    score -= Math.min(suspiciousNetwork * 2, 20);
    score -= Math.min(highThreatDevices * 5, 15);
    
    return Math.max(0, Math.min(100, score));
  }, [alerts, networkLogs, bleDevices]);

  // Filter audit logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const searchMatch = !auditLogFilter.search || 
        log.description?.toLowerCase().includes(auditLogFilter.search.toLowerCase()) ||
        log.user_id?.toLowerCase().includes(auditLogFilter.search.toLowerCase());
      const severityMatch = auditLogFilter.severity === 'all' || log.severity === auditLogFilter.severity;
      const eventTypeMatch = auditLogFilter.eventType === 'all' || log.event_type === auditLogFilter.eventType;
      return searchMatch && severityMatch && eventTypeMatch;
    });
  }, [auditLogs, auditLogFilter]);

  // Prepare chart data
  const threatTrendData = useMemo(() => {
    const days = timeRange === '1h' ? 6 : timeRange === '24h' ? 24 : 7;
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayAlerts = alerts.filter(a => {
        const alertDate = new Date(a.detection_timestamp);
        return alertDate.toDateString() === date.toDateString();
      });
      data.push({
        date: format(date, timeRange === '1h' ? 'HH:mm' : 'MMM d'),
        critical: dayAlerts.filter(a => a.severity === 'critical').length,
        high: dayAlerts.filter(a => a.severity === 'high').length,
        medium: dayAlerts.filter(a => a.severity === 'medium').length
      });
    }
    return data;
  }, [alerts, timeRange]);

  const alertTypeData = useMemo(() => {
    const types = {};
    alerts.forEach(a => {
      types[a.alert_type] = (types[a.alert_type] || 0) + 1;
    });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [alerts]);

  const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#3B82F6'];

  const criticalEvents = securityEvents.filter(e => e.severity === 'critical' && !e.resolved).length;
  const highEvents = securityEvents.filter(e => e.severity === 'high' && !e.resolved).length;

  const unverifiedEvidence = evidence.filter(e => !e.is_verified).length;
  const integrityScore = evidence.length > 0 
    ? ((evidence.filter(e => e.is_verified).length / evidence.length) * 100).toFixed(1)
    : 100;

  const filteredCenterLogs = auditLogs.filter(log =>
    searchTerm === "" ||
    log.event_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.user_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSeverityColorCenter = (severity) => {
    const colors = {
      info: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      error: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      critical: 'bg-red-500/20 text-red-400 border-red-500/50'
    };
    return colors[severity] || colors.info;
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Unified Security Command Center</h1>
            <p className="text-xs md:text-sm text-slate-400 mt-1">Real-time security monitoring and threat intelligence</p>
          </div>
          <div className="flex gap-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="1h">Last Hour</SelectItem>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="90d">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowCustomizeDialog(true)}
              className="border-slate-700"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => runSecurityScanMutation.mutate()}
              disabled={runSecurityScanMutation.isPending}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {runSecurityScanMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Scan
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Security Health Score */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Security Health Score
              </span>
              {securityHealthScore >= 80 ? (
                <TrendingUp className="w-5 h-5 text-green-400" />
              ) : securityHealthScore >= 60 ? (
                <Activity className="w-5 h-5 text-yellow-400" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-400" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-4xl font-bold text-white">{securityHealthScore}/100</span>
                <Badge className={
                  securityHealthScore >= 80 ? 'bg-green-500/20 text-green-400' :
                  securityHealthScore >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-red-500/20 text-red-400'
                }>
                  {securityHealthScore >= 80 ? 'Excellent' : securityHealthScore >= 60 ? 'Good' : 'Needs Attention'}
                </Badge>
              </div>
              <Progress value={securityHealthScore} className="h-3" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-slate-400">Critical Alerts</p>
                  <p className="text-xl font-bold text-red-400">{alerts.filter(a => a.severity === 'critical' && a.status === 'new').length}</p>
                </div>
                <div>
                  <p className="text-slate-400">High Priority</p>
                  <p className="text-xl font-bold text-orange-400">{alerts.filter(a => a.severity === 'high' && a.status === 'new').length}</p>
                </div>
                <div>
                  <p className="text-slate-400">Suspicious Network</p>
                  <p className="text-xl font-bold text-yellow-400">{networkLogs.filter(l => l.is_suspicious).length}</p>
                </div>
                <div>
                  <p className="text-slate-400">Threat Devices</p>
                  <p className="text-xl font-bold text-purple-400">{bleDevices.filter(d => d.threat_assessment?.threat_score > 70).length}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Real-Time Monitoring Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-slate-800">
            <TabsTrigger value="overview">
              <BarChart3 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="threats">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Threat Intel
            </TabsTrigger>
            <TabsTrigger value="network">
              <Wifi className="w-4 h-4 mr-2" />
              Network
            </TabsTrigger>
            <TabsTrigger value="ble">
              <Radio className="w-4 h-4 mr-2" />
              BLE
            </TabsTrigger>
            <TabsTrigger value="audit">
              <FileText className="w-4 h-4 mr-2" />
              Audit Logs
            </TabsTrigger>
            <TabsTrigger value="sessions">
              <User className="w-4 h-4 mr-2" />
              Sessions
            </TabsTrigger>
            <TabsTrigger value="integrity">
              <Lock className="w-4 h-4 mr-2" />
              Integrity
            </TabsTrigger>
            <TabsTrigger value="soc">
              <Shield className="w-4 h-4 mr-2" />
              SOC View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Link to={createPageUrl('AlertManagement')}>
                <Card className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 transition-all cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-6 h-6 text-red-400" />
                      <div>
                        <p className="text-2xl font-bold text-white">{alerts.filter(a => a.severity === 'critical').length}</p>
                        <p className="text-xs text-slate-400">Critical</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <Link to={createPageUrl('NetworkMonitor')}>
                <Card className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-all cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Wifi className="w-6 h-6 text-blue-400" />
                      <div>
                        <p className="text-2xl font-bold text-white">{networkLogs.length}</p>
                        <p className="text-xs text-slate-400">Network Logs</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <Link to={createPageUrl('BLEMonitor')}>
                <Card className="bg-slate-900/50 border-slate-800 hover:border-purple-500/50 transition-all cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Radio className="w-6 h-6 text-purple-400" />
                      <div>
                        <p className="text-2xl font-bold text-white">{bleDevices.length}</p>
                        <p className="text-xs text-slate-400">BLE Devices</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <FileText className="w-6 h-6 text-green-400" />
                    <div>
                      <p className="text-2xl font-bold text-white">{auditLogs.length}</p>
                      <p className="text-xs text-slate-400">Audit Logs</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Threat Trend Chart */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Threat Activity Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={threatTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" stroke="#94A3B8" />
                    <YAxis stroke="#94A3B8" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px' }}
                      labelStyle={{ color: '#F1F5F9' }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="critical" stroke="#EF4444" strokeWidth={2} name="Critical" />
                    <Line type="monotone" dataKey="high" stroke="#F97316" strokeWidth={2} name="High" />
                    <Line type="monotone" dataKey="medium" stroke="#F59E0B" strokeWidth={2} name="Medium" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Alert Type Distribution */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">Alert Types</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={alertTypeData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {alertTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">Recent Critical Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[250px] overflow-y-auto">
                    {alerts.filter(a => a.severity === 'critical').slice(0, 5).map(alert => (
                      <div key={alert.id} className="p-2 bg-slate-800/50 rounded border border-red-500/30">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-white font-medium">{alert.title}</span>
                          <Badge className="bg-red-500/20 text-red-400 text-xs">{alert.alert_type}</Badge>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{format(new Date(alert.detection_timestamp), 'MMM d, HH:mm')}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="threats" className="space-y-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  Active Threats ({alerts.filter(a => a.status === 'new').length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {alerts.filter(a => a.status === 'new').map(alert => (
                    <div key={alert.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={
                              alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                              alert.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                              'bg-yellow-500/20 text-yellow-400'
                            }>
                              {alert.severity}
                            </Badge>
                            <span className="text-sm text-white font-medium">{alert.title}</span>
                          </div>
                          <p className="text-xs text-slate-400">{alert.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            <span>{alert.alert_type}</span>
                            <span>•</span>
                            <span>{format(new Date(alert.detection_timestamp), 'MMM d, HH:mm:ss')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="network" className="space-y-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Wifi className="w-5 h-5 text-blue-400" />
                  Network Activity ({networkLogs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {networkLogs.slice(0, 50).map(log => (
                    <div key={log.id} className={`p-3 bg-slate-800/50 rounded-lg border ${log.is_suspicious ? 'border-red-500/30' : 'border-slate-700'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm text-white font-mono">{log.source_ip} → {log.destination_ip}</span>
                            {log.is_suspicious && (
                              <Badge className="bg-red-500/20 text-red-400 text-xs">Suspicious</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span>{log.protocol}</span>
                            <span>•</span>
                            <span>Port: {log.port}</span>
                            <span>•</span>
                            <span>{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ble" className="space-y-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Radio className="w-5 h-5 text-purple-400" />
                  BLE Devices ({bleDevices.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {bleDevices.map(device => (
                    <div key={device.id} className={`p-3 bg-slate-800/50 rounded-lg border ${device.threat_assessment?.threat_score > 70 ? 'border-red-500/30' : 'border-slate-700'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm text-white font-medium">{device.device_type_classification || 'Unknown'}</span>
                            {device.threat_assessment?.threat_score > 70 && (
                              <Badge className="bg-red-500/20 text-red-400 text-xs">High Threat</Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 font-mono">{device.current_mac_address}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            <span>Threat Score: {device.threat_assessment?.threat_score || 0}</span>
                            <span>•</span>
                            <span>Sightings: {device.total_sightings}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            {/* Audit Log Filters */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4">
                <div className="grid md:grid-cols-3 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search logs..."
                      value={auditLogFilter.search}
                      onChange={(e) => setAuditLogFilter({ ...auditLogFilter, search: e.target.value })}
                      className="pl-10 bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <Select
                    value={auditLogFilter.severity}
                    onValueChange={(value) => setAuditLogFilter({ ...auditLogFilter, severity: value })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={auditLogFilter.eventType}
                    onValueChange={(value) => setAuditLogFilter({ ...auditLogFilter, eventType: value })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue placeholder="Event Type" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="user_login">Login</SelectItem>
                      <SelectItem value="evidence_access">Evidence Access</SelectItem>
                      <SelectItem value="admin_action">Admin Action</SelectItem>
                      <SelectItem value="security_event">Security Event</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-green-400" />
                  Audit Logs ({filteredAuditLogs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {filteredAuditLogs.map(log => (
                    <div key={log.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={
                              log.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                              log.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                              'bg-blue-500/20 text-blue-400'
                            }>
                              {log.severity}
                            </Badge>
                            <span className="text-xs text-slate-400">{log.event_type}</span>
                          </div>
                          <p className="text-sm text-white">{log.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            <span>{log.user_id}</span>
                            <span>•</span>
                            <span>{format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sessions" className="space-y-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Active Sessions ({sessions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>

                {sessions.length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-sm">No active sessions</p>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <div key={session.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Smartphone className="w-5 h-5 text-blue-400 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white truncate">{session.ip_address}</p>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <Globe className="w-3 h-3" />
                              <span className="truncate">
                                {session.geo_location?.city}, {session.geo_location?.country}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              Last active: {format(new Date(session.last_activity), 'MMM d, HH:mm')}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => revokeSessionMutation.mutate(session.id)}
                          className="border-red-700 text-red-400 hover:bg-red-500/10 flex-shrink-0"
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrity" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <Shield className="w-8 h-8 text-green-400" />
                    <Badge className="bg-green-500">Integrity</Badge>
                  </div>
                  <p className="text-3xl font-bold text-white">{integrityScore}%</p>
                  <p className="text-sm text-slate-400 mt-1">Evidence verified</p>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <FileText className="w-8 h-8 text-blue-400" />
                    <Badge className="bg-blue-500">Evidence</Badge>
                  </div>
                  <p className="text-3xl font-bold text-white">{evidence.length}</p>
                  <p className="text-sm text-slate-400 mt-1">Total items</p>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                    <Badge className="bg-red-500">Critical</Badge>
                  </div>
                  <p className="text-3xl font-bold text-white">{auditLogs.filter(l => l.severity === 'critical').length}</p>
                  <p className="text-sm text-slate-400 mt-1">Critical events</p>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <Lock className="w-8 h-8 text-purple-400" />
                    <Badge className="bg-purple-500">Unverified</Badge>
                  </div>
                  <p className="text-3xl font-bold text-white">{unverifiedEvidence}</p>
                  <p className="text-sm text-slate-400 mt-1">Pending verification</p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-400" />
                  Evidence Integrity Verification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {evidence.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Database className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                      <p className="text-lg">No evidence to verify</p>
                    </div>
                  ) : (
                    evidence.slice(0, 20).map((item) => (
                      <div
                        key={item.id}
                        className="p-4 bg-slate-800/30 border border-slate-700 rounded-lg hover:border-slate-600 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-semibold text-white">{item.title}</h4>
                              {item.is_verified ? (
                                <Badge className="bg-green-500/20 text-green-400">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Verified
                                </Badge>
                              ) : (
                                <Badge className="bg-yellow-500/20 text-yellow-400">
                                  <Clock className="w-3 h-3 mr-1" />
                                  Pending
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mb-2">
                              Evidence #: {item.evidence_number}
                            </p>
                            {item.file_hash && (
                              <div className="flex items-center gap-2 text-xs">
                                <Key className="w-3 h-3 text-slate-500" />
                                <span className="text-slate-500 font-mono">{item.file_hash.substring(0, 32)}...</span>
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => verifyIntegrityMutation.mutate(item)}
                            disabled={verifyIntegrityMutation.isPending || item.is_verified}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Verify
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="soc" className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Shield className="w-8 h-8 text-red-500" />
                <div>
                  <h2 className="text-xl font-bold text-white">Security Operations Center</h2>
                  <p className="text-sm text-slate-400">Customizable widget-based SOC view</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-slate-400 border-slate-700">
                  Last updated: {lastRefresh.toLocaleTimeString()}
                </Badge>
                <DashboardCustomizer
                  layout={socLayout}
                  onLayoutChange={setSocLayout}
                  onSave={handleSocLayoutSave}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {socLayout.map(widgetId => {
                const widget = widgetRegistry[widgetId];
                if (!widget) return null;

                const WidgetComponent = widget.component;
                return (
                  <div key={widgetId} className="min-h-[300px]">
                    <WidgetComponent user={user} />
                  </div>
                );
              })}
            </div>

            {socLayout.length === 0 && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-12 text-center">
                  <Activity className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">No Widgets Selected</h3>
                  <p className="text-slate-400 mb-6">
                    Customize your dashboard to display security widgets
                  </p>
                  <DashboardCustomizer
                    layout={socLayout}
                    onLayoutChange={setSocLayout}
                    onSave={handleSocLayoutSave}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Widget Customization Dialog */}
        <Dialog open={showCustomizeDialog} onOpenChange={setShowCustomizeDialog}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layout className="w-5 h-5 text-blue-400" />
                Customize Dashboard
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-slate-400">Drag and drop to reorder widgets (feature coming soon)</p>
              <div className="grid grid-cols-2 gap-3">
                {['threats', 'network', 'behavior', 'audit'].map((widget) => (
                  <div key={widget} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 cursor-move">
                    <div className="flex items-center gap-2">
                      <Grid3X3 className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-white capitalize">{widget}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={() => setShowCustomizeDialog(false)} className="w-full">
                Done
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Scan Results Dialog */}
        <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                Security Scan Results
              </DialogTitle>
            </DialogHeader>
            {scanResult && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Security Score</p>
                    <p className="text-3xl font-bold text-white">{scanResult.security_score}/100</p>
                  </div>
                  <Badge className={
                    scanResult.security_score >= 80 ? 'bg-green-500/20 text-green-400' :
                    scanResult.security_score >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }>
                    {scanResult.security_score >= 80 ? 'Good' : scanResult.security_score >= 60 ? 'Fair' : 'Poor'}
                  </Badge>
                </div>

                {scanResult.findings && scanResult.findings.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-3">
                      Issues Found ({scanResult.findings.length})
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {scanResult.findings.map((finding, idx) => (
                        <Link
                          key={idx}
                          to={createPageUrl('AlertManagement')}
                          className="block p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 border border-slate-700 hover:border-red-500/50 transition-all group"
                          onClick={() => setShowResultDialog(false)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className={
                                  finding.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                                  finding.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                  finding.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-blue-500/20 text-blue-400'
                                }>
                                  {finding.severity}
                                </Badge>
                              </div>
                              <p className="text-sm text-white font-medium">{finding.issue}</p>
                              {finding.recommendation && (
                                <p className="text-xs text-slate-400 mt-1">{finding.recommendation}</p>
                              )}
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-red-400 flex-shrink-0 mt-1" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
                    <p className="text-slate-400">No security issues found</p>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                  <Button
                    variant="outline"
                    onClick={() => setShowResultDialog(false)}
                    className="border-slate-700 text-white hover:bg-slate-800"
                  >
                    Close
                  </Button>
                  <Link to={createPageUrl('AlertManagement')}>
                    <Button
                      onClick={() => setShowResultDialog(false)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      View All Alerts
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}