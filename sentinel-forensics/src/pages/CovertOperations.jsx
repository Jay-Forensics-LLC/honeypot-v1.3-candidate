
import { useState } from "react";
import ProtectedRoute from '../components/security/ProtectedRoute';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Eye,
  EyeOff,
  Shield,
  MapPin,
  Wifi,
  Bluetooth,
  Activity,
  AlertTriangle,
  Radio,
  Network,
  Target,
  Play,
  StopCircle,
  Loader2,
  Globe,
  FolderOpen,
  Database,
  Plus,
  Zap
} from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function CovertOperations() {
  const queryClient = useQueryClient();
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLon, setGpsLon] = useState("");
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [stopOperationConfirm, setStopOperationConfirm] = useState(null);
  const [newHoneypot, setNewHoneypot] = useState({
    honeypot_type: 'web_endpoint',
    hostname: '',
    ip_address: '',
    port: 8080
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
    retry: false
  });

  const { data: operations = [] } = useQuery({
    queryKey: ['covert-operations'],
    queryFn: async () => {
      try {
        return await base44.entities.CovertOperation.list('-started_at', 100);
      } catch (error) {
        console.error('Error fetching operations:', error);
        return [];
      }
    },
    initialData: [],
  });

  const { data: honeypots = [], isLoading: honeypotsLoading } = useQuery({
    queryKey: ['honeypots'],
    queryFn: async () => {
      try {
        return await base44.entities.Honeypot.list('-created_at', 100);
      } catch (error) {
        console.error('Error fetching honeypots:', error);
        return [];
      }
    },
    initialData: [],
  });

  const createOperationMutation = useMutation({
    mutationFn: (operationData) => base44.entities.CovertOperation.create(operationData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['covert-operations'] });
    },
  });

  const stopOperationMutation = useMutation({
    mutationFn: async (operationId) => {
      await base44.entities.CovertOperation.update(operationId, {
        status: 'completed',
        ended_at: new Date().toISOString()
      });

      await base44.entities.AuditLog.create({
        event_type: 'covert_operation_stopped',
        severity: 'info',
        description: 'Covert operation terminated by user',
        user_id: user?.email || 'system',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          operation_id: operationId
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['covert-operations'] });
      setStopOperationConfirm(null);
      toast.success('Operation stopped successfully');
    },
    onError: (error) => {
      console.error('Failed to stop operation:', error);
      toast.error('Failed to stop operation');
    }
  });

  const deployHoneypotMutation = useMutation({
    mutationFn: async () => {
      const honeypotName = newHoneypot.hostname || `Honeypot-${newHoneypot.honeypot_type}-${Date.now()}`;
      const honeypotIp = newHoneypot.ip_address || `192.168.1.${Math.floor(Math.random() * 254) + 1}`;
      const honeypotPort = newHoneypot.port || 8080;

      const createdHoneypot = await base44.entities.Honeypot.create({
        honeypot_id: `HP-${Date.now()}`,
        honeypot_name: honeypotName,
        honeypot_type: newHoneypot.honeypot_type,
        status: 'active',
        deployment_config: {
          hostname: honeypotName,
          ip_address: honeypotIp,
          port: honeypotPort,
          protocol: 'HTTP',
          decoy_services: ['SSH', 'FTP', 'HTTP'],
          vulnerability_profile: 'medium'
        },
        honeytokens_deployed: [],
        interactions: [],
        alerts_generated: 0,
        forensic_evidence_collected: [],
        deception_level: 'high',
        created_at: new Date().toISOString()
      });

      await base44.entities.AuditLog.create({
        event_type: 'honeypot_deployed',
        severity: 'info',
        description: `Honeypot "${createdHoneypot.honeypot_name}" (${newHoneypot.honeypot_type}) deployed successfully`,
        user_id: user?.email || 'system',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          honeypot_id: createdHoneypot.honeypot_id,
          type: newHoneypot.honeypot_type,
          ip_address: honeypotIp
        }
      });

      return createdHoneypot;
    },
    onSuccess: (honeypot) => {
      queryClient.invalidateQueries({ queryKey: ['honeypots'] });
      setDeployDialogOpen(false);
      setNewHoneypot({
        honeypot_type: 'web_endpoint',
        hostname: '',
        ip_address: '',
        port: 8080
      });

      toast.success('Honeypot deployed successfully!', {
        description: `Honeypot "${honeypot.honeypot_name}" is now active and monitoring`,
        duration: 4000
      });
    },
    onError: (error) => {
      console.error('Failed to deploy honeypot:', error);
      toast.error('Failed to deploy honeypot', {
        description: 'Please check your configuration and try again'
      });
    }
  });

  const stopHoneypotMutation = useMutation({
    mutationFn: async (honeypotId) => {
      await base44.entities.Honeypot.update(honeypotId, {
        status: 'inactive'
      });

      await base44.entities.AuditLog.create({
        event_type: 'honeypot_stopped',
        severity: 'info',
        description: `Honeypot stopped`,
        user_id: user?.email || 'system',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          honeypot_id: honeypotId
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['honeypots'] });
      toast.success('Honeypot stopped');
    },
    onError: (error) => {
      console.error('Failed to stop honeypot:', error);
      toast.error('Failed to stop honeypot');
    }
  });

  const restartHoneypotMutation = useMutation({
    mutationFn: async (honeypotId) => {
      await base44.entities.Honeypot.update(honeypotId, {
        status: 'active'
      });

      await base44.entities.AuditLog.create({
        event_type: 'honeypot_restarted',
        severity: 'info',
        description: `Honeypot restarted`,
        user_id: user?.email || 'system',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          honeypot_id: honeypotId
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['honeypots'] });
      toast.success('Honeypot restarted');
    },
    onError: (error) => {
      console.error('Failed to restart honeypot:', error);
      toast.error('Failed to restart honeypot');
    }
  });

  const simulateAttackMutation = useMutation({
    mutationFn: async (honeypot) => {
      const attackerIP = `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
      const attackTypes = ['brute_force', 'sql_injection', 'directory_traversal', 'credential_stuffing', 'port_scan'];
      const attackType = attackTypes[Math.floor(Math.random() * attackTypes.length)];

      const ttps = {
        brute_force: ['T1110.001', 'T1078'],
        sql_injection: ['T1190', 'T1213'],
        directory_traversal: ['T1083', 'T1005'],
        credential_stuffing: ['T1078', 'T1110.004'],
        port_scan: ['T1046', 'T1595']
      };

      const newInteraction = {
        timestamp: new Date().toISOString(),
        source_ip: attackerIP,
        action: attackType.replace(/_/g, ' '),
        payload: `Simulated ${attackType} attack`,
        ttps_observed: ttps[attackType] || [],
        forensic_snapshot_id: `SNAP-${Date.now()}`
      };

      const updatedInteractions = [...(honeypot.interactions || []), newInteraction];
      const updatedAlertsCount = (honeypot.alerts_generated || 0) + 1;

      await base44.entities.Honeypot.update(honeypot.id, {
        interactions: updatedInteractions,
        alerts_generated: updatedAlertsCount,
        status: 'compromised',
        attacker_profile: {
          fingerprint: `FP-${attackerIP.replace(/\./g, '-')}`,
          tools_used: ['nmap', 'metasploit', 'hydra'],
          attack_sophistication: Math.random() > 0.5 ? 'high' : 'medium',
          apt_attribution: Math.random() > 0.7 ? 'APT28' : 'Unknown'
        }
      });

      await base44.entities.Alert.create({
        alert_type: 'unauthorized_access',
        severity: 'high',
        title: `Honeypot Attack Detected: ${honeypot.honeypot_name || honeypot.honeypot_id}`,
        description: `Simulated ${attackType} attack from ${attackerIP} detected on honeypot "${honeypot.honeypot_name || honeypot.honeypot_id}"`,
        source: attackerIP,
        detection_timestamp: new Date().toISOString(),
        status: 'new',
        threat_score: Math.floor(Math.random() * 30) + 70,
        affected_systems: [
          String(honeypot.honeypot_name || honeypot.honeypot_id || 'Unknown Honeypot'),
          String(honeypot.deployment_config?.hostname || 'Unknown Host'),
          String(honeypot.deployment_config?.ip_address || 'Unknown IP')
        ].filter(Boolean),
        recommended_actions: [
          'Analyze attack patterns',
          'Update threat intelligence',
          'Review similar honeypots',
          'Block source IP if verified threat'
        ]
      });

      await base44.entities.AuditLog.create({
        event_type: 'honeypot_attack_simulated',
        severity: 'warning',
        description: `Simulated attack on honeypot "${honeypot.honeypot_name || honeypot.honeypot_id}"`,
        user_id: user?.email || 'system',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          honeypot_id: honeypot.honeypot_id,
          attacker_ip: attackerIP,
          attack_type: attackType,
          ttps: ttps[attackType]
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['honeypots'] });
      toast.success('Attack simulated successfully');
    },
    onError: (error) => {
      console.error('Failed to simulate attack:', error);
      toast.error('Failed to simulate attack', {
        description: error.message
      });
    }
  });

  const activeOperations = operations.filter(op => op.status === 'active');
  const surveillanceDetected = operations.some(op =>
    op.surveillance_detection?.anomalies_detected?.length > 0 ||
    op.surveillance_detection?.c2_traffic_detected ||
    op.surveillance_detection?.jamming_detected
  );

  const totalHoneypots = honeypots.length;
  const activeHoneypots = honeypots.filter(h => h.status === 'active').length;
  const compromisedHoneypots = honeypots.filter(h => h.status === 'compromised').length;
  const totalAlerts = honeypots.reduce((sum, h) => sum + (h.alerts_generated || 0), 0);

  const startGPSSpoofing = () => {
    if (!gpsLat || !gpsLon) {
      toast.error("Please enter GPS coordinates");
      return;
    }

    const lat = parseFloat(gpsLat);
    const lon = parseFloat(gpsLon);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      toast.error("Invalid GPS coordinates. Latitude: -90 to 90, Longitude: -180 to 180");
      return;
    }

    createOperationMutation.mutate({
      operation_id: `GPS-SPOOF-${Date.now()}`,
      operation_type: "gps_spoofing",
      status: "active",
      stealth_level: "high",
      gps_spoofing: {
        enabled: true,
        fake_location: {
          latitude: lat,
          longitude: lon,
          accuracy: 10
        },
        movement_simulation: {
          enabled: true,
          speed_kmh: 50,
          route_pattern: "realistic"
        }
      },
      started_at: new Date().toISOString()
    });

    toast.success('GPS spoofing activated');
    setGpsLat('');
    setGpsLon('');
  };

  const startSignalCloaking = () => {
    createOperationMutation.mutate({
      operation_id: `SIGNAL-CLOAK-${Date.now()}`,
      operation_type: "signal_cloaking",
      status: "active",
      stealth_level: "maximum",
      signal_cloaking: {
        mac_address_randomization: true,
        bluetooth_name_randomization: true,
        wifi_honeypots_deployed: 5,
        decoy_signals_active: true,
        rotation_interval_seconds: 120
      },
      started_at: new Date().toISOString()
    });

    toast.success('Signal cloaking activated - MAC/BT randomization enabled');
  };

  const startSurveillanceDetection = () => {
    createOperationMutation.mutate({
      operation_id: `SURV-DETECT-${Date.now()}`,
      operation_type: "surveillance_detection",
      status: "active",
      stealth_level: "maximum",
      surveillance_detection: {
        network_monitoring: true,
        signal_strength_monitoring: true,
        rf_sniffer_active: true,
        anomalies_detected: [],
        c2_traffic_detected: false,
        jamming_detected: false
      },
      started_at: new Date().toISOString()
    });

    toast.success('Surveillance detection activated');
  };

  const getTypeIcon = (type) => {
    const icons = {
      ssh_server: Network,
      web_endpoint: Globe,
      smb_share: FolderOpen,
      database: Database,
      ble_peripheral: Bluetooth,
      api_endpoint: Zap
    };
    return icons[type] || Network;
  };

  return (
    <ProtectedRoute
      requiredTier="pro"
      requiredFeature="covert_operations"
      featureName="Covert Operations"
    >
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-20 md:pb-6">
        {/* Header - Mobile optimized */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
          <div className="flex items-start md:items-center gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-slate-700 via-slate-800 to-black rounded-lg flex items-center justify-center shadow-lg shadow-slate-900/50 flex-shrink-0">
              <EyeOff className="w-5 h-5 md:w-7 md:h-7 text-slate-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl md:text-3xl font-bold text-white">Covert Operations</h1>
              <p className="text-xs md:text-sm text-slate-400 mt-0.5 md:mt-1">Counter-Surveillance & Signal Deception</p>
            </div>
          </div>
          <Button
            onClick={() => setDeployDialogOpen(true)}
            className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 w-full md:w-auto h-10 md:h-11 text-sm md:text-base"
          >
            <Plus className="w-4 h-4 mr-2" />
            Deploy Honeypot
          </Button>
        </div>

        {surveillanceDetected && (
          <Alert className="bg-red-500/10 border-red-500/50 animate-pulse">
            <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-red-500" />
            <AlertDescription className="text-red-400 font-bold text-xs md:text-sm">
              ⚠️ SURVEILLANCE DETECTED
            </AlertDescription>
          </Alert>
        )}

        {/* Statistics - Mobile optimized */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
            <CardContent className="p-3 md:p-4">
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                <Activity className="w-6 h-6 md:w-8 md:h-8 text-green-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl md:text-2xl font-bold text-white">{activeOperations.length}</p>
                  <p className="text-[10px] md:text-xs text-slate-400 truncate">Active Ops</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
            <CardContent className="p-3 md:p-4">
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                <Shield className="w-6 h-6 md:w-8 md:h-8 text-blue-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl md:text-2xl font-bold text-white">{activeHoneypots}</p>
                  <p className="text-[10px] md:text-xs text-slate-400 truncate">Honeypots</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
            <CardContent className="p-3 md:p-4">
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                <Eye className="w-6 h-6 md:w-8 md:h-8 text-orange-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl md:text-2xl font-bold text-white">{compromisedHoneypots}</p>
                  <p className="text-[10px] md:text-xs text-slate-400 truncate">Attacks</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
            <CardContent className="p-3 md:p-4">
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                <AlertTriangle className="w-6 h-6 md:w-8 md:h-8 text-red-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl md:text-2xl font-bold text-white">{totalAlerts}</p>
                  <p className="text-[10px] md:text-xs text-slate-400 truncate">Alerts</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs - Mobile optimized */}
        <Tabs defaultValue="surveillance" className="space-y-4 md:space-y-6">
          <ScrollArea className="w-full">
            <TabsList className="bg-slate-900/50 grid w-full grid-cols-2 md:grid-cols-4 h-auto">
              <TabsTrigger value="surveillance" className="text-xs md:text-sm py-2 md:py-2.5">Surveillance</TabsTrigger>
              <TabsTrigger value="gps" className="text-xs md:text-sm py-2 md:py-2.5">GPS</TabsTrigger>
              <TabsTrigger value="signals" className="text-xs md:text-sm py-2 md:py-2.5">Signals</TabsTrigger>
              <TabsTrigger value="honeypots" className="text-xs md:text-sm py-2 md:py-2.5">Honeypots</TabsTrigger>
            </TabsList>
          </ScrollArea>

          <TabsContent value="surveillance" className="space-y-4 md:space-y-6 mt-4">
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-white flex items-center gap-2 text-base md:text-lg">
                  <Eye className="w-4 h-4 md:w-5 md:h-5 text-orange-400" />
                  Real-Time Surveillance Detection
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0 space-y-4">
                <Alert className="bg-blue-500/10 border-blue-500/30">
                  <Activity className="h-4 w-4 text-blue-400" />
                  <AlertDescription className="text-blue-400 text-xs md:text-sm">
                    <strong>Effectiveness: 85%</strong> - Monitors network anomalies, signal strength, RF spectrum, and C2 traffic patterns.
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={startSurveillanceDetection}
                  disabled={createOperationMutation.isPending || operations.some(op => op.operation_type === 'surveillance_detection' && op.status === 'active')}
                  className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 h-10 md:h-11 text-sm md:text-base"
                >
                  {createOperationMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4 mr-2" />
                  )}
                  {operations.some(op => op.operation_type === 'surveillance_detection' && op.status === 'active') ? 'Detection Active' : 'Start Detection'}
                </Button>

                {operations.filter(op => op.operation_type === 'surveillance_detection' && op.status === 'active').map(op => (
                  <div key={op.id} className="p-3 md:p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-0 mb-3">
                      <span className="font-semibold text-white text-sm md:text-base">Active Surveillance Scan</span>
                      <div className="flex gap-2">
                        <Badge className="bg-green-500 animate-pulse text-xs">SCANNING</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStopOperationConfirm(op)}
                          className="border-red-500/50 text-red-400 hover:bg-red-500/10 h-8 text-xs"
                        >
                          <StopCircle className="w-3 h-3 md:w-4 md:h-4 md:mr-1" />
                          <span className="hidden md:inline">Stop</span>
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 text-xs md:text-sm">
                      <div className="flex items-center gap-2">
                        <Network className="w-3 h-3 md:w-4 md:h-4 text-blue-400 flex-shrink-0" />
                        <span className="text-slate-300">
                          Network: {op.surveillance_detection?.network_monitoring ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Radio className="w-3 h-3 md:w-4 md:h-4 text-purple-400 flex-shrink-0" />
                        <span className="text-slate-300">
                          RF: {op.surveillance_detection?.rf_sniffer_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {op.surveillance_detection?.c2_traffic_detected ? (
                          <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 text-red-400 flex-shrink-0" />
                        ) : (
                          <Shield className="w-3 h-3 md:w-4 md:h-4 text-green-400 flex-shrink-0" />
                        )}
                        <span className="text-slate-300">
                          C2: {op.surveillance_detection?.c2_traffic_detected ? 'DETECTED' : 'Clear'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {op.surveillance_detection?.jamming_detected ? (
                          <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 text-red-400 flex-shrink-0" />
                        ) : (
                          <Shield className="w-3 h-3 md:w-4 md:h-4 text-green-400 flex-shrink-0" />
                        )}
                        <span className="text-slate-300">
                          Jamming: {op.surveillance_detection?.jamming_detected ? 'DETECTED' : 'Clear'}
                        </span>
                      </div>
                    </div>

                    {op.surveillance_detection?.anomalies_detected?.length > 0 && (
                      <Alert className="mt-3 bg-red-500/10 border-red-500/30">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                        <AlertDescription className="text-red-400 text-xs md:text-sm">
                          <span className="font-bold">{op.surveillance_detection.anomalies_detected.length} Anomalies Detected</span>
                          <ul className="mt-2 space-y-1 text-[10px] md:text-xs">
                            {op.surveillance_detection.anomalies_detected.map((anomaly, idx) => (
                              <li key={idx}>• {anomaly}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gps" className="space-y-4 md:space-y-6 mt-4">
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-white flex items-center gap-2 text-base md:text-lg">
                  <MapPin className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
                  GPS Location Spoofing
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0 space-y-4">
                <Alert className="bg-green-500/10 border-green-500/30">
                  <MapPin className="h-4 w-4 text-green-400" />
                  <AlertDescription className="text-green-400 text-xs md:text-sm">
                    <strong>Effectiveness: 95%</strong> - Broadcasts fake GPS coordinates with realistic movement simulation.
                  </AlertDescription>
                </Alert>

                <Alert className="bg-yellow-500/10 border-yellow-500/30">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  <AlertDescription className="text-yellow-400 text-xs md:text-sm">
                    Use responsibly. Misuse may violate local laws and regulations.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-xs md:text-sm">Fake Latitude</Label>
                    <Input
                      type="number"
                      step="0.000001"
                      value={gpsLat}
                      onChange={(e) => setGpsLat(e.target.value)}
                      placeholder="40.7128"
                      className="bg-slate-800 border-slate-700 text-white h-10 md:h-11 text-sm md:text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-xs md:text-sm">Fake Longitude</Label>
                    <Input
                      type="number"
                      step="0.000001"
                      value={gpsLon}
                      onChange={(e) => setGpsLon(e.target.value)}
                      placeholder="-74.0060"
                      className="bg-slate-800 border-slate-700 text-white h-10 md:h-11 text-sm md:text-base"
                    />
                  </div>
                </div>

                <Button
                  onClick={startGPSSpoofing}
                  disabled={createOperationMutation.isPending}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 h-10 md:h-11 text-sm md:text-base"
                >
                  {createOperationMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <MapPin className="w-4 h-4 mr-2" />
                  )}
                  Enable GPS Spoofing
                </Button>

                {operations.filter(op => op.operation_type === 'gps_spoofing' && op.status === 'active').map(op => (
                  <div key={op.id} className="p-3 md:p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                      <span className="font-semibold text-white text-sm md:text-base">GPS Spoofing Active</span>
                      <div className="flex gap-2">
                        <Badge className="bg-green-500 text-xs">ACTIVE</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStopOperationConfirm(op)}
                          className="border-red-500/50 text-red-400 hover:bg-red-500/10 h-8 text-xs"
                        >
                          <StopCircle className="w-3 h-3 md:w-4 md:h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs md:text-sm text-slate-300 space-y-1">
                      <p className="break-all">Location: {op.gps_spoofing?.fake_location?.latitude}, {op.gps_spoofing?.fake_location?.longitude}</p>
                      {op.gps_spoofing?.movement_simulation?.enabled && (
                        <p>Movement: {op.gps_spoofing.movement_simulation.speed_kmh} km/h</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signals" className="space-y-4 md:space-y-6 mt-4">
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-white flex items-center gap-2 text-base md:text-lg">
                  <Radio className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
                  Signal Cloaking & Deception
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0 space-y-4">
                <Alert className="bg-purple-500/10 border-purple-500/30">
                  <Radio className="h-4 w-4 text-purple-400" />
                  <AlertDescription className="text-purple-400 text-xs md:text-sm">
                    <strong>Effectiveness: 90%</strong> - Randomizes MAC/BT every 2 min, deploys 5 decoy WiFi networks.
                  </AlertDescription>
                </Alert>

                <div className="grid gap-3 md:gap-4">
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Wifi className="w-4 h-4 md:w-5 md:h-5 text-blue-400 flex-shrink-0" />
                        <span className="text-white text-xs md:text-sm">MAC Randomization</span>
                      </div>
                      <Badge className="bg-blue-500 text-[10px] md:text-xs flex-shrink-0">2 min</Badge>
                    </div>
                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Prevents WiFi tracking</p>
                  </div>

                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Bluetooth className="w-4 h-4 md:w-5 md:h-5 text-purple-400 flex-shrink-0" />
                        <span className="text-white text-xs md:text-sm">BT Rotation</span>
                      </div>
                      <Badge className="bg-purple-500 text-[10px] md:text-xs flex-shrink-0">2 min</Badge>
                    </div>
                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Prevents BT tracking</p>
                  </div>

                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Network className="w-4 h-4 md:w-5 md:h-5 text-green-400 flex-shrink-0" />
                        <span className="text-white text-xs md:text-sm">Decoy Networks</span>
                      </div>
                      <Badge className="bg-green-500 text-[10px] md:text-xs flex-shrink-0">5</Badge>
                    </div>
                    <p className="text-[10px] md:text-xs text-slate-400 mt-1">Fake WiFi APs</p>
                  </div>
                </div>

                <Button
                  onClick={startSignalCloaking}
                  disabled={createOperationMutation.isPending}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 h-10 md:h-11 text-sm md:text-base"
                >
                  {createOperationMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Radio className="w-4 h-4 mr-2" />
                  )}
                  Enable Signal Cloaking
                </Button>

                {operations.filter(op => op.operation_type === 'signal_cloaking' && op.status === 'active').map(op => (
                  <div key={op.id} className="p-3 md:p-4 bg-purple-500/10 rounded-lg border border-purple-500/30">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                      <span className="font-semibold text-white text-sm md:text-base">Signal Cloaking Active</span>
                      <div className="flex gap-2">
                        <Badge className="bg-purple-500 text-xs">CLOAKED</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStopOperationConfirm(op)}
                          className="border-red-500/50 text-red-400 hover:bg-red-500/10 h-8 text-xs"
                        >
                          <StopCircle className="w-3 h-3 md:w-4 md:h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] md:text-xs text-slate-300">
                      <div>✓ MAC Random</div>
                      <div>✓ BT Random</div>
                      <div>Decoys: {op.signal_cloaking?.wifi_honeypots_deployed || 0}</div>
                      <div>Rotation: {op.signal_cloaking?.rotation_interval_seconds}s</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="honeypots" className="space-y-4 md:space-y-6 mt-4">
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-white flex items-center gap-2 text-base md:text-lg">
                  <Target className="w-4 h-4 md:w-5 md:h-5 text-yellow-400" />
                  Decoy Systems & Honeypots
                </CardTitle>
                <p className="text-xs md:text-sm text-slate-400 mt-1">
                  <strong>Effectiveness: 80%</strong> - Deploy decoys to analyze attackers
                </p>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0">
                {honeypotsLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-3 animate-spin text-slate-600" />
                    <p className="text-slate-400 text-sm">Loading honeypots...</p>
                  </div>
                ) : honeypots.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Target className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-3 text-slate-600" />
                    <p className="text-sm md:text-base">No honeypots deployed</p>
                    <p className="text-xs md:text-sm mt-2">Deploy decoy systems to detect attackers</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {honeypots.map(honeypot => {
                      const TypeIcon = getTypeIcon(honeypot.honeypot_type);

                      return (
                        <div key={honeypot.id} className="p-3 md:p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-0 mb-3">
                            <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                              <div className="w-8 h-8 md:w-10 md:h-10 bg-yellow-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                                <TypeIcon className="w-4 h-4 md:w-5 md:h-5 text-yellow-400" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-semibold text-white text-sm md:text-base truncate">{honeypot.honeypot_name || honeypot.honeypot_id}</h4>
                                <p className="text-[10px] md:text-xs text-slate-400">{honeypot.honeypot_type?.replace(/_/g, ' ')}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge className={
                                honeypot.status === 'active' ? 'bg-green-500 text-xs' :
                                honeypot.status === 'compromised' ? 'bg-red-500 animate-pulse text-xs' :
                                'bg-slate-500 text-xs'
                              }>
                                {honeypot.status}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {honeypot.deception_level}
                              </Badge>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px] md:text-xs mb-3">
                            <div className="text-slate-400 truncate">
                              IP: <span className="text-white font-mono">{honeypot.deployment_config?.ip_address}</span>
                            </div>
                            <div className="text-slate-400">
                              Port: <span className="text-white font-semibold">{honeypot.deployment_config?.port}</span>
                            </div>
                            <div className="text-slate-400">
                              Interact: <span className="text-white font-semibold">{honeypot.interactions?.length || 0}</span>
                            </div>
                            <div className="text-slate-400">
                              Alerts: <span className="text-white font-semibold">{honeypot.alerts_generated || 0}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {honeypot.status === 'active' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => stopHoneypotMutation.mutate(honeypot.id)}
                                  disabled={stopHoneypotMutation.isPending}
                                  className="border-red-500/50 text-red-400 hover:bg-red-500/10 h-8 text-xs"
                                >
                                  {stopHoneypotMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 md:w-4 md:h-4 animate-spin" />
                                  ) : (
                                    <>
                                      <StopCircle className="w-3 h-3 md:w-4 md:h-4 md:mr-1" />
                                      <span className="hidden md:inline">Stop</span>
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => simulateAttackMutation.mutate(honeypot)}
                                  disabled={simulateAttackMutation.isPending}
                                  className="bg-orange-600 hover:bg-orange-700 h-8 text-xs"
                                >
                                  {simulateAttackMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 md:w-4 md:h-4 animate-spin" />
                                  ) : (
                                    <>
                                      <Zap className="w-3 h-3 md:w-4 md:h-4 md:mr-1" />
                                      <span className="hidden md:inline">Simulate</span>
                                    </>
                                  )}
                                </Button>
                              </>
                            )}

                            {honeypot.status === 'inactive' && (
                              <Button
                                size="sm"
                                onClick={() => restartHoneypotMutation.mutate(honeypot.id)}
                                disabled={restartHoneypotMutation.isPending}
                                className="bg-green-600 hover:bg-green-700 h-8 text-xs"
                              >
                                {restartHoneypotMutation.isPending ? (
                                  <Loader2 className="w-3 h-3 md:w-4 md:h-4 mr-1 animate-spin" />
                                ) : (
                                  <Play className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                                )}
                                Restart
                              </Button>
                            )}
                          </div>

                          {honeypot.status === 'compromised' && (
                            <Alert className="mt-3 bg-red-500/10 border-red-500/30">
                              <AlertTriangle className="h-4 w-4 text-red-400" />
                              <AlertDescription className="text-red-400 text-[10px] md:text-xs">
                                <span className="font-bold">Honeypot Compromised!</span>
                                <br />
                                Attacker activity logged. Intelligence gathering in progress.
                                {honeypot.attacker_profile && (
                                  <div className="mt-2 space-y-0.5">
                                    <p>• Level: {honeypot.attacker_profile.attack_sophistication}</p>
                                    <p>• APT: {honeypot.attacker_profile.apt_attribution}</p>
                                  </div>
                                )}
                              </AlertDescription>
                            </Alert>
                          )}

                          {honeypot.interactions && honeypot.interactions.length > 0 && (
                            <details className="mt-3 pt-3 border-t border-slate-700">
                              <summary className="text-xs md:text-sm text-slate-400 cursor-pointer hover:text-white transition-colors">
                                Recent Interactions ({honeypot.interactions.length})
                              </summary>
                              <div className="mt-2 space-y-2">
                                {honeypot.interactions.slice(-3).reverse().map((interaction, idx) => (
                                  <div key={idx} className="bg-slate-900/50 p-2 rounded text-[10px] md:text-xs">
                                    <div className="flex flex-col md:flex-row md:justify-between gap-1">
                                      <span className="text-slate-300">{interaction.action}</span>
                                      <span className="text-slate-500">{new Date(interaction.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <div className="text-slate-500 mt-1 break-all">
                                      Source: {interaction.source_ip}
                                    </div>
                                    {interaction.ttps_observed && interaction.ttps_observed.length > 0 && (
                                      <div className="text-slate-500 mt-1">
                                        TTPs: {interaction.ttps_observed.join(', ')}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Deploy Honeypot Dialog - Mobile optimized */}
        <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-[95vw] md:max-w-lg max-h-[90vh]">
            <DialogHeader className="p-4 md:p-6 pb-3">
              <DialogTitle className="text-base md:text-lg">Deploy New Honeypot</DialogTitle>
            </DialogHeader>

            <ScrollArea className="max-h-[60vh] px-4 md:px-6">
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-xs md:text-sm">Honeypot Type</Label>
                  <Select
                    value={newHoneypot.honeypot_type}
                    onValueChange={(value) => setNewHoneypot({ ...newHoneypot, honeypot_type: value })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-10 md:h-11 text-sm md:text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="web_endpoint">Web Endpoint</SelectItem>
                      <SelectItem value="smb_share">SMB Share</SelectItem>
                      <SelectItem value="database">Database</SelectItem>
                      <SelectItem value="ssh_server">SSH Server</SelectItem>
                      <SelectItem value="api_endpoint">API Endpoint</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs md:text-sm">Hostname (Optional)</Label>
                  <Input
                    placeholder="e.g., admin-server"
                    value={newHoneypot.hostname}
                    onChange={(e) => setNewHoneypot({ ...newHoneypot, hostname: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white h-10 md:h-11 text-sm md:text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs md:text-sm">IP Address (Optional)</Label>
                  <Input
                    placeholder="e.g., 192.168.1.100"
                    value={newHoneypot.ip_address}
                    onChange={(e) => setNewHoneypot({ ...newHoneypot, ip_address: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-white h-10 md:h-11 text-sm md:text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs md:text-sm">Port</Label>
                  <Input
                    type="number"
                    placeholder="8080"
                    value={newHoneypot.port}
                    onChange={(e) => setNewHoneypot({ ...newHoneypot, port: parseInt(e.target.value) || 8080 })}
                    className="bg-slate-800 border-slate-700 text-white h-10 md:h-11 text-sm md:text-base"
                  />
                </div>

                <Alert className="bg-yellow-500/10 border-yellow-500/30">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  <AlertDescription className="text-yellow-300 text-xs md:text-sm">
                    Honeypots will automatically log all interactions and generate alerts for suspicious activity.
                  </AlertDescription>
                </Alert>
              </div>
            </ScrollArea>

            <DialogFooter className="p-4 md:p-6 pt-3 flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setDeployDialogOpen(false)}
                className="bg-slate-800 border-slate-700 w-full sm:w-auto h-10 md:h-11 text-sm md:text-base"
              >
                Cancel
              </Button>
              <Button
                onClick={() => deployHoneypotMutation.mutate()}
                disabled={deployHoneypotMutation.isPending}
                className="bg-orange-600 hover:bg-orange-700 w-full sm:w-auto h-10 md:h-11 text-sm md:text-base"
              >
                {deployHoneypotMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4 mr-2" />
                    Deploy Honeypot
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Stop Operation Dialog - Mobile optimized */}
        <AlertDialog open={!!stopOperationConfirm} onOpenChange={() => setStopOperationConfirm(null)}>
          <AlertDialogContent className="bg-slate-900 border-slate-800 text-white max-w-[95vw] md:max-w-lg">
            <AlertDialogHeader className="p-4 md:p-6">
              <AlertDialogTitle className="text-base md:text-lg">Stop Covert Operation?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400 text-xs md:text-sm">
                This will immediately terminate the active operation. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="p-4 md:p-6 pt-0 flex-col sm:flex-row gap-2">
              <AlertDialogCancel className="bg-slate-800 border-slate-700 w-full sm:w-auto h-10 md:h-11 text-sm md:text-base">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => stopOperationMutation.mutate(stopOperationConfirm.id)}
                className="bg-red-600 hover:bg-red-700 w-full sm:w-auto h-10 md:h-11 text-sm md:text-base"
              >
                Stop Operation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ProtectedRoute>
  );
}
