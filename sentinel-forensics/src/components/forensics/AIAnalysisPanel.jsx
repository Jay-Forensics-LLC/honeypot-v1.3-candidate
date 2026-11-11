import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  AlertTriangle, 
  Shield, 
  Target,
  Activity
} from 'lucide-react';

export default function AIAnalysisPanel({ collections }) {
  const collectionsWithAnalysis = collections?.filter(c => c.ai_analysis) || [];
  
  const allThreatIndicators = collectionsWithAnalysis.flatMap(c => 
    c.ai_analysis.threat_indicators || []
  );

  const criticalThreats = allThreatIndicators.filter(t => t.severity === 'critical');
  const highConfidenceThreats = allThreatIndicators.filter(t => t.confidence >= 80);

  const avgConfidence = allThreatIndicators.length > 0
    ? allThreatIndicators.reduce((sum, t) => sum + t.confidence, 0) / allThreatIndicators.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Analysis Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">Total Indicators</p>
                <p className="text-2xl font-bold text-white">{allThreatIndicators.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Target className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">Critical Threats</p>
                <p className="text-2xl font-bold text-red-400">{criticalThreats.length}</p>
              </div>
              <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">Avg Confidence</p>
                <p className="text-2xl font-bold text-white">{Math.round(avgConfidence)}%</p>
              </div>
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Threat Distribution */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            Threat Intelligence Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {collectionsWithAnalysis.length > 0 ? (
            collectionsWithAnalysis.map((collection) => (
              <div key={collection.id} className="p-4 bg-slate-800 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-white">{collection.collection_name}</h4>
                  <Badge variant="outline" className="border-slate-600">
                    {collection.ai_analysis.threat_indicators?.length || 0} indicators
                  </Badge>
                </div>
                <p className="text-sm text-slate-300 mb-3">
                  {collection.ai_analysis.findings_summary}
                </p>
                {collection.ai_analysis.threat_indicators?.slice(0, 3).map((indicator, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-t border-slate-700">
                    <span className="text-sm text-slate-400">{indicator.indicator}</span>
                    <div className="flex items-center gap-2">
                      <Progress value={indicator.confidence} className="w-20 h-2" />
                      <Badge className={
                        indicator.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        indicator.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }>
                        {indicator.severity}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <TrendingUp className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No AI analysis data yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}