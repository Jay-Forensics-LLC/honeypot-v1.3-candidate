import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Mail, FileText } from 'lucide-react';
import { toast } from 'sonner';
import FeedbackPanel from '../enrichment/FeedbackPanel';

export default function EmailIntelDetailDrawer({ profile, indicator, caseId, onClose }) {
  const [verdict, setVerdict] = React.useState(profile?.analyst_verdict || 'unknown');
  const [notes, setNotes] = React.useState(profile?.analyst_notes || '');
  const queryClient = useQueryClient();

  const { data: result } = useQuery({
    queryKey: ['enrichment-result', profile?.latest_result_id],
    queryFn: async () => {
      if (!profile?.latest_result_id) return null;
      const results = await base44.entities.EnrichmentResult.filter({ 
        id: profile.latest_result_id 
      });
      return results[0];
    },
    enabled: !!profile?.latest_result_id
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      return await base44.entities.EmailRiskProfile.update(profile.id, {
        analyst_verdict: verdict,
        analyst_notes: notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-risk-profiles', caseId] });
      toast.success('Analyst verdict updated');
    }
  });

  const getRiskColor = (score) => {
    if (score >= 70) return 'text-red-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-green-400';
  };

  const verdictColors = {
    unknown: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    benign: 'bg-green-500/20 text-green-400 border-green-500/30',
    malicious: 'bg-red-500/20 text-red-400 border-red-500/30',
    investigate: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
  };

  if (!profile) return null;

  return (
    <Dialog open={!!profile} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-[#EF4444]" />
            Email Intelligence Detail
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Email Info */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2">Email Address</h3>
            <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
              <p className="text-white font-mono">{indicator?.value}</p>
              {result?.normalized_json?.domain && (
                <p className="text-sm text-slate-400 mt-1">Domain: {result.normalized_json.domain}</p>
              )}
            </div>
          </div>

          {/* Risk Score */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2">Risk Assessment</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-400">Risk Score</p>
                <p className={`text-4xl font-bold mt-1 ${getRiskColor(profile.current_risk_score)}`}>
                  {profile.current_risk_score}/100
                </p>
              </div>
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-400">Confidence</p>
                <p className="text-4xl font-bold text-white mt-1">
                  {Math.round(profile.current_confidence * 100)}%
                </p>
              </div>
            </div>
          </div>

          {/* Flags */}
          {result?.normalized_json && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Detection Flags</h3>
              <div className="grid grid-cols-2 gap-3">
                <Badge className={result.normalized_json.disposable ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'}>
                  Disposable: {result.normalized_json.disposable ? 'Yes' : 'No'}
                </Badge>
                <Badge className={result.normalized_json.freeProvider ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-400'}>
                  Free Provider: {result.normalized_json.freeProvider ? 'Yes' : 'No'}
                </Badge>
                <Badge className={result.normalized_json.syntaxValid ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                  Syntax: {result.normalized_json.syntaxValid ? 'Valid' : 'Invalid'}
                </Badge>
                <Badge className={result.normalized_json.recentAbuse ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}>
                  Recent Abuse: {result.normalized_json.recentAbuse ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
          )}

          {/* Tags */}
          {profile.current_tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {profile.current_tags.map((tag, idx) => (
                  <Badge key={idx} className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Scoring Breakdown */}
          {result?.normalized_json?.scoringBreakdown && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Scoring Breakdown
              </h3>
              <div className="space-y-2">
                {result.normalized_json.scoringBreakdown.map((rule, idx) => (
                  <div key={idx} className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">{rule.ruleId}</span>
                      <Badge className={rule.points > 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}>
                        {rule.points > 0 ? '+' : ''}{rule.points} pts
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-400">{rule.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analyst Feedback */}
          <FeedbackPanel
            verdict={verdict}
            notes={notes}
            onVerdictChange={setVerdict}
            onNotesChange={setNotes}
            onSave={() => updateMutation.mutate()}
            saving={updateMutation.isPending}
            currentScore={profile.current_risk_score}
            originalVerdict={profile.analyst_verdict}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}