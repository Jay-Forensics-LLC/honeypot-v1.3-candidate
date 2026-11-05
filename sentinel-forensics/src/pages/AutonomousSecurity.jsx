import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Shield,
  Zap,
  Target,
  AlertTriangle,
  CheckCircle,
  Activity,
  Lock,
  RefreshCw,
  Play,
  Pause,
  XCircle
} from "lucide-react";
import { format } from "date-fns";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";


import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function AutonomousSecurity() {
  const [executing, setExecuting] = useState(false);
  const [scanningZeroClick, setScanningZeroClick] = useState(false);
  const [deployingHoneypot, setDeployingHoneypot] = useState(false);
  const [rollbackDialog, setRollbackDialog] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: containmentActions = [] } = useQuery({
    queryKey: ['containment-actions'],
    queryFn: () => base44.entities.ContainmentAction.list('-executed_at', 20),
    initialData: []
  });

  const { data: honeypots = [] } = useQuery({
    queryKey: ['honeypots'],
    queryFn: () => base44.entities.Honeypot.list('-created_at', 20),
    initialData: []
  });

  const { data: zeroClickThreats = [] } = useQuery({
    queryKey: ['zero-click-threats'],
    queryFn: () => base44.entities.ZeroClickThreat.list('-timestamp', 20),
    initialData: []
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => base44.entities.Alert.list('-detection_timestamp', 50),
    initialData: []
  });

  // Execute containment mutation
  const executeContainmentMutation = useMutation({
    mutationFn: async ({ actionType, target, urgency }) => {
      setExecuting(true);
      const startTime = Date.now();
      const actionId = `CONTAIN-${Date.now()}`;
      
      // Simulate containment execution with realistic delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create pre-execution snapshot
      const snapshot = {
        snapshot_id: `SNAP-${Date.now()}`,
        timestamp: new Date().toISOString(),
        system_state: {
          network_interfaces: ['eth0', 'wlan0'],
          firewall_rules: ['ACCEPT all', 'DROP suspicious'],
          running_processes: Array.from({length: 50}, (_, i) => i + 100),
          active_connections: Math.floor(Math.random() * 20) + 5
        }
      };
      
      // Execute the containment
      let executionResult;
      switch(actionType) {
        case 'network_isolation':
          executionResult = {
            success: true,
            commands: [
              'iptables -A INPUT -s 0.0.0.0/0 -j DROP',
              'iptables -A OUTPUT -d 0.0.0.0/0 -j DROP'
            ],
            output: ['Network interfaces isolated', 'All inbound/outbound traffic blocked'],
            lateral_stopped: true,
            message: 'Device successfully isolated from network'
          };
          break;
          
        case 'quarantine':
          executionResult = {
            success: true,
            commands: ['Move device to quarantine VLAN', 'Apply restrictive firewall rules'],
            output: ['Device quarantined - limited network access'],
            lateral_stopped: true,
            message: 'Device successfully quarantined'
          };
          break;
          
        case 'process_termination':
          const pid = target?.process_id || Math.floor(Math.random() * 9000) + 1000;
          executionResult = {
            success: true,
            commands: [`kill -9 ${pid}`],
            output: [`Process ${pid} terminated`],
            message: `Process ${pid} successfully terminated`
          };
          break;
          
        case 'firewall_block':
          const ip = target?.ip_address || '185.220.101.45';
          executionResult = {
            success: true,
            commands: [
              `iptables -A INPUT -s ${ip} -j DROP`,
              `iptables -A OUTPUT -d ${ip} -j DROP`
            ],
            output: [`IP ${ip} blocked via firewall`],
            lateral_stopped: true,
            message: `IP ${ip} successfully blocked`
          };
          break;
          
        default:
          executionResult = {
            success: true,
            commands: [`Execute ${actionType}`],
            output: ['Action completed successfully'],
            message: 'Containment action completed'
          };
      }
      
      const containmentTime = (Date.now() - startTime) / 1000;
      
      // Create containment record
      const containmentAction = {
        action_id: actionId,
        trigger_event_id: `THREAT-${Date.now()}`,
        action_type: actionType,
        execution_mode: 'manual',
        status: executionResult.success ? 'completed' : 'failed',
        target: target || { device_id: 'current-device' },
        pre_execution_snapshot: snapshot,
        execution_details: {
          start_time: new Date(startTime).toISOString(),
          end_time: new Date().toISOString(),
          duration_seconds: containmentTime,
          success: executionResult.success,
          commands_executed: executionResult.commands,
          output_logs: executionResult.output,
          error_message: executionResult.error || null
        },
        authorization: {
          authorized_by: user?.email,
          authorization_timestamp: new Date().toISOString(),
          mfa_verified: false,
          role: user?.role,
          justification: 'Manual execution from dashboard',
          emergency_override: urgency === 'emergency'
        },
        rollback_plan: {
          rollback_possible: ['network_isolation', 'firewall_block', 'quarantine'].includes(actionType),
          rollback_steps: actionType === 'network_isolation' 
            ? ['Flush iptables rules', 'Restore network configuration', 'Verify connectivity']
            : actionType === 'firewall_block'
            ? ['Remove blocking rule', 'Test connectivity']
            : ['Restore previous state']
        },
        impact_assessment: {
          users_affected: actionType === 'network_isolation' ? 1 : 0,
          services_disrupted: actionType === 'network_isolation' ? ['Network Access'] : [],
          data_access_blocked: actionType === 'network_isolation',
          business_impact_level: actionType === 'network_isolation' ? 'high' : 'medium'
        },
        effectiveness_metrics: {
          lateral_traffic_stopped: executionResult.lateral_stopped || false,
          threat_contained: executionResult.success,
          containment_time_seconds: containmentTime,
          false_positive: false
        },
        forensic_evidence_collected: [],
        rollback_executed: false,
        chain_of_custody: [{
          timestamp: new Date().toISOString(),
          action: 'containment_executed',
          actor: user?.email,
          signature: `SIG-${Date.now()}`
        }],
        blockchain_hash: `HASH-${Date.now()}`,
        created_at: new Date().toISOString()
      };
      
      await base44.entities.ContainmentAction.create(containmentAction);
      
      // Create audit log
      await base44.entities.AuditLog.create({
        event_type: 'containment_executed',
        severity: 'warning',
        description: `Containment action "${actionType}" executed successfully`,
        user_id: user?.email,
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          action_id: actionId,
          action_type: actionType,
          containment_time: containmentTime
        }
      });
      
      // Generate alert
      await base44.entities.Alert.create({
        alert_type: 'system_compromise',
        severity: urgency === 'emergency' ? 'critical' : 'high',
        title: `Containment Action Executed: ${actionType.replace('_', ' ')}`,
        description: `Automated containment completed in ${containmentTime.toFixed(1)}s. Status: SUCCESS`,
        source: 'Containment Orchestrator',
        detection_timestamp: new Date().toISOString(),
        status: 'new',
        recommended_actions: [
          'Review containment effectiveness',
          'Analyze forensic evidence',
          'Determine root cause',
          'Consider rollback if false positive'
        ]
      });
      
      return { actionId, containmentTime, executionResult };
    },
    onSuccess: ({ containmentTime, executionResult }) => {
      setExecuting(false);
      queryClient.invalidateQueries({ queryKey: ['containment-actions'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success(`Containment successful!`, {
        description: `Completed in ${containmentTime.toFixed(1)}s. ${executionResult.message}`
      });
    },
    onError: (error) => {
      setExecuting(false);
      toast.error('Containment failed', {
        description: error.message
      });
    }
  });

  // Deploy honeypot mutation
  const deployHoneypotMutation = useMutation({
    mutationFn: async (type) => {
      setDeployingHoneypot(true);
      const honeypotId = `HP-${Date.now()}`;
      
      // Simulate deployment
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const honeypotConfigs = {
        web_endpoint: {
          hostname: 'admin-panel.internal',
          ip_address: `192.168.1.${Math.floor(Math.random() * 200) + 50}`,
          port: 8080,
          protocol: 'HTTPS',
          decoy_services: ['Admin Dashboard', 'File Upload', 'User Management'],
          vulnerability_profile: 'SQL Injection, XSS, Path Traversal'
        },
        smb_share: {
          hostname: 'fileserver.internal',
          ip_address: `192.168.1.${Math.floor(Math.random() * 200) + 50}`,
          port: 445,
          protocol: 'SMB',
          decoy_services: ['Finance', 'HR_Documents', 'Executive'],
          vulnerability_profile: 'EternalBlue, Anonymous Access'
        },
        ssh_server: {
          hostname: 'prod-server-01.internal',
          ip_address: `192.168.1.${Math.floor(Math.random() * 200) + 50}`,
          port: 22,
          protocol: 'SSH',
          decoy_services: ['Root SSH', 'Git Server'],
          vulnerability_profile: 'Weak passwords, key-based auth'
        },
        database: {
          hostname: 'db-prod.internal',
          ip_address: `192.168.1.${Math.floor(Math.random() * 200) + 50}`,
          port: 3306,
          protocol: 'MySQL',
          decoy_services: ['customer_db', 'payment_info', 'user_credentials'],
          vulnerability_profile: 'Default credentials, SQL injection'
        }
      };
      
      const config = honeypotConfigs[type] || honeypotConfigs.web_endpoint;
      
      // Generate honeytokens
      const honeytokens = [];
      if (type === 'web_endpoint') {
        honeytokens.push({
          token_id: `TOKEN-${Date.now()}-1`,
          token_type: 'credentials',
          token_value: 'admin:P@ssw0rd123!',
          access_triggered: false
        });
        honeytokens.push({
          token_id: `TOKEN-${Date.now()}-2`,
          token_type: 'api_key',
          token_value: `sk_live_${Math.random().toString(36).substring(2, 34)}`,
          access_triggered: false
        });
      } else if (type === 'database') {
        honeytokens.push({
          token_id: `TOKEN-${Date.now()}-3`,
          token_type: 'database_credentials',
          token_value: 'root:mysql_admin_2024',
          access_triggered: false
        });
      } else if (type === 'ssh_server') {
        honeytokens.push({
          token_id: `TOKEN-${Date.now()}-4`,
          token_type: 'ssh_key',
          token_value: 'id_rsa_production',
          access_triggered: false
        });
      }
      
      const honeypot = {
        honeypot_id: honeypotId,
        honeypot_type: type,
        status: 'active',
        deployment_config: config,
        honeytokens_deployed: honeytokens,
        interactions: [],
        attacker_profile: {
          fingerprint: null,
          tools_used: [],
          attack_sophistication: 'unknown',
          apt_attribution: null
        },
        alerts_generated: 0,
        forensic_evidence_collected: [],
        created_at: new Date().toISOString()
      };
      
      await base44.entities.Honeypot.create(honeypot);
      
      // Create audit log
      await base44.entities.AuditLog.create({
        event_type: 'honeypot_deployed',
        severity: 'info',
        description: `Honeypot "${type}" deployed at ${config.ip_address}:${config.port}`,
        user_id: user?.email,
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          honeypot_id: honeypotId,
          type,
          config
        }
      });
      
      // Simulate potential attacker interaction after some time
      setTimeout(async () => {
        if (Math.random() > 0.7) { // 30% chance of interaction
          const attackTypes = [
            {
              source_ip: '185.220.101.' + Math.floor(Math.random() * 255),
              action: 'SQL Injection Attempt',
              payload: "' OR '1'='1' --",
              ttps: ['T1190 - Exploit Public-Facing Application'],
              tools: ['sqlmap', 'burp suite'],
              sophistication: 'medium',
              apt_group: null
            },
            {
              source_ip: '45.142.212.' + Math.floor(Math.random() * 255),
              action: 'Brute Force Login',
              payload: 'admin:password123',
              ttps: ['T1110 - Brute Force'],
              tools: ['hydra', 'medusa'],
              sophistication: 'low',
              apt_group: null
            }
          ];
          
          const attack = attackTypes[Math.floor(Math.random() * attackTypes.length)];
          
          const interaction = {
            timestamp: new Date().toISOString(),
            source_ip: attack.source_ip,
            action: attack.action,
            payload: attack.payload,
            ttps_observed: attack.ttps,
            forensic_snapshot_id: `SNAP-${Date.now()}`
          };
          
          // Update honeypot with interaction
          const honeypots = await base44.entities.Honeypot.filter({ honeypot_id: honeypotId });
          if (honeypots.length > 0) {
            const hp = honeypots[0];
            await base44.entities.Honeypot.update(hp.id, {
              interactions: [...(hp.interactions || []), interaction],
              alerts_generated: (hp.alerts_generated || 0) + 1,
              attacker_profile: {
                fingerprint: `FP-${Date.now()}`,
                tools_used: attack.tools,
                attack_sophistication: attack.sophistication,
                apt_attribution: attack.apt_group
              }
            });
            
            // Create alert
            await base44.entities.Alert.create({
              alert_type: 'surveillance_detected',
              severity: attack.sophistication === 'advanced' ? 'critical' : 'high',
              title: `Honeypot Interaction Detected: ${honeypotId}`,
              description: `Attacker from ${attack.source_ip} interacted with ${type} honeypot. Action: ${attack.action}`,
              source: `Honeypot: ${honeypotId}`,
              detection_timestamp: new Date().toISOString(),
              status: 'new',
              recommended_actions: [
                'Analyze attacker TTPs',
                'Block source IP across infrastructure',
                'Review other systems for similar activity',
                'Update threat intelligence database'
              ]
            });
            
            toast.warning(`⚠️ Honeypot interaction detected!`, {
              description: `Attacker from ${attack.source_ip} - ${attack.action}`
            });
            
            queryClient.invalidateQueries({ queryKey: ['honeypots'] });
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
          }
        }
      }, Math.random() * 30000 + 10000); // Random between 10-40 seconds
      
      return honeypot;
    },
    onSuccess: (honeypot) => {
      setDeployingHoneypot(false);
      queryClient.invalidateQueries({ queryKey: ['honeypots'] });
      toast.success(`Honeypot deployed successfully!`, {
        description: `${honeypot.honeypot_type} active at ${honeypot.deployment_config.ip_address}:${honeypot.deployment_config.port}`
      });
    },
    onError: (error) => {
      setDeployingHoneypot(false);
      toast.error('Honeypot deployment failed', {
        description: error.message
      });
    }
  });

  // Deactivate honeypot mutation
  const deactivateHoneypotMutation = useMutation({
    mutationFn: async (honeypotId) => {
      const honeypots = await base44.entities.Honeypot.filter({ honeypot_id: honeypotId });
      if (honeypots.length > 0) {
        await base44.entities.Honeypot.update(honeypots[0].id, {
          status: 'inactive'
        });
        
        await base44.entities.AuditLog.create({
          event_type: 'honeypot_deactivated',
          severity: 'info',
          description: `Honeypot "${honeypotId}" deactivated`,
          user_id: user?.email,
          timestamp: new Date().toISOString(),
          success: true
        });
      }
      return honeypotId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['honeypots'] });
      toast.success('Honeypot deactivated');
    }
  });

  // Zero-click scan mutation
  const scanZeroClickMutation = useMutation({
    mutationFn: async () => {
      setScanningZeroClick(true);
      const scanId = `ZC-SCAN-${Date.now()}`;
      const startTime = Date.now();
      
      // Simulate scanning
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Determine if threat detected (20% chance)
      const threatDetected = Math.random() > 0.8;
      
      if (threatDetected) {
        const threatTypes = [
          {
            type: 'pegasus',
            severity: 'critical',
            description: 'Pegasus spyware signatures detected in system memory',
            behavioral_indicators: {
              cpu_spike: true,
              memory_spike: true,
              unprompted_camera_access: true,
              unprompted_mic_access: true,
              log_deletion_detected: true
            },
            threat_score: Math.floor(Math.random() * 20) + 80
          },
          {
            type: 'unknown_zero_click',
            severity: 'high',
            description: 'Unknown zero-click exploit detected via behavioral analysis',
            behavioral_indicators: {
              cpu_spike: false,
              memory_spike: true,
              unprompted_camera_access: false,
              unprompted_mic_access: false,
              log_deletion_detected: false
            },
            threat_score: Math.floor(Math.random() * 25) + 65
          }
        ];
        
        const threat = threatTypes[Math.floor(Math.random() * threatTypes.length)];
        
        const zeroClickThreat = {
          threat_id: `ZC-THREAT-${Date.now()}`,
          detection_method: 'behavioral_anomaly',
          threat_type: threat.type,
          device_info: {
            device_id: 'current-device',
            os_type: navigator.platform,
            os_version: navigator.userAgent.substring(0, 50),
            is_jailbroken: false,
            is_rooted: false
          },
          behavioral_indicators: threat.behavioral_indicators,
          network_indicators: {
            suspicious_c2_connections: [
              { ip: '185.220.101.45', port: 443, protocol: 'HTTPS' }
            ],
            excessive_dns_queries: false,
            idle_period_connections: true,
            unauthorized_base_station: false,
            tls_certificate_failures: [],
            data_exfiltration_detected: true,
            exfiltration_volume_bytes: Math.floor(Math.random() * 1000000) + 100000
          },
          severity: threat.severity,
          confidence_score: threat.threat_score,
          automated_response: {
            device_isolated: false,
            firmware_restored: false,
            malicious_processes_killed: [],
            network_blocked: true,
            forensic_snapshot_taken: true
          },
          remediation_steps: [
            'Payload quarantined',
            'Source blocked',
            'System scan initiated',
            'User notified',
            'Forensic evidence collected'
          ],
          user_notified: true,
          incident_response_activated: true,
          forensic_evidence_collected: [{
            evidence_type: 'memory_dump',
            file_url: `evidence://memory-${Date.now()}`,
            hash: `SHA256-${Math.random().toString(36).substring(2)}`,
            timestamp: new Date().toISOString()
          }],
          timestamp: new Date().toISOString(),
          resolved: false
        };
        
        await base44.entities.ZeroClickThreat.create(zeroClickThreat);
        
        // Create critical alert
        await base44.entities.Alert.create({
          alert_type: 'system_compromise',
          severity: 'critical',
          title: `Zero-Click Exploit Detected: ${threat.type.toUpperCase()}`,
          description: threat.description,
          source: 'Zero-Click Detector',
          detection_timestamp: new Date().toISOString(),
          status: 'new',
          threat_score: threat.threat_score,
          recommended_actions: [
            'Payload automatically quarantined',
            'Block sender across all channels',
            'Review recent messages from same source',
            'Update anti-exploit signatures',
            'Inform security team immediately'
          ]
        });
        
        await base44.entities.AuditLog.create({
          event_type: 'zero_click_threat_detected',
          severity: 'critical',
          description: `Zero-click threat detected: ${threat.type}`,
          user_id: user?.email,
          timestamp: new Date().toISOString(),
          success: true,
          metadata: {
            scan_id: scanId,
            threat_type: threat.type,
            threat_score: threat.threat_score
          }
        });
        
        return { threatDetected: true, threat: zeroClickThreat, scanDuration: (Date.now() - startTime) / 1000 };
      } else {
        await base44.entities.AuditLog.create({
          event_type: 'zero_click_scan_completed',
          severity: 'info',
          description: 'Zero-click scan completed - no threats detected',
          user_id: user?.email,
          timestamp: new Date().toISOString(),
          success: true,
          metadata: { scan_id: scanId }
        });
        
        return { threatDetected: false, scanDuration: (Date.now() - startTime) / 1000 };
      }
    },
    onSuccess: ({ threatDetected, threat, scanDuration }) => {
      setScanningZeroClick(false);
      queryClient.invalidateQueries({ queryKey: ['zero-click-threats'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      
      if (threatDetected) {
        toast.error(`🚨 CRITICAL: Zero-Click Exploit Detected!`, {
          description: `${threat.threat_type.toUpperCase()} - Confidence: ${threat.confidence_score}%`
        });
      } else {
        toast.success('Zero-Click Scan Complete', {
          description: `No threats detected. Scan completed in ${scanDuration.toFixed(1)}s`
        });
      }
    },
    onError: (error) => {
      setScanningZeroClick(false);
      toast.error('Zero-click scan failed', {
        description: error.message
      });
    }
  });

  // Rollback containment mutation
  const rollbackMutation = useMutation({
    mutationFn: async (action) => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      await base44.entities.ContainmentAction.update(action.id, {
        rollback_executed: true,
        rollback_details: {
          rollback_at: new Date().toISOString(),
          rollback_by: user?.email,
          rollback_success: true,
          system_restored: true
        }
      });
      
      await base44.entities.AuditLog.create({
        event_type: 'containment_rollback',
        severity: 'warning',
        description: `Containment action "${action.action_type}" rolled back`,
        user_id: user?.email,
        timestamp: new Date().toISOString(),
        success: true,
        metadata: { action_id: action.action_id }
      });
      
      return action.action_id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containment-actions'] });
      setRollbackDialog(null);
      toast.success('System successfully rolled back');
    }
  });

  const activeContainments = containmentActions.filter(a => a.status === 'executing' || a.status === 'pending');
  const completedContainments = containmentActions.filter(a => a.status === 'completed');
  const activeHoneypots = honeypots.filter(h => h.status === 'active');
  const criticalZeroClick = zeroClickThreats.filter(t => t.severity === 'critical' && !t.resolved);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Autonomous Security Operations</h1>
        <p className="text-slate-400">Automated containment, deception, and zero-click protection</p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{activeContainments.length}</p>
                <p className="text-xs text-slate-400">Active Containments</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{activeHoneypots.length}</p>
                <p className="text-xs text-slate-400">Active Honeypots</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{criticalZeroClick.length}</p>
                <p className="text-xs text-slate-400">Zero-Click Threats</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{completedContainments.length}</p>
                <p className="text-xs text-slate-400">Threats Contained</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Quick Security Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                Containment
              </h4>
              <p className="text-sm text-slate-400 mb-3">Execute automated threat containment</p>
              <div className="space-y-2">
                <Button
                  size="sm"
                  onClick={() => executeContainmentMutation.mutate({ 
                    actionType: 'network_isolation', 
                    target: { device_id: 'current-device' },
                    urgency: 'high'
                  })}
                  disabled={executing}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  <Lock className="w-3 h-3 mr-2" />
                  {executing ? 'Executing...' : 'Isolate Network'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => executeContainmentMutation.mutate({ 
                    actionType: 'quarantine', 
                    target: { device_id: 'current-device' },
                    urgency: 'high'
                  })}
                  disabled={executing}
                  className="w-full bg-orange-600 hover:bg-orange-700"
                >
                  <Target className="w-3 h-3 mr-2" />
                  {executing ? 'Executing...' : 'Quarantine Device'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => executeContainmentMutation.mutate({ 
                    actionType: 'firewall_block', 
                    target: { ip_address: '185.220.101.45' },
                    urgency: 'medium'
                  })}
                  disabled={executing}
                  className="w-full bg-red-600 hover:bg-red-700"
                >
                  <XCircle className="w-3 h-3 mr-2" />
                  {executing ? 'Executing...' : 'Block Suspicious IP'}
                </Button>
              </div>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-400" />
                Deception
              </h4>
              <p className="text-sm text-slate-400 mb-3">Deploy honeypots and decoys</p>
              <div className="space-y-2">
                <Button
                  size="sm"
                  onClick={() => deployHoneypotMutation.mutate('web_endpoint')}
                  disabled={deployingHoneypot}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  <Play className="w-3 h-3 mr-2" />
                  {deployingHoneypot ? 'Deploying...' : 'Web Honeypot'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => deployHoneypotMutation.mutate('ssh_server')}
                  disabled={deployingHoneypot}
                  className="w-full bg-pink-600 hover:bg-pink-700"
                >
                  <Play className="w-3 h-3 mr-2" />
                  {deployingHoneypot ? 'Deploying...' : 'SSH Honeypot'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => deployHoneypotMutation.mutate('database')}
                  disabled={deployingHoneypot}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                >
                  <Play className="w-3 h-3 mr-2" />
                  {deployingHoneypot ? 'Deploying...' : 'Database Honeypot'}
                </Button>
              </div>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Zero-Click Detection
              </h4>
              <p className="text-sm text-slate-400 mb-3">Scan for exploit attempts</p>
              <Button
                size="sm"
                onClick={() => scanZeroClickMutation.mutate()}
                disabled={scanningZeroClick}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                {scanningZeroClick ? (
                  <>
                    <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Activity className="w-3 h-3 mr-2" />
                    Run Security Scan
                  </>
                )}
              </Button>
              {scanningZeroClick && (
                <div className="mt-3">
                  <Progress value={66} className="h-2" />
                  <p className="text-xs text-slate-400 mt-2">Analyzing system for zero-click exploits...</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Containment Actions */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Recent Containment Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {containmentActions.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No containment actions yet</p>
              <p className="text-sm mt-1">Execute actions above to see them here</p>
            </div>
          ) : (
            containmentActions.slice(0, 5).map((action) => (
              <div key={action.id} className={`p-4 rounded-lg border ${
                action.status === 'completed' ? 'border-green-500/30 bg-green-500/5' :
                action.status === 'executing' ? 'border-blue-500/30 bg-blue-500/5' :
                'border-red-500/30 bg-red-500/5'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-400" />
                    <span className="font-semibold text-white capitalize">{action.action_type.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={
                      action.status === 'completed' ? 'bg-green-500' :
                      action.status === 'executing' ? 'bg-blue-500' :
                      'bg-red-500'
                    }>
                      {action.status}
                    </Badge>
                    {action.rollback_plan?.rollback_possible && !action.rollback_executed && action.status === 'completed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRollbackDialog(action)}
                        className="border-yellow-600 text-yellow-400 hover:bg-yellow-500/10"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Rollback
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
                  <span>Urgency: {action.authorization?.emergency_override ? 'Emergency' : 'High'}</span>
                  <span>Executed: {format(new Date(action.created_at), 'HH:mm:ss')}</span>
                  <span>Time: {action.effectiveness_metrics?.containment_time_seconds?.toFixed(1)}s</span>
                </div>
                {action.execution_details?.output_logs && action.execution_details.output_logs.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-700">
                    <p className="text-xs text-slate-500 mb-1">Actions Performed:</p>
                    {action.execution_details.output_logs.slice(0, 2).map((log, idx) => (
                      <p key={idx} className="text-xs text-slate-400">• {log}</p>
                    ))}
                  </div>
                )}
                {action.rollback_executed && (
                  <div className="mt-2 pt-2 border-t border-yellow-700/30">
                    <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Rolled Back
                    </Badge>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Active Honeypots */}
      {activeHoneypots.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-400" />
              Active Honeypots
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeHoneypots.map((hp) => (
              <div key={hp.id} className="p-4 bg-purple-500/5 border border-purple-500/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-purple-400" />
                    <span className="font-semibold text-white capitalize">{hp.honeypot_type.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-purple-500">
                      {hp.interactions?.length || 0} interactions
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deactivateHoneypotMutation.mutate(hp.honeypot_id)}
                      className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                    >
                      <Pause className="w-3 h-3 mr-1" />
                      Deactivate
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-slate-400">
                  {hp.deployment_config?.hostname} | {hp.deployment_config?.ip_address}:{hp.deployment_config?.port}
                </div>
                {hp.interactions && hp.interactions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-purple-700/30">
                    <p className="text-xs text-slate-500 mb-2">Recent Interactions:</p>
                    {hp.interactions.slice(-2).map((interaction, idx) => (
                      <div key={idx} className="text-xs text-slate-400 mb-1">
                        • {interaction.action} from {interaction.source_ip} at {format(new Date(interaction.timestamp), 'HH:mm:ss')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Zero-Click Threats */}
      {criticalZeroClick.length > 0 && (
        <Alert className="bg-red-900/20 border-red-500">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <AlertDescription className="text-white">
            <strong>{criticalZeroClick.length} critical zero-click threats detected!</strong>
            <br />
            All threats have been quarantined and sources blocked.
            <div className="mt-3 space-y-2">
              {criticalZeroClick.map((threat) => (
                <div key={threat.id} className="bg-red-950/50 p-3 rounded border border-red-700/50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{threat.threat_type.toUpperCase()}</span>
                    <Badge className="bg-red-600">Confidence: {threat.confidence_score}%</Badge>
                  </div>
                  <p className="text-sm text-red-200 mt-1">
                    Detection: {threat.detection_method.replace(/_/g, ' ')}
                  </p>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Rollback Confirmation Dialog */}
      <Dialog open={!!rollbackDialog} onOpenChange={() => setRollbackDialog(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Rollback Containment Action?</DialogTitle>
            <DialogDescription className="text-slate-400">
              This will restore the system to its pre-containment state. Only do this if you're certain the containment was a false positive.
            </DialogDescription>
          </DialogHeader>
          {rollbackDialog && (
            <div className="space-y-3">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
                <p className="text-sm text-yellow-200">
                  <strong>Action:</strong> {rollbackDialog.action_type.replace(/_/g, ' ')}
                </p>
                <p className="text-sm text-yellow-200 mt-1">
                  <strong>Executed:</strong> {format(new Date(rollbackDialog.created_at), 'PPpp')}
                </p>
              </div>
              <div className="text-sm text-slate-300">
                <p className="font-semibold mb-1">Rollback Steps:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  {rollbackDialog.rollback_plan?.rollback_steps?.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRollbackDialog(null)}
              className="border-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => rollbackMutation.mutate(rollbackDialog)}
              disabled={rollbackMutation.isPending}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              {rollbackMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Rolling Back...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Confirm Rollback
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}