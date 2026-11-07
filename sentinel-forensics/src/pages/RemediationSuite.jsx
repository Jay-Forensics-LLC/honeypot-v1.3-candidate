
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  ShieldCheck,
  Trash2,
  Camera,
  Download,
  Loader2,
  Clock,
  Zap,
  Activity
} from 'lucide-react';
import ScannerEngine from '../components/remediation/ScannerEngine';
import QuarantineManager from '../components/remediation/QuarantineManager';
import SnapshotManager from '../components/remediation/SnapshotManager';
import RemediationWizard from '../components/remediation/RemediationWizard';
import PersistenceRemoval from '../components/remediation/PersistenceRemoval';
import ForensicExporter from '../components/remediation/ForensicExporter';

/**
 * SENTINEL REMEDIATION SUITE
 * Multi-engine malware detection, quarantine, and atomic rollback system
 * 
 * Features:
 * - Multi-engine scanning (Signature + Heuristic + YARA + Behavioral)
 * - Atomic snapshots (VSS, APFS, LVM)
 * - Safe quarantine with AES-256 encryption
 * - Reversible remediation
 * - Forensic export bundles (PDF + CSV + signed manifests)
 * - Cross-platform (Windows, macOS, Linux, iOS guidance, Android ADB)
 */
export default function RemediationSuite() {
  const [activeTab, setActiveTab] = useState('scanner');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
    staleTime: 300000
  });

  // Get latest scan
  const { data: recentScans = [] } = useQuery({
    queryKey: ['remediation-scans'],
    queryFn: async () => {
      try {
        return await base44.entities.RemediationScan.filter({}, '-started_at', 10);
      } catch (error) {
        console.warn('Failed to load scans:', error);
        return [];
      }
    },
    staleTime: 10000,  // Reduced from 30s for better real-time updates
    refetchInterval: 5000  // Poll every 5s for active scans (was 10s)
  });

  // Get quarantine items
  const { data: quarantineItems = [] } = useQuery({
    queryKey: ['quarantine-items'],
    queryFn: async () => {
      try {
        return await base44.entities.QuarantineItem.filter({}, '-quarantined_at', 50);
      } catch (error) {
        console.warn('Failed to load quarantine:', error);
        return [];
      }
    },
    staleTime: 30000
  });

  // Get snapshots
  const { data: snapshots = [] } = useQuery({
    queryKey: ['system-snapshots'],
    queryFn: async () => {
      try {
        return await base44.entities.SystemSnapshot.filter({}, '-created_at', 20);
      } catch (error) {
        console.warn('Failed to load snapshots:', error);
        return [];
      }
    },
    staleTime: 60000
  });

  const latestScan = recentScans[0];
  const activeScan = recentScans.find(s => s.status === 'scanning' || s.status === 'analyzing');

  // Statistics
  const stats = {
    totalThreats: quarantineItems.filter(q => q.status === 'quarantined').length,
    criticalThreats: quarantineItems.filter(q => q.severity === 'critical' && q.status === 'quarantined').length,
    snapshotsAvailable: snapshots.filter(s => !s.expires_at || new Date(s.expires_at) > new Date()).length,
    lastScanTime: latestScan?.completed_at || null,
    systemRisk: latestScan?.risk_score || 0
  };

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-red-600 to-orange-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xl shadow-red-500/20">
            <ShieldCheck className="w-6 h-6 md:w-8 md:h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
              Remediation & Repair Suite
            </h1>
            <p className="text-sm md:text-base text-slate-400">
              Multi-engine malware detection, safe removal, and atomic rollback
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Badge className="bg-green-500/20 text-green-400 text-xs">
                Forensically Compliant
              </Badge>
              <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                Reversible Operations
              </Badge>
              <Badge className="bg-purple-500/20 text-purple-400 text-xs animate-pulse">
                🚀 Real API Scanning
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      <Card className="bg-yellow-900/20 border-yellow-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200">
              <p className="font-semibold mb-1">Safety First: Atomic Operations</p>
              <p className="text-yellow-300/80">
                All remediation operations create automatic snapshots before execution. 
                Every change is reversible via rollback tokens. Critical system files are never modified without verification.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Status Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="text-center">
              <div className={`text-3xl font-bold mb-1 ${
                stats.systemRisk >= 70 ? 'text-red-400' :
                stats.systemRisk >= 40 ? 'text-yellow-400' :
                'text-green-400'
              }`}>
                {stats.systemRisk}
              </div>
              <p className="text-xs text-slate-400">System Risk</p>
              <Progress 
                value={stats.systemRisk} 
                className={`h-1 mt-2 ${
                  stats.systemRisk >= 70 ? '[&>div]:bg-red-500' :
                  stats.systemRisk >= 40 ? '[&>div]:bg-yellow-500' :
                  '[&>div]:bg-green-500'
                }`}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="text-center">
              <Trash2 className="w-6 h-6 text-red-400 mx-auto mb-1" />
              <div className="text-2xl font-bold text-white">{stats.totalThreats}</div>
              <p className="text-xs text-slate-400">Quarantined</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="text-center">
              <AlertTriangle className="w-6 h-6 text-orange-400 mx-auto mb-1" />
              <div className="text-2xl font-bold text-white">{stats.criticalThreats}</div>
              <p className="text-xs text-slate-400">Critical</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="text-center">
              <Camera className="w-6 h-6 text-blue-400 mx-auto mb-1" />
              <div className="text-2xl font-bold text-white">{stats.snapshotsAvailable}</div>
              <p className="text-xs text-slate-400">Snapshots</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="text-center">
              <Clock className="w-6 h-6 text-purple-400 mx-auto mb-1" />
              <div className="text-xs font-bold text-white truncate">
                {stats.lastScanTime 
                  ? new Date(stats.lastScanTime).toLocaleTimeString()
                  : 'Never'
                }
              </div>
              <p className="text-xs text-slate-400">Last Scan</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Scan Progress */}
      {activeScan && (
        <Card className="bg-blue-900/20 border-blue-500/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                <div>
                  <p className="font-semibold text-white">Scan in Progress</p>
                  <p className="text-sm text-blue-300">{activeScan.current_operation || 'Scanning...'}</p>
                </div>
              </div>
              <Badge className="bg-blue-500 text-white animate-pulse">
                {activeScan.progress_percentage}%
              </Badge>
            </div>
            <Progress value={activeScan.progress_percentage || 0} className="h-2" />
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mt-4 text-xs">
              <div>
                <p className="text-slate-400">Files</p>
                <p className="text-white font-mono">{activeScan.statistics?.files_scanned || 0}</p>
              </div>
              <div>
                <p className="text-slate-400">Services</p>
                <p className="text-white font-mono">{activeScan.statistics?.services_checked || 0}</p>
              </div>
              <div>
                <p className="text-slate-400">Tasks</p>
                <p className="text-white font-mono">{activeScan.statistics?.tasks_checked || 0}</p>
              </div>
              <div>
                <p className="text-slate-400">Threats</p>
                <p className="text-red-400 font-mono">{activeScan.statistics?.threats_found || 0}</p>
              </div>
              <div>
                <p className="text-slate-400">Suspicious</p>
                <p className="text-yellow-400 font-mono">{activeScan.statistics?.suspicious_items || 0}</p>
              </div>
              <div>
                <p className="text-slate-400">Safe</p>
                <p className="text-green-400 font-mono">{activeScan.statistics?.safe_items || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 bg-slate-900/50 p-1">
          <TabsTrigger value="scanner" className="data-[state=active]:bg-blue-600 min-h-[44px]">
            <Activity className="w-4 h-4 mr-2" />
            <span className="hidden md:inline">Scanner</span>
          </TabsTrigger>
          <TabsTrigger value="quarantine" className="data-[state=active]:bg-orange-600 min-h-[44px]">
            <Trash2 className="w-4 h-4 mr-2" />
            <span className="hidden md:inline">Quarantine</span>
          </TabsTrigger>
          <TabsTrigger value="persistence" className="data-[state=active]:bg-purple-600 min-h-[44px]">
            <Zap className="w-4 h-4 mr-2" />
            <span className="hidden md:inline">Persistence</span>
          </TabsTrigger>
          <TabsTrigger value="snapshots" className="data-[state=active]:bg-green-600 min-h-[44px]">
            <Camera className="w-4 h-4 mr-2" />
            <span className="hidden md:inline">Snapshots</span>
          </TabsTrigger>
          <TabsTrigger value="remediate" className="data-[state=active]:bg-red-600 min-h-[44px]">
            <ShieldCheck className="w-4 h-4 mr-2" />
            <span className="hidden md:inline">Remediate</span>
          </TabsTrigger>
          <TabsTrigger value="export" className="data-[state=active]:bg-indigo-600 min-h-[44px]">
            <Download className="w-4 h-4 mr-2" />
            <span className="hidden md:inline">Export</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scanner" className="space-y-6">
          <ScannerEngine user={user} />
        </TabsContent>

        <TabsContent value="quarantine" className="space-y-6">
          <QuarantineManager quarantineItems={quarantineItems} />
        </TabsContent>

        <TabsContent value="persistence" className="space-y-6">
          <PersistenceRemoval />
        </TabsContent>

        <TabsContent value="snapshots" className="space-y-6">
          <SnapshotManager snapshots={snapshots} />
        </TabsContent>

        <TabsContent value="remediate" className="space-y-6">
          <RemediationWizard latestScan={latestScan} />
        </TabsContent>

        <TabsContent value="export" className="space-y-6">
          <ForensicExporter />
        </TabsContent>
      </Tabs>
    </div>
  );
}
