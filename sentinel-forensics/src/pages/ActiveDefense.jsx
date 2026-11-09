import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  AlertTriangle,
  Lock,
  Network,
  HardDrive,
  Eye,
  FileKey,
  Usb,
  Globe,
  ShieldCheck,
  Container,
  Settings,
  PlayCircle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp
} from "lucide-react";


import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

// Defensive privacy module definitions
const DEFENSE_MODULES = [
  { id: 'privacy_baseline', name: 'Privacy Posture Baseline', icon: Shield, color: 'blue' },
  { id: 'network_egress', name: 'Network Egress Watch', icon: Network, color: 'purple' },
  { id: 'persistence_watch', name: 'Persistence Watch', icon: HardDrive, color: 'green' },
  { id: 'permission_audit', name: 'Permission & Sensor Audit', icon: Eye, color: 'yellow' },
  { id: 'deception_tokens', name: 'Deception Tokens', icon: FileKey, color: 'pink' },
  { id: 'usb_guard', name: 'USB/Peripheral Guard', icon: Usb, color: 'orange' },
  { id: 'browser_hardening', name: 'Browser Hardening Validator', icon: Globe, color: 'cyan' },
  { id: 'firewall_validator', name: 'Firewall Rules Validator', icon: ShieldCheck, color: 'red' },
  { id: 'quarantine_workflow', name: 'Quarantine & Evidence Capture', icon: Container, color: 'indigo' },
  { id: 'containment_mode', name: 'Containment Mode Checklist', icon: Settings, color: 'slate' }
];

export default function ActiveDefense() {
  const [runningModules, setRunningModules] = useState(new Set());
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  // Fetch defense module runs
  const { data: moduleRuns = [] } = useQuery({
    queryKey: ['defense-runs'],
    queryFn: async () => {
      try {
        return await base44.entities.DefenseActionRun.list('-created_date', 50);
      } catch {
        return [];
      }
    },
    refetchInterval: 10000
  });

  // Fetch active alerts
  const { data: alerts = [] } = useQuery({
    queryKey: ['defense-alerts'],
    queryFn: async () => {
      try {
        return await base44.entities.Alert.filter(
          { status: 'new' },
          '-detection_timestamp',
          20
        );
      } catch {
        return [];
      }
    }
  });

  // Run a defense module
  const runModule = async (moduleId) => {
    setRunningModules(prev => new Set([...prev, moduleId]));
    
    try {
      await base44.entities.DefenseActionRun.create({
        module_id: moduleId,
        status: 'running',
        started_at: new Date().toISOString()
      });
      
      queryClient.invalidateQueries({ queryKey: ['defense-runs'] });
    } catch (error) {
      console.error('Failed to start module:', error);
    } finally {
      setTimeout(() => {
        setRunningModules(prev => {
          const next = new Set(prev);
          next.delete(moduleId);
          return next;
        });
      }, 3000);
    }
  };

  // Run all modules
  const runAllModules = async () => {
    for (const module of DEFENSE_MODULES) {
      await runModule(module.id);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const highAlerts = alerts.filter(a => a.severity === 'high');
  const recentRuns = moduleRuns.slice(0, 10);

  const getModuleColor = (color) => {
    const colors = {
      blue: 'border-blue-500/30 bg-blue-500/5',
      purple: 'border-purple-500/30 bg-purple-500/5',
      green: 'border-green-500/30 bg-green-500/5',
      yellow: 'border-yellow-500/30 bg-yellow-500/5',
      pink: 'border-pink-500/30 bg-pink-500/5',
      orange: 'border-orange-500/30 bg-orange-500/5',
      cyan: 'border-cyan-500/30 bg-cyan-500/5',
      red: 'border-red-500/30 bg-red-500/5',
      indigo: 'border-indigo-500/30 bg-indigo-500/5',
      slate: 'border-slate-500/30 bg-slate-500/5'
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-center">
            <Shield className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Active Defense</h1>
            <p className="text-slate-400">Privacy-preserving defensive security modules</p>
          </div>
        </div>
        <Button 
          onClick={runAllModules}
          disabled={runningModules.size > 0}
          className="bg-red-600 hover:bg-red-700"
        >
          <PlayCircle className="w-4 h-4 mr-2" />
          Run All Checks
        </Button>
      </div>

      {/* Alert Summary */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-[#0F0F10] border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Critical Alerts</p>
                <p className="text-2xl font-bold text-red-400">{criticalAlerts.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0F0F10] border-orange-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">High Priority</p>
                <p className="text-2xl font-bold text-orange-400">{highAlerts.length}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0F0F10] border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Recent Scans</p>
                <p className="text-2xl font-bold text-green-400">{recentRuns.length}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Defense Modules Grid */}
      <Card className="bg-[#0F0F10] border-[#1E1E1E]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-400" />
            Privacy Defense Modules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {DEFENSE_MODULES.map((module) => {
              const Icon = module.icon;
              const isRunning = runningModules.has(module.id);
              
              return (
                <Card 
                  key={module.id} 
                  className={`${getModuleColor(module.color)} border transition-all hover:border-${module.color}-500/50`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded-lg bg-${module.color}-500/10 flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 text-${module.color}-400`} />
                      </div>
                      {isRunning && (
                        <Badge className="bg-blue-500/20 text-blue-400 animate-pulse">
                          Running...
                        </Badge>
                      )}
                    </div>
                    
                    <h3 className="font-semibold text-white mb-2">{module.name}</h3>
                    
                    <Button
                      onClick={() => runModule(module.id)}
                      disabled={isRunning}
                      size="sm"
                      className="w-full bg-[#1A1A1A] hover:bg-[#252525] border border-slate-700"
                    >
                      {isRunning ? (
                        <>
                          <Clock className="w-4 h-4 mr-2 animate-spin" />
                          Running
                        </>
                      ) : (
                        <>
                          <PlayCircle className="w-4 h-4 mr-2" />
                          Run Check
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList className="bg-[#1A1A1A] border border-slate-800">
          <TabsTrigger value="runs" className="data-[state=active]:bg-[#252525]">
            Recent Scans
          </TabsTrigger>
          <TabsTrigger value="alerts" className="data-[state=active]:bg-[#252525]">
            Active Alerts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runs">
          <Card className="bg-[#0F0F10] border-[#1E1E1E]">
            <CardHeader>
              <CardTitle className="text-white">Recent Module Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentRuns.length === 0 ? (
                  <div className="text-center py-12">
                    <Shield className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                    <p className="text-slate-400">No module runs yet</p>
                  </div>
                ) : (
                  recentRuns.map((run) => (
                    <div key={run.id} className="bg-[#1A1A1A] border border-slate-800 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-white">{run.module_id}</h4>
                          <p className="text-xs text-slate-400">
                            {new Date(run.created_date).toLocaleString()}
                          </p>
                        </div>
                        <Badge className={
                          run.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                          run.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                          'bg-blue-500/20 text-blue-400'
                        }>
                          {run.status}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card className="bg-[#0F0F10] border-[#1E1E1E]">
            <CardHeader>
              <CardTitle className="text-white">Active Security Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {alerts.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
                    <p className="text-slate-400">No active alerts</p>
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div 
                      key={alert.id} 
                      className="bg-[#1A1A1A] border border-slate-800 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-white">{alert.title}</h4>
                          <p className="text-sm text-slate-300">{alert.description}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {new Date(alert.detection_timestamp).toLocaleString()}
                          </p>
                        </div>
                        <Badge className={
                          alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                          alert.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                          alert.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/20 text-blue-400'
                        }>
                          {alert.severity.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}