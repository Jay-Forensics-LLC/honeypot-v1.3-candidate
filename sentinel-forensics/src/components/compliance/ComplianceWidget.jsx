import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Shield, AlertTriangle, ArrowRight } from 'lucide-react';
import { createPageUrl } from '../../utils';

/**
 * Compliance Widget for Dashboard
 * Shows at-a-glance compliance status
 */
export default function ComplianceWidget() {
  const { data: complianceChecks = [] } = useQuery({
    queryKey: ['compliance-checks-summary'],
    queryFn: () => base44.entities.ComplianceCheck.list('-last_check_date', 5),
    refetchInterval: 300000 // 5 minutes
  });

  const { data: deletionRequests = [] } = useQuery({
    queryKey: ['deletion-requests-count'],
    queryFn: () => base44.entities.DataDeletionRequest.filter({ status: 'pending' }),
    refetchInterval: 60000
  });

  const latestCheck = complianceChecks[0];
  const avgScore = complianceChecks.length > 0
    ? complianceChecks.reduce((sum, c) => sum + (c.compliance_score || 0), 0) / complianceChecks.length
    : 0;

  const criticalFindings = complianceChecks
    .flatMap(c => c.findings || [])
    .filter(f => f.severity === 'critical').length;

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          Compliance Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Score */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">Overall Score</span>
            <span className="text-2xl font-bold text-white">{avgScore.toFixed(0)}%</span>
          </div>
          <Progress value={avgScore} className="h-2" />
        </div>

        {/* Critical Findings */}
        {criticalFindings > 0 && (
          <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">{criticalFindings} Critical Issues</p>
              <p className="text-xs text-red-400">Immediate attention required</p>
            </div>
          </div>
        )}

        {/* GDPR Deletion Requests */}
        {deletionRequests.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-yellow-300">
                {deletionRequests.length} Pending Deletion Request{deletionRequests.length > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-yellow-400">GDPR review required</p>
            </div>
          </div>
        )}

        {/* Latest Check */}
        {latestCheck && (
          <div className="text-xs text-slate-500">
            Last check: {new Date(latestCheck.last_check_date).toLocaleDateString()}
          </div>
        )}

        {/* Action Button */}
        <Button
          size="sm"
          variant="outline"
          className="w-full border-slate-700"
          onClick={() => window.location.href = createPageUrl('ComplianceCenter')}
        >
          View Compliance Center
          <ArrowRight className="w-3 h-3 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}