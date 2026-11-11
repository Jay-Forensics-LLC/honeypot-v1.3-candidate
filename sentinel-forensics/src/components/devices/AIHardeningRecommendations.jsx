import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Shield,
  Zap,
  Loader2,
  Sparkles,
  Settings,
  Package,
  Eye,
  FileText,
  Target,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';
import { aiSecurityHardeningAdvisor } from '../../functions/aiSecurityHardeningAdvisor';

/**
 * AI-POWERED SECURITY HARDENING RECOMMENDATIONS
 * Displays tailored security hardening recommendations for the device
 */
export default function AIHardeningRecommendations({ device }) {
  const [recommendations, setRecommendations] = useState(device.hardening_recommendations || null);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await aiSecurityHardeningAdvisor({ device_id: device.device_id });
      return response.data;
    },
    onSuccess: (data) => {
      setRecommendations(data.recommendations);
      toast.success('Hardening analysis completed');
    },
    onError: (error) => {
      toast.error('Analysis failed', { description: error.message });
    }
  });

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default: return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            AI Security Hardening
          </CardTitle>
          <Button
            size="sm"
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {analyzeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Analyzing...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-1" />
                Generate Plan
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!recommendations ? (
          <Alert className="bg-emerald-500/10 border-emerald-500/30">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            <AlertDescription className="text-emerald-300">
              Generate tailored security hardening recommendations specific to this device's platform and threat profile.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Overall Score */}
            {recommendations.overall_hardening_score !== undefined && (
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Hardening Potential</p>
                    <div className="flex items-center gap-3">
                      <Shield className="w-8 h-8 text-emerald-400" />
                      <span className="text-3xl font-bold text-emerald-400">
                        {recommendations.overall_hardening_score}/100
                      </span>
                    </div>
                  </div>
                  {recommendations.summary && (
                    <p className="text-xs text-slate-400 max-w-md">{recommendations.summary}</p>
                  )}
                </div>
              </div>
            )}

            <Tabs defaultValue="immediate" className="w-full">
              <TabsList className="grid grid-cols-4 bg-slate-800">
                <TabsTrigger value="immediate">Immediate</TabsTrigger>
                <TabsTrigger value="config">Config</TabsTrigger>
                <TabsTrigger value="software">Software</TabsTrigger>
                <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
              </TabsList>

              {/* Immediate Actions */}
              <TabsContent value="immediate" className="space-y-3 mt-4">
                {recommendations.immediate_actions && recommendations.immediate_actions.length > 0 ? (
                  recommendations.immediate_actions.map((action, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-sm font-semibold text-white">{action.action}</span>
                        <Badge className={getPriorityColor(action.priority)}>
                          {action.priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-300 mb-2">{action.rationale}</p>
                      {action.estimated_time && (
                        <p className="text-xs text-blue-400 mb-2">⏱️ Estimated time: {action.estimated_time}</p>
                      )}
                      {action.steps && action.steps.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-400 mb-1">Steps:</p>
                          <ol className="list-decimal list-inside space-y-1">
                            {action.steps.map((step, i) => (
                              <li key={i} className="text-xs text-slate-400">{step}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No immediate actions required.</p>
                )}
              </TabsContent>

              {/* Configuration Hardening */}
              <TabsContent value="config" className="space-y-3 mt-4">
                {recommendations.configuration_hardening && recommendations.configuration_hardening.length > 0 ? (
                  recommendations.configuration_hardening.map((config, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex items-start gap-2 mb-2">
                        <Settings className="w-4 h-4 text-blue-400 mt-0.5" />
                        <div className="flex-1">
                          <Badge variant="outline" className="mb-1">{config.category}</Badge>
                          <p className="text-sm font-semibold text-white">{config.setting}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <p className="text-slate-400">Current:</p>
                          <p className="text-red-400 font-mono">{config.current_value}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Recommended:</p>
                          <p className="text-green-400 font-mono">{config.recommended_value}</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-300 mb-1"><strong>Impact:</strong> {config.impact}</p>
                      <p className="text-xs text-orange-400"><strong>Risk if not applied:</strong> {config.risk_if_not_applied}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No configuration changes recommended.</p>
                )}
              </TabsContent>

              {/* Software Recommendations */}
              <TabsContent value="software" className="space-y-3 mt-4">
                {recommendations.software_recommendations ? (
                  <>
                    {recommendations.software_recommendations.install && recommendations.software_recommendations.install.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-2">
                          <Package className="w-4 h-4" />
                          Install
                        </h4>
                        <ul className="space-y-1">
                          {recommendations.software_recommendations.install.map((item, idx) => (
                            <li key={idx} className="text-xs text-slate-300 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {recommendations.software_recommendations.update && recommendations.software_recommendations.update.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-blue-400 mb-2">Update</h4>
                        <ul className="space-y-1">
                          {recommendations.software_recommendations.update.map((item, idx) => (
                            <li key={idx} className="text-xs text-slate-300 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {recommendations.software_recommendations.remove && recommendations.software_recommendations.remove.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-red-400 mb-2">Remove</h4>
                        <ul className="space-y-1">
                          {recommendations.software_recommendations.remove.map((item, idx) => (
                            <li key={idx} className="text-xs text-slate-300 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {recommendations.software_recommendations.configure && recommendations.software_recommendations.configure.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-yellow-400 mb-2">Configure</h4>
                        <ul className="space-y-1">
                          {recommendations.software_recommendations.configure.map((item, idx) => (
                            <li key={idx} className="text-xs text-slate-300 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-400">No software changes recommended.</p>
                )}
              </TabsContent>

              {/* Implementation Roadmap */}
              <TabsContent value="roadmap" className="space-y-3 mt-4">
                {recommendations.implementation_roadmap ? (
                  <>
                    {recommendations.implementation_roadmap.phase_1_immediate && (
                      <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                        <h4 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                          <Zap className="w-4 h-4" />
                          Phase 1: Immediate (0-24 hours)
                        </h4>
                        <ul className="space-y-1">
                          {recommendations.implementation_roadmap.phase_1_immediate.map((item, idx) => (
                            <li key={idx} className="text-xs text-slate-300">• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {recommendations.implementation_roadmap.phase_2_short_term && (
                      <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                        <h4 className="text-sm font-semibold text-yellow-400 mb-2">Phase 2: Short-term (1-7 days)</h4>
                        <ul className="space-y-1">
                          {recommendations.implementation_roadmap.phase_2_short_term.map((item, idx) => (
                            <li key={idx} className="text-xs text-slate-300">• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {recommendations.implementation_roadmap.phase_3_ongoing && (
                      <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                        <h4 className="text-sm font-semibold text-blue-400 mb-2">Phase 3: Ongoing</h4>
                        <ul className="space-y-1">
                          {recommendations.implementation_roadmap.phase_3_ongoing.map((item, idx) => (
                            <li key={idx} className="text-xs text-slate-300">• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-400">No roadmap available.</p>
                )}
              </TabsContent>
            </Tabs>

            {device.last_hardening_analysis && (
              <p className="text-xs text-slate-500 text-right">
                Last analyzed: {new Date(device.last_hardening_analysis).toLocaleString()}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}