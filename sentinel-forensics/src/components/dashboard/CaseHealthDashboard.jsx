import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { useCaseContext } from '../navigation/CaseSelectorHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  AlertTriangle, 
  CheckCircle, 
  Shield, 
  Hash, 
  FileText, 
  Clock,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

export default function CaseHealthDashboard() {
  const { data: user } = useUser();
  const { activeCaseId } = useCaseContext();

  const { data: healthMetrics, isLoading } = useQuery({
    queryKey: ['case-health', activeCaseId, user?.organization_id],
    queryFn: async () => {
      if (!activeCaseId) return null;

      // Fetch evidence for the active case
      const evidence = await base44.entities.EvidenceV2.filter({
        organization_id: user.organization_id,
        case_id: activeCaseId
      });

      // Fetch related data
      const exhibits = await base44.entities.CourtExhibit.filter({
        legal_case_id: activeCaseId
      });

      const disclosures = await base44.entities.DisclosureLog.filter({
        legal_case_id: activeCaseId
      });

      const annotations = await base44.entities.EvidenceAnnotation.filter({
        legal_case_id: activeCaseId
      });

      // Calculate health metrics
      const totalEvidence = evidence.length;
      const unhashedEvidence = evidence.filter(e => !e.file_hash_sha256).length;
      const unverifiedChain = evidence.filter(e => !e.is_verified).length;
      const highRiskEvidence = evidence.filter(e => e.risk_score > 70).length;
      const legalHoldEvidence = evidence.filter(e => e.legal_hold).length;
      const unpinnedCritical = evidence.filter(e => e.risk_score > 80 && !e.pinned).length;
      
      const pendingAnnotations = annotations.filter(a => a.status === 'open').length;
      const pendingDisclosures = disclosures.filter(d => !d.disclosure_date).length;
      
      const courtReadyExhibits = exhibits.filter(e => 
        e.chain_of_custody_verified && 
        e.foundation_established &&
        e.disclosed_to_opposing
      ).length;

      // Calculate overall health score (0-100)
      const weights = {
        hashed: 30,
        verified: 25,
        annotated: 15,
        disclosed: 20,
        exhibits: 10
      };

      const scores = {
        hashed: totalEvidence > 0 ? ((totalEvidence - unhashedEvidence) / totalEvidence) * weights.hashed : 0,
        verified: totalEvidence > 0 ? ((totalEvidence - unverifiedChain) / totalEvidence) * weights.verified : 0,
        annotated: annotations.length > 0 ? ((annotations.length - pendingAnnotations) / annotations.length) * weights.annotated : 0,
        disclosed: disclosures.length > 0 ? ((disclosures.length - pendingDisclosures) / disclosures.length) * weights.disclosed : 0,
        exhibits: exhibits.length > 0 ? (courtReadyExhibits / exhibits.length) * weights.exhibits : 0
      };

      const overallScore = Math.round(Object.values(scores).reduce((a, b) => a + b, 0));

      return {
        overallScore,
        totalEvidence,
        unhashedEvidence,
        unverifiedChain,
        highRiskEvidence,
        legalHoldEvidence,
        unpinnedCritical,
        pendingAnnotations,
        pendingDisclosures,
        courtReadyExhibits,
        totalExhibits: exhibits.length,
        risks: [
          unhashedEvidence > 0 && { type: 'critical', message: `${unhashedEvidence} evidence items without hashes` },
          unverifiedChain > 0 && { type: 'high', message: `${unverifiedChain} chain of custody unverified` },
          unpinnedCritical > 0 && { type: 'medium', message: `${unpinnedCritical} critical evidence not flagged` },
          pendingDisclosures > 0 && { type: 'medium', message: `${pendingDisclosures} disclosures pending` },
          highRiskEvidence > 5 && { type: 'high', message: `${highRiskEvidence} high-risk evidence items` }
        ].filter(Boolean)
      };
    },
    enabled: !!activeCaseId && !!user?.organization_id,
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  if (!activeCaseId) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-8 text-center">
          <p className="text-slate-300 font-medium">Select a case to view health metrics</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-8 text-center">
          <p className="text-slate-300 font-medium">Loading case health...</p>
        </CardContent>
      </Card>
    );
  }

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreIcon = (score) => {
    if (score >= 80) return TrendingUp;
    return TrendingDown;
  };

  const ScoreIcon = getScoreIcon(healthMetrics.overallScore);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Case Health Dashboard
          </span>
          <div className="flex items-center gap-2">
            <ScoreIcon className={`w-5 h-5 ${getScoreColor(healthMetrics.overallScore)}`} />
            <span className={`text-2xl font-bold ${getScoreColor(healthMetrics.overallScore)}`}>
              {healthMetrics.overallScore}
            </span>
            <span className="text-sm text-slate-400">/100</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-300">Court Readiness</span>
            <span className={getScoreColor(healthMetrics.overallScore)}>
              {healthMetrics.overallScore >= 80 ? 'Excellent' : 
               healthMetrics.overallScore >= 60 ? 'Good' : 'Needs Attention'}
            </span>
          </div>
          <Progress 
            value={healthMetrics.overallScore} 
            className="h-3"
          />
        </div>

        {/* Risk Alerts */}
        {healthMetrics.risks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Active Risks
            </h3>
            {healthMetrics.risks.map((risk, idx) => (
              <div 
                key={idx}
                className={`p-3 rounded-lg border ${
                  risk.type === 'critical' ? 'bg-red-900/20 border-red-500/50' :
                  risk.type === 'high' ? 'bg-orange-900/20 border-orange-500/50' :
                  'bg-yellow-900/20 border-yellow-500/50'
                }`}
              >
                <p className={`text-sm ${
                  risk.type === 'critical' ? 'text-red-300' :
                  risk.type === 'high' ? 'text-orange-300' :
                  'text-yellow-300'
                }`}>
                  {risk.message}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-slate-800/50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Hash className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-slate-400">Hash Coverage</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {healthMetrics.totalEvidence - healthMetrics.unhashedEvidence}/{healthMetrics.totalEvidence}
            </p>
          </div>

          <div className="p-3 bg-slate-800/50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-xs text-slate-400">Chain Verified</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {healthMetrics.totalEvidence - healthMetrics.unverifiedChain}/{healthMetrics.totalEvidence}
            </p>
          </div>

          <div className="p-3 bg-slate-800/50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-slate-400">Court Ready</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {healthMetrics.courtReadyExhibits}/{healthMetrics.totalExhibits}
            </p>
          </div>

          <div className="p-3 bg-slate-800/50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-400">Pending Actions</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {healthMetrics.pendingAnnotations + healthMetrics.pendingDisclosures}
            </p>
          </div>
        </div>

        {/* Legal Hold Notice */}
        {healthMetrics.legalHoldEvidence > 0 && (
          <div className="p-3 bg-amber-900/20 border border-amber-500/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <p className="text-sm text-amber-300">
                <strong>{healthMetrics.legalHoldEvidence}</strong> items under legal hold
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}