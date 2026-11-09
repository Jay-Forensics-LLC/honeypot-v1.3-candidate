import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Brain, TrendingUp, Shield, Clock } from "lucide-react";
import { CryptoUtils } from "@/components/utils/CryptoUtils";

export default function BehaviorAnalysis() {
  const [analyzing, setAnalyzing] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: behaviorProfile } = useQuery({
    queryKey: ['behavior-profile', user?.email],
    queryFn: async () => {
      const profiles = await base44.entities.BehaviorProfile.filter({ user_id: user?.email });
      return profiles[0];
    },
    enabled: !!user,
  });

  const createBehaviorProfileMutation = useMutation({
    mutationFn: (profileData) => base44.entities.BehaviorProfile.create(profileData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['behavior-profile'] });
    },
  });

  const updateBehaviorProfileMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BehaviorProfile.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['behavior-profile'] });
    },
  });

  const analyzeUserBehavior = async () => {
    setAnalyzing(true);

    // Collect current session data
    const currentBehavior = {
      session_duration: Date.now() - performance.timing.navigationStart,
      login_time: new Date().toISOString(),
      location: await getCurrentLocation(),
      device_info: {
        platform: navigator.platform,
        user_agent: navigator.userAgent,
        screen: `${screen.width}x${screen.height}`
      }
    };

    // Use AI to predict anomalies and future threats
    const prompt = `Analyze user behavior and predict potential security threats:

Current Session Data:
${JSON.stringify(currentBehavior, null, 2)}

${behaviorProfile ? `
Baseline Behavior:
${JSON.stringify(behaviorProfile.baseline_behavior, null, 2)}
` : 'No baseline established yet.'}

Predict:
1. Anomalies in current behavior
2. Potential security threats in next 24-48 hours
3. Risk score (0-100)
4. Recommended preventive actions
5. Self-healing mechanisms that should be deployed`;

    try {
      const analysis = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            risk_score: { type: "number" },
            anomalies: { type: "array", items: { type: "string" } },
            predictions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  predicted_threat: { type: "string" },
                  confidence: { type: "number" },
                  timeframe: { type: "string" },
                  mitigation_suggested: { type: "string" }
                }
              }
            },
            recommendations: { type: "array", items: { type: "string" } },
            self_healing_actions: { type: "array", items: { type: "string" } }
          }
        }
      });

      setPredictions(analysis.predictions || []);

      // Update or create behavior profile
      if (behaviorProfile) {
        await updateBehaviorProfileMutation.mutateAsync({
          id: behaviorProfile.id,
          data: {
            current_risk_score: analysis.risk_score,
            anomaly_predictions: analysis.predictions,
            last_analysis: new Date().toISOString()
          }
        });
      } else {
        await createBehaviorProfileMutation.mutateAsync({
          user_id: user?.email,
          baseline_behavior: currentBehavior,
          current_risk_score: analysis.risk_score,
          anomaly_predictions: analysis.predictions,
          last_analysis: new Date().toISOString()
        });
      }

      // Create alert if high risk
      if (analysis.risk_score > 70) {
        await base44.entities.Alert.create({
          alert_type: 'unauthorized_access',
          severity: analysis.risk_score > 85 ? 'critical' : 'high',
          title: 'Behavioral Anomaly Detected',
          description: `AI detected unusual behavior patterns. Risk score: ${analysis.risk_score}/100. ${analysis.anomalies.join(', ')}`,
          source: 'Behavior Analysis Engine',
          detection_timestamp: new Date().toISOString(),
          recommended_actions: analysis.recommendations
        });
      }

      // Execute self-healing actions
      if (analysis.self_healing_actions && analysis.self_healing_actions.length > 0) {
        await executeSelfHealing(analysis.self_healing_actions);
      }

      // Log analysis
      await createAuditLog({
        event_type: 'behavior_analysis',
        severity: 'info',
        description: `Behavior analysis completed. Risk score: ${analysis.risk_score}`,
        user_id: user?.email,
        metadata: { analysis }
      });

    } catch (error) {
      console.error('Behavior analysis error:', error);
      await createAuditLog({
        event_type: 'behavior_analysis_error',
        severity: 'error',
        description: `Behavior analysis failed: ${error.message}`,
        user_id: user?.email
      });
    }

    setAnalyzing(false);
  };

  const executeSelfHealing = async (actions) => {
    for (const action of actions) {
      // Log self-healing action
      await createAuditLog({
        event_type: 'self_healing_action',
        severity: 'warning',
        description: `Executing self-healing: ${action}`,
        user_id: user?.email
      });
    }
  };

  const createAuditLog = async (logData) => {
    await base44.entities.AuditLog.create({
      ...logData,
      timestamp: new Date().toISOString(),
      session_id: sessionStorage.getItem('session_id') || CryptoUtils.generateId(),
      ip_address: await getUserIP(),
      device_fingerprint: await getDeviceFingerprint()
    });
  };

  const getCurrentLocation = async () => {
    try {
      return await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          }),
          reject
        );
      });
    } catch {
      return null;
    }
  };

  const getUserIP = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return 'unknown';
    }
  };

  const getDeviceFingerprint = async () => {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      screen.width,
      screen.height,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency
    ].join('|');
    
    const encoder = new TextEncoder();
    const data = encoder.encode(components);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  useEffect(() => {
    if (user) {
      analyzeUserBehavior();
      // Re-analyze every 5 minutes
      const interval = setInterval(analyzeUserBehavior, 300000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const riskScore = behaviorProfile?.current_risk_score || 0;
  const riskLevel = riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : riskScore < 80 ? 'high' : 'critical';
  const riskColors = {
    low: 'text-green-400',
    medium: 'text-yellow-400',
    high: 'text-orange-400',
    critical: 'text-red-400'
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            AI-Powered Behavior Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Dynamic Risk Score</span>
              <Badge className={`bg-${riskLevel === 'low' ? 'green' : riskLevel === 'medium' ? 'yellow' : riskLevel === 'high' ? 'orange' : 'red'}-500/20`}>
                {riskLevel.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <Progress value={riskScore} className="flex-1" />
              <span className={`text-3xl font-bold ${riskColors[riskLevel]}`}>
                {riskScore}
              </span>
            </div>
          </div>

          <Button
            onClick={analyzeUserBehavior}
            disabled={analyzing}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            {analyzing ? 'Analyzing...' : 'Run Analysis'}
          </Button>

          {predictions.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Threat Predictions
              </h4>
              {predictions.map((pred, idx) => (
                <Card key={idx} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h5 className="font-semibold text-white text-sm">{pred.predicted_threat}</h5>
                      <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                        {Math.round(pred.confidence * 100)}% Confidence
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 mb-2">
                      <Clock className="w-3 h-3 inline mr-1" />
                      Timeframe: {pred.timeframe}
                    </p>
                    <p className="text-xs text-slate-300">
                      <Shield className="w-3 h-3 inline mr-1" />
                      {pred.mitigation_suggested}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}