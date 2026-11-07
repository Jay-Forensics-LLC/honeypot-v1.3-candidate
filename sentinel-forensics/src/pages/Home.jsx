import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, ArrowRight, Zap, Database, Network, FileText, LayoutDashboard, ClipboardCheck, Clock, Pin, Search } from "lucide-react";
import { createPageUrl } from "../components/utils";
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import CommandPalette from '../components/navigation/CommandPalette';

export default function Home() {
  const navigate = useNavigate();
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);

  // Global keyboard shortcut
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['home-nav-summary'],
    queryFn: async () => {
      const result = await base44.functions.invoke('homeNavSummary', { limitRecents: 10 });
      return result.data;
    },
    refetchInterval: 60000
  });

  const { data: shortcuts } = useQuery({
    queryKey: ['user-shortcuts'],
    queryFn: async () => {
      const result = await base44.functions.invoke('shortcutManage', { action: 'list' });
      return result.data;
    }
  });

  const quickActions = [
    { name: "Dashboard", page: "Dashboard", icon: Shield, description: "View security overview" },
    { name: "Cases", page: "Cases", icon: FileText, description: "Manage investigations" },
    { name: "Evidence", page: "Evidence", icon: Database, description: "Evidence repository" },
    { name: "Devices", page: "Devices", icon: Network, description: "Device monitoring" },
  ];

  return (
    <div className="w-full min-h-screen bg-[#0B0B0C] p-6 pb-24">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4 pt-12">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Shield className="w-16 h-16 text-red-500" />
          </div>
          <h1 className="text-5xl font-bold text-white">Sentinel Forensics</h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Advanced Digital Forensics & Surveillance Detection Platform
          </p>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12">
          {quickActions.map((action) => (
            <Card
              key={action.page}
              className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 transition-all cursor-pointer"
              onClick={() => navigate(createPageUrl(action.page))}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-white">
                  <action.icon className="w-6 h-6 text-red-500" />
                  {action.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-400 mb-4">{action.description}</p>
                <Button className="w-full bg-red-600 hover:bg-red-700">
                  Open <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pinned Shortcuts */}
        {shortcuts?.shortcuts?.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <Pin className="w-5 h-5 text-red-500" />
              <h2 className="text-xl font-bold text-white">Pinned</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {shortcuts.shortcuts.slice(0, 6).map(shortcut => (
                <Card 
                  key={shortcut.id}
                  className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer"
                  onClick={() => {
                    if (shortcut.target_type === 'page') {
                      navigate(createPageUrl(shortcut.target_value));
                    } else if (shortcut.target_type === 'dashboard') {
                      navigate(createPageUrl('CustomDashboard') + `?layoutId=${shortcut.target_value}`);
                    }
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Pin className="w-4 h-4 text-red-500" />
                      <span className="text-white text-sm">{shortcut.label}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Dashboards Section */}
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <LayoutDashboard className="w-5 h-5 text-red-500" />
            <h2 className="text-xl font-bold text-white">Dashboards</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card 
              className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer"
              onClick={() => navigate(createPageUrl('DashboardsHub'))}
            >
              <CardContent className="p-4">
                <LayoutDashboard className="w-6 h-6 text-red-500 mb-2" />
                <h3 className="text-white font-semibold">Dashboards Hub</h3>
                <p className="text-slate-400 text-sm">Browse all dashboards</p>
              </CardContent>
            </Card>
            
            <Card 
              className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer"
              onClick={() => navigate(createPageUrl('CustomDashboard'))}
            >
              <CardContent className="p-4">
                <Shield className="w-6 h-6 text-red-500 mb-2" />
                <h3 className="text-white font-semibold">Default Dashboard</h3>
                <p className="text-slate-400 text-sm">Quick access</p>
              </CardContent>
            </Card>

            {data?.dashboards?.recentLayouts?.slice(0, 2).map(layout => (
              <Card 
                key={layout.id}
                className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer"
                onClick={() => navigate(createPageUrl('CustomDashboard') + `?layoutId=${layout.id}`)}
              >
                <CardContent className="p-4">
                  <LayoutDashboard className="w-6 h-6 text-slate-400 mb-2" />
                  <h3 className="text-white font-semibold truncate">{layout.name}</h3>
                  <p className="text-slate-400 text-sm">Recent layout</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Review Queues Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-red-500" />
              <h2 className="text-xl font-bold text-white">Review Queues</h2>
            </div>
            <Button variant="outline" onClick={() => navigate(createPageUrl('ReviewHub'))}>
              View All
            </Button>
          </div>
          
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-24 bg-slate-800/50 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card 
                className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer transition-all"
                onClick={() => navigate(createPageUrl('Dashboard') + '?severity=critical&status=open')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">Critical Alerts</span>
                    {data?.reviewQueues?.criticalAlertsCount > 0 ? (
                      <Badge className="bg-red-600 animate-pulse">
                        {data.reviewQueues.criticalAlertsCount}
                      </Badge>
                    ) : (
                      <Badge className="bg-green-600">All clear</Badge>
                    )}
                  </div>
                  <p className="text-white font-semibold mb-3">High severity alerts</p>
                  <Button size="sm" className="w-full bg-red-600 hover:bg-red-700">
                    {data?.reviewQueues?.criticalAlertsCount > 0 ? 'Review Now' : 'Validate'}
                  </Button>
                </CardContent>
              </Card>

              <Card 
                className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer transition-all"
                onClick={() => navigate(createPageUrl('Evidence') + '?status=pending_review')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">Evidence Pending</span>
                    {data?.reviewQueues?.evidencePendingReviewCount > 0 ? (
                      <Badge className="bg-orange-600">
                        {data.reviewQueues.evidencePendingReviewCount}
                      </Badge>
                    ) : (
                      <Badge className="bg-green-600">All clear</Badge>
                    )}
                  </div>
                  <p className="text-white font-semibold mb-3">Awaiting review</p>
                  <Button size="sm" className="w-full bg-red-600 hover:bg-red-700">
                    {data?.reviewQueues?.evidencePendingReviewCount > 0 ? 'Review Now' : 'Open Evidence'}
                  </Button>
                </CardContent>
              </Card>

              <Card 
                className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer transition-all"
                onClick={() => navigate(createPageUrl('PolicyComplianceDashboard') + '?compliance=noncompliant')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">Compliance</span>
                    {data?.reviewQueues?.complianceExceptionsCount > 0 ? (
                      <Badge className="bg-yellow-600">
                        {data.reviewQueues.complianceExceptionsCount}
                      </Badge>
                    ) : (
                      <Badge className="bg-green-600">All clear</Badge>
                    )}
                  </div>
                  <p className="text-white font-semibold mb-3">Policy exceptions</p>
                  <Button size="sm" className="w-full bg-red-600 hover:bg-red-700">
                    {data?.reviewQueues?.complianceExceptionsCount > 0 ? 'Review Now' : 'View Compliance'}
                  </Button>
                </CardContent>
              </Card>

              <Card 
                className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer transition-all"
                onClick={() => navigate(createPageUrl('RemediationSuite') + '?status=quarantined')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">Quarantine</span>
                    {data?.reviewQueues?.quarantineItemsCount > 0 ? (
                      <Badge className="bg-purple-600">
                        {data.reviewQueues.quarantineItemsCount}
                      </Badge>
                    ) : (
                      <Badge className="bg-green-600">All clear</Badge>
                    )}
                  </div>
                  <p className="text-white font-semibold mb-3">Isolated threats</p>
                  <Button size="sm" className="w-full bg-red-600 hover:bg-red-700">
                    {data?.reviewQueues?.quarantineItemsCount > 0 ? 'Review Now' : 'View Quarantine'}
                  </Button>
                </CardContent>
              </Card>

              <Card 
                className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer transition-all"
                onClick={() => navigate(createPageUrl('Devices') + '?risk=high')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">Risky Devices</span>
                    {data?.reviewQueues?.riskyDevicesCount > 0 ? (
                      <Badge className="bg-red-600">
                        {data.reviewQueues.riskyDevicesCount}
                      </Badge>
                    ) : (
                      <Badge className="bg-green-600">All clear</Badge>
                    )}
                  </div>
                  <p className="text-white font-semibold mb-3">High risk scores</p>
                  <Button size="sm" className="w-full bg-red-600 hover:bg-red-700">
                    {data?.reviewQueues?.riskyDevicesCount > 0 ? 'Review Now' : 'View Devices'}
                  </Button>
                </CardContent>
              </Card>

              <Card 
                className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer transition-all"
                onClick={() => navigate(createPageUrl('Dashboard') + '?status=open&triaged=false')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">Untriaged</span>
                    {data?.reviewQueues?.untriagedAlertsCount > 0 ? (
                      <Badge className="bg-orange-600">
                        {data.reviewQueues.untriagedAlertsCount}
                      </Badge>
                    ) : (
                      <Badge className="bg-green-600">All clear</Badge>
                    )}
                  </div>
                  <p className="text-white font-semibold mb-3">Needs triage</p>
                  <Button size="sm" className="w-full bg-red-600 hover:bg-red-700">
                    {data?.reviewQueues?.untriagedAlertsCount > 0 ? 'Triage Now' : 'View Alerts'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Telemetry Health Section */}
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-red-500" />
            <h2 className="text-xl font-bold text-white">Telemetry Health</h2>
          </div>
          
          {isLoading ? (
            <div className="h-32 bg-slate-800/50 rounded animate-pulse" />
          ) : (
            <Card className={`border-2 ${
              data?.telemetry?.dataFreshness === 'healthy' ? 'border-green-500/30 bg-green-950/20' :
              data?.telemetry?.dataFreshness === 'stale' ? 'border-yellow-500/30 bg-yellow-950/20' :
              'border-slate-700 bg-slate-900/50'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      data?.telemetry?.dataFreshness === 'healthy' ? 'bg-green-500' :
                      data?.telemetry?.dataFreshness === 'stale' ? 'bg-yellow-500 animate-pulse' :
                      'bg-gray-500'
                    }`} />
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        Data Freshness: {data?.telemetry?.dataFreshness === 'healthy' ? 'Healthy' :
                                         data?.telemetry?.dataFreshness === 'stale' ? 'Stale' : 'Unknown'}
                      </h3>
                      {data?.telemetry?.dataFreshness !== 'healthy' && (
                        <p className="text-sm text-yellow-400 mt-1">
                          ⚠️ Quiet can mean clean—or broken telemetry. Validate your ingest pipeline.
                        </p>
                      )}
                    </div>
                  </div>
                  <Button onClick={() => navigate(createPageUrl('ReviewHub'))} className="bg-red-600 hover:bg-red-700">
                    Validate Telemetry
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-slate-400">Last Alert</div>
                    <div className="text-white font-medium">
                      {data?.telemetry?.lastAlertIngestAt 
                        ? new Date(data.telemetry.lastAlertIngestAt).toLocaleString()
                        : 'No data'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Last Evidence</div>
                    <div className="text-white font-medium">
                      {data?.telemetry?.lastEvidenceUploadAt 
                        ? new Date(data.telemetry.lastEvidenceUploadAt).toLocaleString()
                        : 'No data'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Last Intel Ingest</div>
                    <div className="text-white font-medium">
                      {data?.telemetry?.lastThreatIntelIngestAt 
                        ? new Date(data.telemetry.lastThreatIntelIngestAt).toLocaleString()
                        : 'No data'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Last Agent Heartbeat</div>
                    <div className="text-white font-medium">
                      {data?.telemetry?.lastAgentHeartbeatAt 
                        ? new Date(data.telemetry.lastAgentHeartbeatAt).toLocaleString()
                        : 'No data'}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => navigate(createPageUrl('AuditLog'))}
                  >
                    View Ingestion Logs
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => navigate(createPageUrl('Devices') + '?status=offline')}
                  >
                    Agent Status
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Work / Suggested Next Steps Section */}
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-red-500" />
            <h2 className="text-xl font-bold text-white">
              {data?.recents?.length > 0 ? 'Recent Work' : 'Suggested Next Steps'}
            </h2>
          </div>
          
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
              ))}
            </div>
          ) : data?.recents?.length > 0 ? (
            <div className="space-y-2">
              {data.recents.slice(0, 10).map((item, idx) => (
                <Card 
                  key={`${item.type}-${item.id}-${idx}`}
                  className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer transition-all"
                  onClick={() => {
                    const route = item.type === 'case' ? 'CaseDetail' :
                                  item.type === 'evidence' ? 'EvidenceDetail' :
                                  item.type === 'device' ? 'DeviceDetail' : 'Dashboard';
                    navigate(createPageUrl(route) + (item.id ? `/${item.id}` : ''));
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {item.type === 'case' && <FileText className="w-5 h-5 text-red-500" />}
                        {item.type === 'evidence' && <Database className="w-5 h-5 text-blue-500" />}
                        {item.type === 'device' && <Network className="w-5 h-5 text-green-500" />}
                        {item.type === 'dashboard' && <LayoutDashboard className="w-5 h-5 text-purple-500" />}
                        <div>
                          <div className="text-white font-medium">{item.title}</div>
                          {item.subtitle && <div className="text-slate-400 text-sm">{item.subtitle}</div>}
                        </div>
                      </div>
                      <div className="text-slate-400 text-sm">
                        {new Date(item.updated_date).toLocaleDateString()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card 
                className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer transition-all"
                onClick={() => navigate(createPageUrl('SecurityValidator'))}
              >
                <CardContent className="p-6">
                  <Shield className="w-8 h-8 text-red-500 mb-3" />
                  <h3 className="text-white font-semibold mb-2">Run Security Self-Scan</h3>
                  <p className="text-slate-400 text-sm">
                    Validate system security posture and identify gaps
                  </p>
                </CardContent>
              </Card>

              <Card 
                className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer transition-all"
                onClick={() => navigate(createPageUrl('MobileEnrollment'))}
              >
                <CardContent className="p-6">
                  <Network className="w-8 h-8 text-green-500 mb-3" />
                  <h3 className="text-white font-semibold mb-2">Enroll a Device</h3>
                  <p className="text-slate-400 text-sm">
                    Add mobile devices or install security agents
                  </p>
                </CardContent>
              </Card>

              <Card 
                className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer transition-all"
                onClick={() => navigate(createPageUrl('Cases'))}
              >
                <CardContent className="p-6">
                  <FileText className="w-8 h-8 text-blue-500 mb-3" />
                  <h3 className="text-white font-semibold mb-2">Create a Case</h3>
                  <p className="text-slate-400 text-sm">
                    Start a new forensic investigation
                  </p>
                </CardContent>
              </Card>

              <Card 
                className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 cursor-pointer transition-all"
                onClick={() => navigate(createPageUrl('Evidence'))}
              >
                <CardContent className="p-6">
                  <Database className="w-8 h-8 text-purple-500 mb-3" />
                  <h3 className="text-white font-semibold mb-2">Upload Evidence</h3>
                  <p className="text-slate-400 text-sm">
                    Secure and catalog forensic artifacts
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Quick Jump Banner */}
        <Card className="bg-gradient-to-r from-red-950/20 to-slate-900/50 border-red-500/30 mt-8">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-4">
                <Search className="w-10 h-10 text-red-500 shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">
                    Quick Jump
                  </h3>
                  <p className="text-slate-300">
                    Press <kbd className="px-2 py-1 bg-slate-800 rounded text-sm">Ctrl/Cmd + K</kbd> to search pages, recent items, and dashboards
                  </p>
                </div>
              </div>
              <Button onClick={() => setCommandPaletteOpen(true)} className="bg-red-600 hover:bg-red-700">
                Open
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
    </div>
  );
}