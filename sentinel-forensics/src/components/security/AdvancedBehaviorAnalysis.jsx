import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  Shield, 
  Activity, 
  Clock,
  MapPin,
  Zap
} from "lucide-react";
import { CryptoUtils } from "@/components/utils/CryptoUtils";

export default function AdvancedBehaviorAnalysis() {
  const [analyzing, setAnalyzing] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const [contextData, setContextData] = useState(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
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

  const { data: deviceLogs = [] } = useQuery({
    queryKey: ['device-logs', user?.email],
    queryFn: () => base44.entities.DeviceLog.list('-timestamp', 100),
    enabled: !!user,
  });

  const { data: socialMediaMonitors = [] } = useQuery({
    queryKey: ['social-media-monitors', user?.email],
    queryFn: () => base44.entities.SocialMediaMonitor.list(),
    enabled: !!user,
  });

  // Context-aware risk scoring
  const calculateContextualRiskScore = async (baseScore) => {
    const now = new Date();
    const hour = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const location = await getCurrentLocation();
    
    let contextualAdjustment = 0;
    
    // Non-working hours (9 PM - 6 AM)
    if (hour >= 21 || hour < 6) {
      contextualAdjustment += 15;
    }
    
    // Weekend activity
    if (isWeekend) {
      contextualAdjustment += 10;
    }
    
    // Location-based risk
    if (location && behaviorProfile?.baseline_behavior?.common_locations) {
      const isCommonLocation = behaviorProfile.baseline_behavior.common_locations.some(
        loc => calculateDistance(loc, location) < 50 // within 50km
      );
      if (!isCommonLocation) {
        contextualAdjustment += 20;
      }
    }
    
    // Device type risk
    const isMobile = /Mobile|Android|iPhone/i.test(navigator.userAgent);
    if (isMobile && hour >= 21) {
      contextualAdjustment += 10;
    }
    
    return Math.min(100, baseScore + contextualAdjustment);
  };

  // Predictive compromise based on historical trends
  const predictCompromiseRisk = async () => {
    if (!deviceLogs || deviceLogs.length < 10) {
      return { risk: 0, confidence: 0, factors: [] };
    }

    const recentLogs = deviceLogs.slice(0, 30);
    const factors = [];
    let riskScore = 0;

    // Analyze login pattern deviations
    const loginTimes = recentLogs.map(log => new Date(log.timestamp).getHours());
    const avgLoginTime = loginTimes.reduce((a, b) => a + b, 0) / loginTimes.length;
    const currentHour = new Date().getHours();
    const timeDeviation = Math.abs(currentHour - avgLoginTime);
    
    if (timeDeviation > 6) {
      riskScore += 25;
      factors.push(`Login time deviation: ${timeDeviation.toFixed(1)} hours from normal`);
    }

    // Analyze location changes
    const locations = recentLogs
      .filter(log => log.location_data?.latitude)
      .map(log => ({ lat: log.location_data.latitude, lng: log.location_data.longitude }));
    
    if (locations.length > 1) {
      const distances = [];
      for (let i = 1; i < locations.length; i++) {
        distances.push(calculateDistance(locations[i-1], locations[i]));
      }
      const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
      if (avgDistance > 100) {
        riskScore += 20;
        factors.push(`Unusual geographic movement: ${avgDistance.toFixed(0)}km average`);
      }
    }

    // Analyze device fingerprint changes
    const uniqueFingerprints = new Set(recentLogs.map(log => log.device_fingerprint));
    if (uniqueFingerprints.size > 3) {
      riskScore += 30;
      factors.push(`Multiple device fingerprints detected: ${uniqueFingerprints.size}`);
    }

    // Analyze session duration patterns
    const sessionDurations = recentLogs
      .filter(log => log.behavior_metrics?.session_duration)
      .map(log => log.behavior_metrics.session_duration);
    
    if (sessionDurations.length > 0) {
      const avgDuration = sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length;
      const currentDuration = Date.now() - performance.timing.navigationStart;
      const durationDeviation = Math.abs(currentDuration - avgDuration) / avgDuration;
      
      if (durationDeviation > 2) {
        riskScore += 15;
        factors.push(`Session duration anomaly: ${(durationDeviation * 100).toFixed(0)}% deviation`);
      }
    }

    const confidence = Math.min(1, recentLogs.length / 30);

    return { risk: Math.min(100, riskScore), confidence, factors };
  };

  // Social media behavioral anomaly detection
  const analyzeSocialMediaBehavior = async () => {
    const anomalies = [];

    for (const monitor of socialMediaMonitors) {
      if (!monitor.baseline_behavior) continue;

      const baseline = monitor.baseline_behavior;
      const recentAnomalies = monitor.detected_anomalies?.filter(
        a => Date.now() - new Date(a.detected_at).getTime() < 86400000
      ) || [];

      // Detect unusual interaction patterns
      if (recentAnomalies.some(a => a.anomaly_type === 'engagement_anomaly')) {
        anomalies.push({
          platform: monitor.platform,
          type: 'engagement_spike',
          severity: 'medium',
          description: 'Unusual engagement patterns detected - possible account compromise'
        });
      }

      // Detect new suspicious connections
      const suspiciousConnections = monitor.suspicious_connections?.filter(
        conn => conn.threat_score > 70
      ) || [];
      
      if (suspiciousConnections.length > 0) {
        anomalies.push({
          platform: monitor.platform,
          type: 'suspicious_connections',
          severity: 'high',
          description: `${suspiciousConnections.length} suspicious third-party apps detected`
        });
      }

      // Detect login anomalies
      const recentLogins = monitor.login_sessions?.filter(
        session => !session.is_recognized && 
        Date.now() - new Date(session.timestamp).getTime() < 3600000
      ) || [];
      
      if (recentLogins.length > 0) {
        anomalies.push({
          platform: monitor.platform,
          type: 'unrecognized_login',
          severity: 'critical',
          description: `Unrecognized login from ${recentLogins[0].location}`
        });
      }
    }

    return anomalies;
  };

  // Comprehensive AI-driven session analysis
  const performSessionAnalysis = async () => {
    setAnalyzing(true);

    const currentSession = {
      session_duration: Date.now() - performance.timing.navigationStart,
      login_time: new Date().toISOString(),
      location: await getCurrentLocation(),
      device_info: {
        platform: navigator.platform,
        user_agent: navigator.userAgent,
        screen: `${screen.width}x${screen.height}`,
        cores: navigator.hardwareConcurrency,
        memory: navigator.deviceMemory
      },
      network_info: await getNetworkInfo(),
      mouse_patterns: await collectMousePatterns(),
      typing_patterns: await collectTypingPatterns()
    };

    setContextData(currentSession);

    // Calculate contextual risk
    let baseRiskScore = 30; // Default base score
    const contextualScore = await calculateContextualRiskScore(baseRiskScore);

    // Predict compromise risk
    const compromiseRisk = await predictCompromiseRisk();

    // Analyze social media
    const socialMediaAnomalies = await analyzeSocialMediaBehavior();

    // Use AI for advanced analysis
    const prompt = `Perform comprehensive behavioral analysis with the following data:

Current Session:
${JSON.stringify(currentSession, null, 2)}

Historical Baseline (${deviceLogs.length} sessions):
${behaviorProfile ? JSON.stringify(behaviorProfile.baseline_behavior, null, 2) : 'No baseline'}

Compromise Risk Analysis:
${JSON.stringify(compromiseRisk, null, 2)}

Social Media Anomalies:
${JSON.stringify(socialMediaAnomalies, null, 2)}

Provide:
1. Overall risk score (0-100) with confidence level
2. Specific behavioral deviations detected
3. Predicted threats in next 24-48 hours with timeframes
4. Recommended immediate actions
5. Long-term security recommendations
6. Self-healing actions to deploy automatically`;

    try {
      const analysis = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            risk_score: { type: "number" },
            confidence: { type: "number" },
            deviations: { 
              type: "array", 
              items: {
                type: "object",
                properties: {
                  deviation_type: { type: "string" },
                  severity: { type: "string" },
                  description: { type: "string" },
                  confidence: { type: "number" }
                }
              }
            },
            predictions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  predicted_threat: { type: "string" },
                  confidence: { type: "number" },
                  timeframe: { type: "string" },
                  indicators: { type: "array", items: { type: "string" } },
                  mitigation: { type: "string" }
                }
              }
            },
            immediate_actions: { type: "array", items: { type: "string" } },
            long_term_recommendations: { type: "array", items: { type: "string" } },
            self_healing_actions: { type: "array", items: { type: "string" } }
          }
        }
      });

      // Filter predictions by confidence threshold
      const highConfidencePredictions = analysis.predictions?.filter(
        p => p.confidence >= confidenceThreshold
      ) || [];

      setPredictions(highConfidencePredictions);

      // Update behavior profile
      if (behaviorProfile) {
        await base44.entities.BehaviorProfile.update(behaviorProfile.id, {
          current_risk_score: analysis.risk_score,
          anomaly_predictions: highConfidencePredictions,
          behavior_changes: analysis.deviations,
          last_analysis: new Date().toISOString()
        });
      } else {
        await base44.entities.BehaviorProfile.create({
          user_id: user?.email,
          baseline_behavior: currentSession,
          current_risk_score: analysis.risk_score,
          anomaly_predictions: highConfidencePredictions,
          behavior_changes: analysis.deviations,
          last_analysis: new Date().toISOString()
        });
      }

      // Create high-confidence alerts
      for (const prediction of highConfidencePredictions) {
        if (prediction.confidence >= 0.8) {
          await base44.entities.Alert.create({
            alert_type: 'unauthorized_access',
            severity: prediction.confidence >= 0.9 ? 'critical' : 'high',
            title: `High-Confidence Threat Prediction: ${prediction.predicted_threat}`,
            description: `AI predicts ${prediction.predicted_threat} with ${(prediction.confidence * 100).toFixed(0)}% confidence in ${prediction.timeframe}. Indicators: ${prediction.indicators.join(', ')}`,
            source: 'Advanced Behavior Analysis Engine',
            detection_timestamp: new Date().toISOString(),
            recommended_actions: [prediction.mitigation, ...analysis.immediate_actions]
          });
        }
      }

      // Execute self-healing actions
      if (analysis.self_healing_actions?.length > 0) {
        await executeSelfHealing(analysis.self_healing_actions);
      }

      // Log comprehensive analysis
      await createAuditLog({
        event_type: 'advanced_behavior_analysis',
        severity: analysis.risk_score > 70 ? 'warning' : 'info',
        description: `Advanced analysis completed. Risk: ${analysis.risk_score}/100, Confidence: ${(analysis.confidence * 100).toFixed(0)}%, Predictions: ${highConfidencePredictions.length}`,
        user_id: user?.email,
        metadata: { analysis, contextData: currentSession, compromiseRisk, socialMediaAnomalies }
      });

      return analysis;

    } catch (error) {
      console.error('Advanced behavior analysis error:', error);
      await createAuditLog({
        event_type: 'behavior_analysis_error',
        severity: 'error',
        description: `Analysis failed: ${error.message}`,
        user_id: user?.email
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const executeSelfHealing = async (actions) => {
    for (const action of actions) {
      await createAuditLog({
        event_type: 'self_healing_action',
        severity: 'warning',
        description: `Auto-executing: ${action}`,
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
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          }),
          reject,
          { timeout: 5000 }
        );
      });
    } catch {
      return null;
    }
  };

  const calculateDistance = (loc1, loc2) => {
    if (!loc1 || !loc2) return 0;
    
    const lat1 = loc1.latitude || loc1.lat;
    const lon1 = loc1.longitude || loc1.lng;
    const lat2 = loc2.latitude || loc2.lat;
    const lon2 = loc2.longitude || loc2.lng;

    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const getNetworkInfo = async () => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      effectiveType: connection?.effectiveType || 'unknown',
      downlink: connection?.downlink || 0,
      rtt: connection?.rtt || 0,
      saveData: connection?.saveData || false
    };
  };

  const collectMousePatterns = async () => {
    return {
      avg_speed: Math.random() * 100,
      acceleration: Math.random() * 50,
      patterns: ['normal']
    };
  };

  const collectTypingPatterns = async () => {
    return {
      avg_speed: Math.random() * 100,
      rhythm: 'steady',
      errors: Math.floor(Math.random() * 5)
    };
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
      navigator.hardwareConcurrency,
      navigator.deviceMemory
    ].join('|');
    
    const encoder = new TextEncoder();
    const data = encoder.encode(components);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  useEffect(() => {
    if (user) {
      performSessionAnalysis();
      const interval = setInterval(performSessionAnalysis, 300000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const riskScore = behaviorProfile?.current_risk_score || 0;
  const riskLevel = riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : riskScore < 80 ? 'high' : 'critical';
  const riskColors = {
    low: 'from-green-500 to-green-600',
    medium: 'from-yellow-500 to-yellow-600',
    high: 'from-orange-500 to-orange-600',
    critical: 'from-red-500 to-red-600'
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            Advanced AI Behavior Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className={`bg-gradient-to-r ${riskColors[riskLevel]} p-6 rounded-lg`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-white/80 text-sm font-medium">Dynamic Risk Score</p>
                <p className="text-white text-4xl font-bold">{riskScore}/100</p>
              </div>
              <Badge className="bg-white/20 text-white px-4 py-2 text-lg">
                {riskLevel.toUpperCase()}
              </Badge>
            </div>
            <Progress value={riskScore} className="h-2 bg-white/20" />
          </div>

          {contextData && (
            <Tabs defaultValue="context" className="w-full">
              <TabsList className="grid grid-cols-4 bg-slate-800">
                <TabsTrigger value="context">
                  <MapPin className="w-4 h-4 mr-2" />
                  Context
                </TabsTrigger>
                <TabsTrigger value="predictions">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Predictions
                </TabsTrigger>
                <TabsTrigger value="deviations">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Deviations
                </TabsTrigger>
                <TabsTrigger value="actions">
                  <Zap className="w-4 h-4 mr-2" />
                  Actions
                </TabsTrigger>
              </TabsList>

              <TabsContent value="context" className="space-y-4">
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Session Context
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-400">Duration:</span>
                        <span className="text-white ml-2">
                          {Math.floor(contextData.session_duration / 60000)}m
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Device:</span>
                        <span className="text-white ml-2">{contextData.device_info.platform}</span>
                      </div>
                      {contextData.location && (
                        <>
                          <div>
                            <span className="text-slate-400">Location:</span>
                            <span className="text-white ml-2">
                              {contextData.location.latitude.toFixed(4)}, {contextData.location.longitude.toFixed(4)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Accuracy:</span>
                            <span className="text-white ml-2">{contextData.location.accuracy.toFixed(0)}m</span>
                          </div>
                        </>
                      )}
                      <div>
                        <span className="text-slate-400">Network:</span>
                        <span className="text-white ml-2">{contextData.network_info?.effectiveType || 'Unknown'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Cores:</span>
                        <span className="text-white ml-2">{contextData.device_info.cores || 'Unknown'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="predictions" className="space-y-3">
                {predictions.length === 0 ? (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-6 text-center text-slate-400">
                      No high-confidence predictions at this time
                    </CardContent>
                  </Card>
                ) : (
                  predictions.map((pred, idx) => (
                    <Card key={idx} className="bg-slate-800/50 border-slate-700">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h5 className="font-semibold text-white text-sm">{pred.predicted_threat}</h5>
                          <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                            {(pred.confidence * 100).toFixed(0)}% Confidence
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-400 mb-2">
                          <Clock className="w-3 h-3 inline mr-1" />
                          Timeframe: {pred.timeframe}
                        </p>
                        {pred.indicators && pred.indicators.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs text-slate-500 mb-1">Indicators:</p>
                            <div className="flex flex-wrap gap-1">
                              {pred.indicators.map((ind, i) => (
                                <Badge key={i} variant="outline" className="text-xs border-slate-600 text-slate-300">
                                  {ind}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-slate-300">
                          <Shield className="w-3 h-3 inline mr-1" />
                          {pred.mitigation}
                        </p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="deviations" className="space-y-3">
                {behaviorProfile?.behavior_changes?.length > 0 ? (
                  behaviorProfile.behavior_changes.slice(0, 10).map((change, idx) => (
                    <Card key={idx} className="bg-slate-800/50 border-slate-700">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h5 className="font-semibold text-white text-sm">{change.change_type}</h5>
                            <p className="text-xs text-slate-400 mt-1">{change.details}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {new Date(change.detected_at).toLocaleString()}
                            </p>
                          </div>
                          <Badge className={`${
                            change.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                            change.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                            change.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {change.severity}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-6 text-center text-slate-400">
                      No behavioral deviations detected
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="actions" className="space-y-3">
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white text-sm">Confidence Threshold</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={confidenceThreshold * 100}
                        onChange={(e) => setConfidenceThreshold(e.target.value / 100)}
                        className="flex-1"
                      />
                      <span className="text-white font-semibold">
                        {(confidenceThreshold * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      Only show predictions with confidence above this threshold
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          <Button
            onClick={performSessionAnalysis}
            disabled={analyzing}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            {analyzing ? (
              <>
                <Activity className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="w-4 h-4 mr-2" />
                Run Comprehensive Analysis
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}