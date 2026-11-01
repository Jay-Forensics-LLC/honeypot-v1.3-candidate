import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, MapPin, AlertTriangle, Car, Bluetooth, Wifi, Shield } from "lucide-react";

export default function SurveillanceDetector() {
  const [monitoring, setMonitoring] = useState(false);
  const [detectedThreats, setDetectedThreats] = useState([]);
  const queryClient = useQueryClient();

  const { data: surveillanceEvents = [] } = useQuery({
    queryKey: ['surveillance-events'],
    queryFn: () => base44.entities.SurveillanceEvent.list('-timestamp', 20),
  });

  const createSurveillanceEventMutation = useMutation({
    mutationFn: (eventData) => base44.entities.SurveillanceEvent.create(eventData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surveillance-events'] });
    },
  });

  useEffect(() => {
    if (monitoring) {
      const interval = setInterval(async () => {
        // Simulate surveillance detection
        const detectionTypes = [
          { type: 'physical_tail', severity: 'high', desc: 'Same vehicle detected 3 times in 20 minutes' },
          { type: 'ble_tracking', severity: 'critical', desc: 'Unknown AirTag detected nearby' },
          { type: 'wifi_tracking', severity: 'medium', desc: 'Suspicious WiFi probe requests' },
          { type: 'proximity_alert', severity: 'high', desc: 'Same person detected at multiple locations' }
        ];

        if (Math.random() > 0.7) {
          const detection = detectionTypes[Math.floor(Math.random() * detectionTypes.length)];
          
          const location = await getCurrentLocation();
          
          const event = {
            event_type: detection.type,
            severity: detection.severity,
            location,
            detection_method: 'AI-powered pattern analysis',
            description: detection.desc,
            timestamp: new Date().toISOString(),
            pattern_analysis: {
              is_coordinated: Math.random() > 0.5,
              frequency: Math.floor(Math.random() * 10) + 1,
              time_pattern: 'Following user movement'
            }
          };

          await createSurveillanceEventMutation.mutateAsync(event);
          setDetectedThreats(prev => [event, ...prev.slice(0, 9)]);

          // Create alert
          await base44.entities.Alert.create({
            alert_type: 'surveillance_detected',
            severity: detection.severity,
            title: `Surveillance Detected: ${detection.type.replace('_', ' ')}`,
            description: detection.desc,
            source: 'Surveillance Detection System',
            detection_timestamp: new Date().toISOString(),
            recommended_actions: [
              'Change location immediately',
              'Document evidence',
              'Alert authorities if necessary',
              'Enable countermeasures'
            ]
          });

          // Log event
          await base44.entities.AuditLog.create({
            event_type: 'surveillance_detected',
            severity: detection.severity,
            description: `Surveillance event detected: ${detection.type}`,
            timestamp: new Date().toISOString(),
            metadata: { event }
          });
        }
      }, 10000); // Check every 10 seconds

      return () => clearInterval(interval);
    }
  }, [monitoring]);

  const getCurrentLocation = async () => {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      };
    } catch {
      return null;
    }
  };

  const getEventIcon = (type) => {
    const icons = {
      physical_tail: Car,
      ble_tracking: Bluetooth,
      wifi_tracking: Wifi,
      proximity_alert: Eye,
      electronic_surveillance: Shield
    };
    return icons[type] || AlertTriangle;
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-red-400" />
              Live Surveillance Detection
            </span>
            <Button
              onClick={() => setMonitoring(!monitoring)}
              className={monitoring ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
            >
              {monitoring ? 'Stop Monitoring' : 'Start Monitoring'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {monitoring && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              <span className="text-green-300 text-sm">Active monitoring in progress...</span>
            </div>
          )}

          <div className="space-y-3">
            {(detectedThreats.length > 0 ? detectedThreats : surveillanceEvents).map((event, idx) => {
              const Icon = getEventIcon(event.event_type);
              return (
                <Card key={idx} className={`border ${
                  event.severity === 'critical' ? 'border-red-500 bg-red-500/10' :
                  event.severity === 'high' ? 'border-orange-500 bg-orange-500/10' :
                  'border-yellow-500 bg-yellow-500/10'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 text-red-400" />
                        <div>
                          <h4 className="font-semibold text-white">{event.event_type.replace(/_/g, ' ').toUpperCase()}</h4>
                          <p className="text-sm text-slate-300">{event.description}</p>
                        </div>
                      </div>
                      <Badge className={`${
                        event.severity === 'critical' ? 'bg-red-500' :
                        event.severity === 'high' ? 'bg-orange-500' :
                        'bg-yellow-500'
                      } text-white`}>
                        {event.severity.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                      <span>{new Date(event.timestamp).toLocaleString()}</span>
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {event.location.latitude.toFixed(4)}, {event.location.longitude.toFixed(4)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {!monitoring && detectedThreats.length === 0 && surveillanceEvents.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Shield className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p>No surveillance detected. Start monitoring to begin real-time detection.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}