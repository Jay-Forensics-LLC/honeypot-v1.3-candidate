import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Clock,
  TrendingUp,
  Loader2,
  FileSearch
} from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';
import { toast } from 'sonner';

export default function IntegrityMonitor({ evidenceId, caseId, mode = 'single' }) {
  const [isScanning, setIsScanning] = useState(false);
  const queryClient = useQueryClient();

  // Fetch recent integrity checks
  const { data: checks = [], isLoading } = useQuery({
    queryKey: ['integrity-checks', evidenceId, caseId],
    queryFn: async () => {
      const filter = evidenceId 
        ? { evidence_id: evidenceId }
        : caseId
        ? {} // Will fetch case-related checks
        : {};
      
      return base44.entities.EvidenceIntegrityCheck.filter(filter, '-check_timestamp', 50);
    },
    enabled: !!(evidenceId || caseId),
    refetchInterval: 60000 // Refresh every minute
  });

  // Run integrity check mutation
  const checkMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        mode,
        ...(evidenceId && { evidence_id: evidenceId }),
        ...(caseId && { case_id: caseId })
      };

      const response = await base44.functions.invoke('monitorEvidenceIntegrity', payload);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['integrity-checks'] });
      
      if (data.drift_detected_count > 0) {
        toast.error(`⚠️ Drift Detected: ${data.drift_detected_count} evidence item(s) failed verification`, {
          duration: 5000
        });
      } else if (data.checked > 0) {
        toast.success(`✓ All ${data.checked} evidence item(s) verified successfully`);
      }
      
      setIsScanning(false);
    },
    onError: (error) => {
      toast.error('Integrity check failed: ' + error.message);
      setIsScanning(false);
    }
  });

  const handleScan = () => {
    setIsScanning(true);
    checkMutation.mutate();
  };

  // Calculate stats
  const recentChecks = checks.slice(0, 10);
  const latestCheck = checks[0];
  const totalPassed = checks.filter(c => c.status === 'pass').length;
  const totalFailed = checks.filter(c => c.status === 'fail').length;
  const totalErrors = checks.filter(c => c.status === 'error').length;
  const driftDetected = checks.some(c => c.drift_detected && c.check_timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const getStatusIcon = (status) => {
    if (status === 'pass') return <CheckCircle className="w-5 h-5 text-green-400" />;
    if (status === 'fail') return <XCircle className="w-5 h-5 text-red-400" />;
    return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
  };

  const getStatusColor = (status) => {
    if (status === 'pass') return 'bg-green-500/20 text-green-300';
    if (status === 'fail') return 'bg-red-500/20 text-red-300';
    return 'bg-yellow-500/20 text-yellow-300';
  };

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400" />
          <p className="text-slate-400 mt-2">Loading integrity status...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Evidence Integrity Monitor
          </div>
          <Button
            onClick={handleScan}
            disabled={isScanning || checkMutation.isPending}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isScanning || checkMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Run Check
              </>
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Alert Banner for Drift */}
        {driftDetected && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-red-300 font-semibold mb-1">Integrity Drift Detected</h4>
              <p className="text-sm text-red-200">
                Evidence tampering or corruption has been detected in the last 24 hours. 
                Immediate investigation required.
              </p>
            </div>
          </div>
        )}

        {/* Status Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-sm text-slate-400">Passed</p>
            </div>
            <p className="text-2xl font-bold text-white">{totalPassed}</p>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-5 h-5 text-red-400" />
              <p className="text-sm text-slate-400">Failed</p>
            </div>
            <p className="text-2xl font-bold text-red-400">{totalFailed}</p>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <p className="text-sm text-slate-400">Errors</p>
            </div>
            <p className="text-2xl font-bold text-yellow-400">{totalErrors}</p>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-blue-400" />
              <p className="text-sm text-slate-400">Last Check</p>
            </div>
            <p className="text-sm font-medium text-white">
              {latestCheck 
                ? DateUtils.safeRelativeTime(latestCheck.check_timestamp, 'Never') 
                : 'Never'}
            </p>
          </div>
        </div>

        {/* Recent Checks */}
        {recentChecks.length > 0 ? (
          <div>
            <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              Recent Checks
            </h4>
            <div className="space-y-2">
              {recentChecks.map((check) => (
                <div
                  key={check.id}
                  className="bg-slate-800/30 rounded-lg p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(check.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white font-medium">
                          {DateUtils.safeFormatDateTime(check.check_timestamp)}
                        </p>
                        {check.drift_detected && (
                          <Badge className="bg-red-500/20 text-red-300 text-xs">
                            DRIFT DETECTED
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {check.check_type} check by {check.checked_by}
                      </p>
                      {check.error_message && (
                        <p className="text-xs text-red-400 mt-1">{check.error_message}</p>
                      )}
                    </div>
                  </div>
                  <Badge className={getStatusColor(check.status)}>
                    {check.status.toUpperCase()}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <FileSearch className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 mb-4">No integrity checks performed yet</p>
            <Button
              onClick={handleScan}
              disabled={isScanning}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Shield className="w-4 h-4 mr-2" />
              Run First Check
            </Button>
          </div>
        )}

        {/* Info Footer */}
        <div className="bg-blue-900/10 border border-blue-500/20 rounded-lg p-3">
          <p className="text-xs text-blue-200">
            <strong>How it works:</strong> Evidence files are periodically re-hashed and compared 
            to the original anchored hash. Any mismatch indicates tampering or corruption and 
            triggers immediate alerts while maintaining an immutable audit trail.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}