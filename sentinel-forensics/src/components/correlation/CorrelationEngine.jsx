import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Eye, Car, Users } from "lucide-react";
import { format } from "date-fns";

export default function CorrelationEngine() {
  const [correlations, setCorrelations] = useState([]);

  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence'],
    queryFn: () => base44.entities.Evidence.list('-created_date', 100),
  });

  const { data: networkLogs = [] } = useQuery({
    queryKey: ['network-logs'],
    queryFn: () => base44.entities.NetworkLog.list('-timestamp', 100),
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => base44.entities.Alert.list('-detection_timestamp', 50),
  });

  useEffect(() => {
    if (evidence.length > 0 || networkLogs.length > 0 || alerts.length > 0) {
      const newCorrelations = analyzeForPatterns();
      setCorrelations(newCorrelations);
    }
  }, [evidence, networkLogs, alerts]);

  const analyzeForPatterns = () => {
    const patterns = [];

    // Detect repeated vehicle sightings
    const vehicleMetadata = evidence
      .filter(e => e.metadata?.plate)
      .reduce((acc, e) => {
        const plate = e.metadata.plate;
        if (!acc[plate]) acc[plate] = [];
        acc[plate].push(e);
        return acc;
      }, {});

    Object.entries(vehicleMetadata).forEach(([plate, sightings]) => {
      if (sightings.length >= 3) {
        patterns.push({
          type: 'vehicle_tail',
          severity: 'high',
          title: `Vehicle Tail Detected: ${plate}`,
          description: `Vehicle ${plate} detected ${sightings.length} times in evidence. POSSIBLE SURVEILLANCE.`,
          data: { plate, sightings: sightings.length, evidence: sightings },
          timestamp: new Date().toISOString(),
          icon: Car
        });
      }
    });

    // Detect repeated faces
    const faceDetections = evidence.filter(e => 
      e.metadata?.people_detected > 0 || 
      e.description?.toLowerCase().includes('person') ||
      e.description?.toLowerCase().includes('face')
    );

    if (faceDetections.length >= 3) {
      patterns.push({
        type: 'repeated_person',
        severity: 'medium',
        title: 'Repeated Person Detections',
        description: `Same person possibly detected ${faceDetections.length} times in captured evidence.`,
        data: { detections: faceDetections.length },
        timestamp: new Date().toISOString(),
        icon: Users
      });
    }

    // Detect suspicious network patterns
    const suspiciousIPs = networkLogs
      .filter(log => log.is_suspicious)
      .reduce((acc, log) => {
        if (!acc[log.source_ip]) acc[log.source_ip] = 0;
        acc[log.source_ip]++;
        return acc;
      }, {});

    Object.entries(suspiciousIPs).forEach(([ip, count]) => {
      if (count >= 5) {
        patterns.push({
          type: 'persistent_threat',
          severity: 'critical',
          title: `Persistent Threat: ${ip}`,
          description: `IP ${ip} has ${count} suspicious network activities. Possible ongoing attack.`,
          data: { ip, occurrences: count },
          timestamp: new Date().toISOString(),
          icon: AlertTriangle
        });
      }
    });

    // Detect time-based patterns
    const recentAlerts = alerts.filter(a => 
      new Date() - new Date(a.detection_timestamp) < 3600000 // Last hour
    );

    if (recentAlerts.length >= 5) {
      patterns.push({
        type: 'spike_activity',
        severity: 'high',
        title: 'Alert Spike Detected',
        description: `${recentAlerts.length} security alerts in the past hour. Possible coordinated threat.`,
        data: { count: recentAlerts.length, alerts: recentAlerts },
        timestamp: new Date().toISOString(),
        icon: TrendingUp
      });
    }

    // Detect surveillance equipment correlation
    const surveillanceEvidence = evidence.filter(e =>
      e.metadata?.surveillance_equipment?.length > 0 ||
      e.description?.toLowerCase().includes('camera') ||
      e.description?.toLowerCase().includes('surveillance')
    );

    if (surveillanceEvidence.length >= 2) {
      patterns.push({
        type: 'surveillance_detected',
        severity: 'high',
        title: 'Multiple Surveillance Equipment Detected',
        description: `${surveillanceEvidence.length} instances of surveillance equipment detected in area.`,
        data: { count: surveillanceEvidence.length },
        timestamp: new Date().toISOString(),
        icon: Eye
      });
    }

    return patterns.sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
  };

  const severityColors = {
    critical: 'bg-red-500/20 text-red-400 border-red-500',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500'
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Correlation Engine</h1>
        <p className="text-slate-400">AI-powered pattern detection and threat correlation</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400">Total Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-white">{correlations.length}</span>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400">Critical Threats</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-red-400">
              {correlations.filter(c => c.severity === 'critical').length}
            </span>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400">Vehicle Tails</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-orange-400">
              {correlations.filter(c => c.type === 'vehicle_tail').length}
            </span>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-400">Surveillance</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-yellow-400">
              {correlations.filter(c => c.type === 'surveillance_detected').length}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Detected Patterns</CardTitle>
        </CardHeader>
        <CardContent>
          {correlations.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <TrendingUp className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p>No correlation patterns detected</p>
              <p className="text-sm mt-2">The system will automatically detect suspicious patterns</p>
            </div>
          ) : (
            <div className="space-y-4">
              {correlations.map((correlation, idx) => {
                const Icon = correlation.icon;
                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border-l-4 ${severityColors[correlation.severity]} bg-slate-800/50`}
                  >
                    <div className="flex items-start gap-4">
                      <Icon className={`w-6 h-6 ${correlation.severity === 'critical' ? 'text-red-400 animate-pulse' : ''}`} />
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-white">{correlation.title}</h4>
                          <Badge className={severityColors[correlation.severity]}>
                            {correlation.severity.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-300 mb-2">{correlation.description}</p>
                        <p className="text-xs text-slate-500">
                          Detected: {format(new Date(correlation.timestamp), 'PPp')}
                        </p>
                        {correlation.data && (
                          <div className="mt-3 p-3 bg-slate-900 rounded">
                            <pre className="text-xs text-slate-400 overflow-auto">
                              {JSON.stringify(correlation.data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}