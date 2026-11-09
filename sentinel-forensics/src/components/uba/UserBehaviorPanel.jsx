import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users,
  AlertTriangle,
  TrendingUp,
  Eye,
  Clock,
  MapPin,
  Monitor,
  Shield,
  Loader2,
  ChevronRight,
  RefreshCw,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatRelativeTime } from '../utils';

/**
 * USER BEHAVIOR ANALYTICS PANEL
 * Displays suspicious user activities and anomaly detection
 */

export default function UserBehaviorPanel({ organizationId }) {
  const [selectedUser, setSelectedUser] = useState(null);
  const queryClient = useQueryClient();

  // Fetch recent UBA results
  const { data: ubaResults = [], isLoading } = useQuery({
    queryKey: ['uba-results', organizationId],
    queryFn: async () => {
      return await base44.entities.UserBehaviorAnalytics.filter(
        { organization_id: organizationId },
        '-analysis_period_end',
        50
      );
    },
    staleTime: 60000,
    refetchInterval: 120000 // Refresh every 2 minutes
  });

  // Run UBA analysis
  const analyzeUsersMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('analyzeUserBehavior', {
        days_to_analyze: 7
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['uba-results'] });
      toast.success('User Behavior Analysis Complete', {
        description: `Analyzed ${data.analyzed_users} users, ${data.high_risk_users} high-risk detected`
      });
    },
    onError: (error) => {
      toast.error('UBA Analysis Failed', {
        description: error.message
      });
    }
  });

  // Get suspicious users (high risk)
  const suspiciousUsers = ubaResults.filter(r => 
    r.status === 'suspicious' || r.status === 'critical'
  );

  // Get users requiring investigation
  const investigationRequired = ubaResults.filter(r => r.requires_investigation);

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/50',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      low: 'bg-blue-500/20 text-blue-400 border-blue-500/50'
    };
    return colors[severity] || colors.low;
  };

  const getStatusColor = (status) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/50',
      suspicious: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      normal: 'bg-green-500/20 text-green-400 border-green-500/50'
    };
    return colors[status] || colors.normal;
  };

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400 mb-2" />
          <p className="text-slate-400">Loading user behavior analytics...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-400" />
              User Behavior Analytics
            </CardTitle>
            <Button
              size="sm"
              onClick={() => analyzeUsersMutation.mutate()}
              disabled={analyzeUsersMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {analyzeUsersMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Run Analysis
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <p className="text-sm text-slate-400">High Risk Users</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {suspiciousUsers.length}
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-5 h-5 text-orange-400" />
                <p className="text-sm text-slate-400">Need Investigation</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {investigationRequired.length}
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-blue-400" />
                <p className="text-sm text-slate-400">Monitored Users</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {ubaResults.length}
              </p>
            </div>
          </div>

          {/* Suspicious Users List */}
          {suspiciousUsers.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Suspicious User Activities
              </h4>
              {suspiciousUsers.map(result => (
                <button
                  key={result.id}
                  onClick={() => setSelectedUser(result)}
                  className="w-full text-left p-3 bg-slate-800/30 rounded-lg border border-slate-700 hover:border-red-500/50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-white truncate">
                          {result.user_email}
                        </p>
                        <Badge variant="outline" className={getStatusColor(result.status)}>
                          {result.status.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          Risk: {result.risk_score}/100
                        </span>
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {result.anomalies_detected?.length || 0} anomalies
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(result.analysis_period_end)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          ) : ubaResults.length > 0 ? (
            <Alert className="bg-green-900/20 border-green-500/30">
              <Shield className="h-4 w-4 text-green-400" />
              <AlertDescription className="text-green-200">
                <strong>All Clear</strong>
                <p className="text-sm mt-1">
                  No suspicious user behavior detected. All monitored users show normal activity patterns.
                </p>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="bg-blue-900/20 border-blue-500/30">
              <Activity className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-blue-200">
                <strong>No Analysis Data</strong>
                <p className="text-sm mt-1">
                  Click "Run Analysis" to start monitoring user behavior patterns and detect anomalies.
                </p>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* User Detail Dialog */}
      {selectedUser && (
        <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                User Behavior Analysis: {selectedUser.user_email}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Risk Overview */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-white">Risk Assessment</h4>
                    <Badge variant="outline" className={getStatusColor(selectedUser.status)}>
                      {selectedUser.status.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Risk Score</span>
                      <span className="font-bold text-red-400">{selectedUser.risk_score}/100</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-orange-500 to-red-500 h-2 rounded-full transition-all"
                        style={{ width: `${selectedUser.risk_score}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Baseline Metrics */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-white mb-3">Baseline Behavior</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-blue-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-400">Typical Login Time</p>
                        <p className="text-sm text-white">{selectedUser.baseline_metrics?.avg_login_time || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Activity className="w-4 h-4 text-green-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-400">Avg Session</p>
                        <p className="text-sm text-white">{selectedUser.baseline_metrics?.avg_session_duration_minutes || 0} min</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-purple-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-400">Locations</p>
                        <p className="text-sm text-white">{selectedUser.baseline_metrics?.typical_locations?.length || 0} known</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Monitor className="w-4 h-4 text-orange-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-400">Devices</p>
                        <p className="text-sm text-white">{selectedUser.baseline_metrics?.typical_devices?.length || 0} known</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Anomalies Detected */}
              {selectedUser.anomalies_detected && selectedUser.anomalies_detected.length > 0 && (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      Anomalies Detected ({selectedUser.anomalies_detected.length})
                    </h4>
                    <div className="space-y-2">
                      {selectedUser.anomalies_detected.map((anomaly, idx) => (
                        <div key={idx} className="p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={getSeverityColor(anomaly.severity)}>
                                {anomaly.severity.toUpperCase()}
                              </Badge>
                              <span className="text-xs text-slate-400">
                                {formatRelativeTime(anomaly.detected_at)}
                              </span>
                            </div>
                            <Badge variant="outline" className="bg-slate-800 text-slate-300 text-xs">
                              Score: {anomaly.deviation_score}
                            </Badge>
                          </div>
                          <p className="text-sm text-white mb-1">{anomaly.description}</p>
                          <p className="text-xs text-slate-400">
                            Type: {anomaly.anomaly_type.replace(/_/g, ' ')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Investigation Actions */}
              {selectedUser.requires_investigation && (
                <Alert className="bg-red-900/20 border-red-500/30">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  <AlertDescription className="text-red-200">
                    <strong>Investigation Required</strong>
                    <p className="text-sm mt-1">
                      This user's behavior deviates significantly from baseline. Review anomalies and consider:
                    </p>
                    <ul className="text-sm mt-2 space-y-1 list-disc list-inside">
                      <li>Contacting the user to verify recent activities</li>
                      <li>Reviewing audit logs for unauthorized access</li>
                      <li>Temporarily restricting permissions if compromise suspected</li>
                      <li>Initiating incident response procedures</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}