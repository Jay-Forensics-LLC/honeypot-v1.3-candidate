import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * IMPACT PREVIEW
 * Shows how analyst feedback would affect the risk score
 * Does NOT modify historical data - preview only
 */

export default function ImpactPreview({ currentScore, currentVerdict, newVerdict }) {
  if (currentVerdict === newVerdict) return null;

  // Calculate impact
  const calculateImpact = () => {
    const impacts = {
      benign: -30,
      malicious: +30,
      investigate: +10,
      unknown: 0
    };

    const previousImpact = impacts[currentVerdict] || 0;
    const newImpact = impacts[newVerdict] || 0;
    const delta = newImpact - previousImpact;
    const adjustedScore = Math.min(100, Math.max(0, currentScore + delta));

    return { delta, adjustedScore };
  };

  const { delta, adjustedScore } = calculateImpact();

  if (delta === 0) return null;

  return (
    <Card className="bg-blue-500/10 border-blue-500/30">
      <CardHeader>
        <CardTitle className="text-white text-sm flex items-center gap-2">
          {delta > 0 ? <TrendingUp className="w-4 h-4 text-blue-400" /> : <TrendingDown className="w-4 h-4 text-blue-400" />}
          Impact Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Current Score</span>
            <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
              {currentScore}/100
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Verdict Change</span>
            <div className="flex items-center gap-2">
              <Badge className="bg-slate-500/20 text-slate-400">
                {currentVerdict}
              </Badge>
              <span className="text-slate-500">→</span>
              <Badge className="bg-blue-500/20 text-blue-400">
                {newVerdict}
              </Badge>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Impact</span>
            <Badge className={delta > 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}>
              {delta > 0 ? '+' : ''}{delta} points
            </Badge>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-700">
            <span className="text-sm font-semibold text-slate-200">Preview Score</span>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
              {adjustedScore}/100
            </Badge>
          </div>
          <p className="text-xs text-blue-300">
            This is a preview only. Historical enrichment results remain unchanged for audit integrity.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}