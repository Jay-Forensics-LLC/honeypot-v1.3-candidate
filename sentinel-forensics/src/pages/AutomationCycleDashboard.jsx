import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Play,
  Pause,
  CheckCircle,
  TrendingUp,
  Clock,
  Shield,
  Activity,
  Loader2,
  BarChart3,
  Target,
  Rocket
} from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '../components/utils/formatters';

const CURRENT_VERSION = '1.0.0';
const CYCLE_INTERVAL_DAYS = 5;

export default function AutomationCycleDashboard() {
  const queryClient = useQueryClient();
  const [isStarting, setIsStarting] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: currentCycle } = useQuery({
    queryKey: ['current-cycle'],
    queryFn: async () => {
      const cycles = await base44.entities.AutomationCycle.filter(
        { status: 'active' },
        '-started_at',
        1
      );
      return cycles[0] || null;
    },
    enabled: !!user && user.role === 'admin',
    refetchInterval: 30000
  });

  const { data: completedCycles = [] } = useQuery({
    queryKey: ['completed-cycles'],
    queryFn: async () => {
      return await base44.entities.AutomationCycle.filter(
        { status: 'completed' },
        '-completed_at',
        10
      );
    },
    enabled: !!user && user.role === 'admin'
  });

  const { data: efficiencyMetrics = [] } = useQuery({
    queryKey: ['efficiency-metrics'],
    queryFn: async () => {
      return await base44.entities.EfficiencyMetric.list('-measured_at', 20);
    },
    enabled: !!user && user.role === 'admin'
  });

  const startCycleMutation = useMutation({
    mutationFn: async () => {
      setIsStarting(true);
      
      const nextCycleNumber = completedCycles.length + 1;
      const versionParts = CURRENT_VERSION.split('.');
      versionParts[2] = parseInt(versionParts[2]) + 1;
      const nextVersion = versionParts.join('.');

      const cycle = await base44.entities.AutomationCycle.create({
        cycle_number: nextCycleNumber,
        version: nextVersion,
        phase: 'rush',
        started_at: new Date().toISOString(),
        status: 'active',
        rush_phase: {
          features_built: [],
          enhancements_identified: [],
          operable_features: 0,
          needs_optimization: 0
        },
        efficiency_metrics: {
          avg_api_response_ms: 0,
          avg_page_load_ms: 0,
          bundle_size_kb: 420,
          cache_hit_rate: 0,
          automation_success_rate: 0,
          error_rate: 0,
          improvement_vs_last_cycle: 0
        },
        integrity_check: {
          operable: false,
          monetization_hooks: false,
          security_validated: false,
          efficiency_improved: false,
          passed: false,
          failures: []
        }
      });

      // Create audit log
      await base44.entities.AuditLog.create({
        event_type: 'automation_cycle_started',
        severity: 'info',
        description: `Automation Cycle ${nextCycleNumber} started - RUSH phase`,
        user_id: user?.email || 'system',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          cycle_number: nextCycleNumber,
          version: nextVersion,
          phase: 'rush'
        }
      });

      return cycle;
    },
    onSuccess: () => {
      setIsStarting(false);
      queryClient.invalidateQueries({ queryKey: ['current-cycle'] });
      toast.success('🚀 Automation Cycle Started', {
        description: 'RUSH phase active - Building core functionality',
        duration: 5000
      });
    },
    onError: (error) => {
      setIsStarting(false);
      toast.error('Failed to start cycle: ' + error.message);
    }
  });

  const advancePhaseMutation = useMutation({
    mutationFn: async (nextPhase) => {
      if (!currentCycle) throw new Error('No active cycle');

      const updates = {
        phase: nextPhase
      };

      if (nextPhase === 'polish') {
        updates.rush_phase = {
          ...currentCycle.rush_phase,
          completed_at: new Date().toISOString()
        };
      } else if (nextPhase === 'finalize') {
        updates.polish_phase = {
          ...currentCycle.polish_phase,
          completed_at: new Date().toISOString()
        };
      } else if (nextPhase === 'complete') {
        updates.finalize_phase = {
          ...currentCycle.finalize_phase,
          completed_at: new Date().toISOString()
        };
        updates.status = 'completed';
        updates.completed_at = new Date().toISOString();
        
        // Calculate duration
        const start = new Date(currentCycle.started_at);
        const end = new Date();
        updates.duration_hours = (end - start) / (1000 * 60 * 60);
        
        // Schedule next cycle (5 days)
        const nextCycleDate = new Date();
        nextCycleDate.setDate(nextCycleDate.getDate() + CYCLE_INTERVAL_DAYS);
        updates.next_cycle_scheduled = nextCycleDate.toISOString();
      }

      await base44.entities.AutomationCycle.update(currentCycle.id, updates);

      await base44.entities.AuditLog.create({
        event_type: 'automation_phase_advanced',
        severity: 'info',
        description: `Cycle ${currentCycle.cycle_number} advanced to ${nextPhase} phase`,
        user_id: user?.email || 'system',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          cycle_number: currentCycle.cycle_number,
          previous_phase: currentCycle.phase,
          new_phase: nextPhase
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-cycle'] });
      queryClient.invalidateQueries({ queryKey: ['completed-cycles'] });
      toast.success('Phase Advanced!', {
        description: 'Moving to next phase of automation cycle'
      });
    }
  });

  const recordEfficiencyMetricMutation = useMutation({
    mutationFn: async (metric) => {
      return await base44.entities.EfficiencyMetric.create({
        ...metric,
        cycle_number: currentCycle?.cycle_number || 0,
        measured_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['efficiency-metrics'] });
      toast.success('Metric Recorded');
    }
  });

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <Alert className="bg-red-500/10 border-red-500/30 max-w-2xl mx-auto mt-12">
          <Shield className="h-5 w-5 text-red-400" />
          <AlertDescription className="text-red-300">
            <strong>Admin Access Required</strong>
            <p className="mt-1">Automation cycle management is restricted to administrators.</p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const getPhaseColor = (phase) => {
    const colors = {
      rush: 'bg-blue-500/20 text-blue-400',
      polish: 'bg-purple-500/20 text-purple-400',
      finalize: 'bg-green-500/20 text-green-400',
      complete: 'bg-gray-500/20 text-gray-400'
    };
    return colors[phase] || colors.rush;
  };

  const getPhaseProgress = (phase) => {
    const progress = {
      rush: 25,
      polish: 50,
      finalize: 75,
      complete: 100
    };
    return progress[phase] || 0;
  };

  const avgImprovement = efficiencyMetrics.length > 0
    ? efficiencyMetrics.reduce((sum, m) => sum + (m.improvement_percent || 0), 0) / efficiencyMetrics.length
    : 0;

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              🔄 Automation Cycle Dashboard
            </h1>
            <p className="text-slate-400">
              Rush → Polish → Finalize → Repeat (5-day cycles)
            </p>
          </div>
          {!currentCycle && (
            <Button
              onClick={() => startCycleMutation.mutate()}
              disabled={isStarting}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 min-h-[44px]"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Start New Cycle
                </>
              )}
            </Button>
          )}
        </div>

        {/* Current Cycle Status */}
        {currentCycle ? (
          <>
            <Card className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-blue-500/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                      Cycle #{currentCycle.cycle_number} - v{currentCycle.version}
                    </h2>
                    <p className="text-blue-200">
                      Started {formatRelativeTime(currentCycle.started_at)}
                    </p>
                  </div>
                  <Badge className={`${getPhaseColor(currentCycle.phase)} text-lg px-4 py-2`}>
                    {currentCycle.phase.toUpperCase()} PHASE
                  </Badge>
                </div>

                <Progress value={getPhaseProgress(currentCycle.phase)} className="h-3 mb-2" />
                <p className="text-sm text-blue-300">{getPhaseProgress(currentCycle.phase)}% Complete</p>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                  <Button
                    onClick={() => advancePhaseMutation.mutate('polish')}
                    disabled={currentCycle.phase !== 'rush'}
                    className="bg-purple-600 hover:bg-purple-700 min-h-[44px]"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Polish
                  </Button>
                  <Button
                    onClick={() => advancePhaseMutation.mutate('finalize')}
                    disabled={currentCycle.phase !== 'polish'}
                    className="bg-green-600 hover:bg-green-700 min-h-[44px]"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Finalize
                  </Button>
                  <Button
                    onClick={() => advancePhaseMutation.mutate('complete')}
                    disabled={currentCycle.phase !== 'finalize'}
                    className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Complete Cycle
                  </Button>
                  <Button
                    onClick={() => {
                      // Pause current cycle
                      base44.entities.AutomationCycle.update(currentCycle.id, {
                        status: 'paused'
                      });
                      queryClient.invalidateQueries({ queryKey: ['current-cycle'] });
                      toast.info('Cycle paused');
                    }}
                    variant="outline"
                    className="border-yellow-500/50 text-yellow-400 min-h-[44px]"
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Pause
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Phase Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Rocket className="w-5 h-5 text-blue-400" />
                    RUSH Phase
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Features Built</span>
                      <span className="text-white font-bold">
                        {currentCycle.rush_phase?.features_built?.length || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Enhancements ID'd</span>
                      <span className="text-white font-bold">
                        {currentCycle.rush_phase?.enhancements_identified?.length || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Operable</span>
                      <span className="text-green-400 font-bold">
                        {currentCycle.rush_phase?.operable_features || 0}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Shield className="w-5 h-5 text-purple-400" />
                    POLISH Phase
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Bugs Fixed</span>
                      <span className="text-white font-bold">
                        {currentCycle.polish_phase?.bugs_fixed || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Security Patches</span>
                      <span className="text-white font-bold">
                        {currentCycle.polish_phase?.security_patches || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Enhancements</span>
                      <span className="text-purple-400 font-bold">
                        {currentCycle.polish_phase?.efficiency_enhancements?.length || 0}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    FINALIZE Phase
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Monetization</span>
                      {currentCycle.finalize_phase?.monetization_ready ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <Clock className="w-4 h-4 text-yellow-400" />
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Stability</span>
                      <span className="text-white font-bold">
                        {currentCycle.finalize_phase?.stability_rating || 0}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Build Snapshot</span>
                      {currentCycle.finalize_phase?.build_snapshot_hash ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <Clock className="w-4 h-4 text-yellow-400" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <Rocket className="w-20 h-20 mx-auto mb-4 text-slate-600" />
              <h3 className="text-xl font-bold text-white mb-2">No Active Cycle</h3>
              <p className="text-slate-400 mb-6">
                Start a new automation cycle to begin continuous improvement
              </p>
              <Button
                onClick={() => startCycleMutation.mutate()}
                disabled={isStarting}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 min-h-[44px]"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Initializing...
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4 mr-2" />
                    Start Cycle #{completedCycles.length + 1}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Efficiency Metrics */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              Efficiency Improvements
            </CardTitle>
          </CardHeader>
          <CardContent>
            {efficiencyMetrics.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p>No efficiency metrics recorded yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <p className="text-xs text-green-300 mb-1">Avg Improvement</p>
                    <p className="text-2xl font-bold text-green-400">
                      +{avgImprovement.toFixed(1)}%
                    </p>
                  </div>
                  <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <p className="text-xs text-blue-300 mb-1">Total Metrics</p>
                    <p className="text-2xl font-bold text-blue-400">
                      {efficiencyMetrics.length}
                    </p>
                  </div>
                  <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                    <p className="text-xs text-purple-300 mb-1">Current Cycle</p>
                    <p className="text-2xl font-bold text-purple-400">
                      #{currentCycle?.cycle_number || 0}
                    </p>
                  </div>
                </div>

                {efficiencyMetrics.slice(0, 5).map((metric, idx) => (
                  <div key={idx} className="p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-white">{metric.metric_name}</p>
                      <Badge className={
                        metric.improvement_percent > 0 ? 'bg-green-500/20 text-green-400' :
                        metric.improvement_percent < 0 ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-500/20 text-gray-400'
                      }>
                        {metric.improvement_percent > 0 ? '+' : ''}{metric.improvement_percent}%
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-400">
                      {metric.current_value} {metric.unit}
                      {metric.enhancement_applied && (
                        <span className="ml-2 text-purple-400">
                          • {metric.enhancement_applied}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Cycles */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              Cycle History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {completedCycles.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Clock className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p>No completed cycles yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {completedCycles.map((cycle) => (
                  <div key={cycle.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-white">
                          Cycle #{cycle.cycle_number} - v{cycle.version}
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(cycle.started_at).toLocaleDateString()} → {' '}
                          {cycle.completed_at ? new Date(cycle.completed_at).toLocaleDateString() : 'Ongoing'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {cycle.integrity_check?.passed && (
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        )}
                        <Badge className="bg-green-500/20 text-green-400">
                          {cycle.duration_hours?.toFixed(1) || 0}h
                        </Badge>
                      </div>
                    </div>
                    {cycle.efficiency_metrics?.improvement_vs_last_cycle > 0 && (
                      <div className="flex items-center gap-2 text-xs text-green-400">
                        <TrendingUp className="w-3 h-3" />
                        +{cycle.efficiency_metrics.improvement_vs_last_cycle}% improvement vs previous cycle
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cycle Instructions */}
        <Card className="bg-blue-900/20 border-blue-500/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-400" />
              Automation Cycle Framework
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-blue-200">
            <div>
              <p className="font-semibold text-blue-300 mb-2">🚀 PHASE 1: RUSH (Days 1-2)</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>Build core functionality for personal use</li>
                <li>Verify automation flows execute end-to-end</li>
                <li>Implement secure API key storage</li>
                <li>Enable task scheduler and workflow triggers</li>
                <li>Identify 2-3 potential enhancements</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-purple-300 mb-2">🛡️ PHASE 2: POLISH (Days 2-4)</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>Patch all major bugs and memory leaks</li>
                <li>Add input sanitization and auth middleware</li>
                <li>Encrypt local configuration and cache</li>
                <li>Refine UI/UX for smooth interaction</li>
                <li>Implement 2-3 efficiency enhancements</li>
                <li>Profile performance and fix slow queries</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-green-300 mb-2">✅ PHASE 3: FINALIZE (Day 4-5)</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>Integrate monetization layer (Stripe/credits)</li>
                <li>Add usage metrics dashboard</li>
                <li>Generate automated build report</li>
                <li>Tag version snapshot</li>
                <li>Archive build and reset cache</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-gray-300 mb-2">🔄 PHASE 4: REPEAT (Auto-scheduled)</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>Clone stable build to archive</li>
                <li>Carry forward unresolved TODOs</li>
                <li>Analyze efficiency gains and propose new enhancements</li>
                <li>Run integrity self-check</li>
                <li>Auto-restart after 5 days</li>
              </ul>
            </div>

            <Alert className="bg-yellow-500/10 border-yellow-500/30 mt-4">
              <Clock className="h-4 w-4 text-yellow-400" />
              <AlertDescription className="text-yellow-300 text-xs">
                <strong>Global Rules:</strong> Private access enforced. HTTP 500 auto-retry with logging. 
                Max 90-minute work per phase. Minimum 2-3 efficiency enhancements per cycle.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}