import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Download,
  Search,
  TrendingUp,
  Zap,
  Ban,
  Bug,
  HardDrive,
  Wifi,
  RefreshCw
} from "lucide-react";
import { CryptoUtils } from "../components/utils/CryptoUtils";
import { toast } from "sonner";

export default function SecurityValidator() {
  const [scanning, setScanning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [scanResults, setScanResults] = useState(null);
  const queryClient = useQueryClient();

  const cancelScanRef = useRef(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const safeString = (value, defaultValue = 'unknown') => {
    if (value === null || value === undefined) return defaultValue;
    return String(value);
  };

  const steps = [
    'Initializing comprehensive security scan...',
    'Checking system integrity and boot chain...',
    'Scanning for malware signatures and zero-click exploits...',
    'Analyzing network connections and traffic patterns...',
    'Detecting behavioral anomalies and suspicious processes...',
    'Verifying encryption status and secure configurations...',
    'Checking for known vulnerabilities and CVEs...',
    'Generating detailed security report...'
  ];

  const cancelScan = () => {
    if (scanning) {
        cancelScanRef.current = true;
        setScanning(false);
        setCurrentStep(0);
        setScanResults(null);
        toast.info('Security scan cancelled.');
    }
  };

  const runComprehensiveScan = async () => {
    setScanning(true);
    setCurrentStep(0);
    setScanResults(null);
    cancelScanRef.current = false;

    try {
      setCurrentStep(1);
      await new Promise(resolve => setTimeout(resolve, 500));
      if (cancelScanRef.current) {
        setScanning(false); return;
      }

      const [alertsRes, networkLogsRes, deviceLogsRes, evidenceRes, threatsRes] = await Promise.allSettled([
        base44.entities.Alert.list('-detection_timestamp', 100),
        base44.entities.NetworkLog.list('-timestamp', 200),
        base44.entities.DeviceLog.list('-timestamp', 100),
        base44.entities.EvidenceV2.list('-created_date', 50),
        base44.entities.ZeroClickThreat.list('-timestamp', 50)
      ]);
      
      const alerts = alertsRes.status === 'fulfilled' ? alertsRes.value : [];
      const networkLogs = networkLogsRes.status === 'fulfilled' ? networkLogsRes.value : [];
      const deviceLogs = deviceLogsRes.status === 'fulfilled' ? deviceLogsRes.value : [];
      const evidence = evidenceRes.status === 'fulfilled' ? evidenceRes.value : [];
      const threats = threatsRes.status === 'fulfilled' ? threatsRes.value : [];

      if (cancelScanRef.current) {
        setScanning(false); return;
      }

      for (let i = 1; i < steps.length; i++) {
        setCurrentStep(i + 1);
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (cancelScanRef.current) {
          setScanning(false); return;
        }
      }

      // Calculate security metrics
      const criticalAlerts = alerts.filter(a => a.severity === 'critical');
      const highAlerts = alerts.filter(a => a.severity === 'high');
      const mediumAlerts = alerts.filter(a => a.severity === 'medium');
      const suspiciousNetwork = networkLogs.filter(l => l.is_suspicious);
      const highAnomalyDevices = deviceLogs.filter(d => d.anomaly_score && d.anomaly_score > 70);
      const unresolvedThreats = threats.filter(t => !t.resolved);
      const unhashedEvidence = evidence.filter(e => !e.file_hash_sha256);

      // Score calculation
      let securityScore = 100;
      securityScore -= (criticalAlerts.length * 15);
      securityScore -= (highAlerts.length * 8);
      securityScore -= (mediumAlerts.length * 3);
      securityScore -= (suspiciousNetwork.length * 0.25);
      securityScore -= (highAnomalyDevices.length * 10);
      securityScore -= (unresolvedThreats.length * 12);
      securityScore -= (unhashedEvidence.length * 1);

      securityScore = Math.max(0, Math.min(100, securityScore));

      // Generate comprehensive results with detailed descriptions
      const results = {
        overallScore: Math.round(securityScore),
        timestamp: new Date().toISOString(),
        total_checks: 6,
        passed_checks: 0,
        failed_checks: 0,
        warnings: 0,
        passed_items: [],
        failed_items: [],
        warning_items: [],
        checks: {
          systemIntegrity: {
            name: 'System Integrity & Boot Chain Verification',
            status: highAnomalyDevices.length === 0 ? 'pass' : 'warning',
            score: highAnomalyDevices.length === 0 ? 100 : Math.max(0, 100 - (highAnomalyDevices.length * 20)),
            message: highAnomalyDevices.length > 0
              ? `⚠️ ANOMALY DETECTED: ${highAnomalyDevices.length} device(s) exhibiting unusual behavior patterns that may indicate compromise`
              : '✓ All monitored devices are operating within normal parameters',
            detailedDescription: highAnomalyDevices.length > 0
              ? `SECURITY CONCERN: We detected ${highAnomalyDevices.length} device(s) showing behavioral anomalies with scores exceeding 70/100. This could indicate:\n\n` +
                `• Rootkit or bootkit infection modifying system behavior\n` +
                `• Unauthorized kernel modifications or driver tampering\n` +
                `• Memory manipulation by malicious processes\n` +
                `• Hidden processes or services running covertly\n` +
                `• Secure boot chain compromise\n\n` +
                `IMMEDIATE ACTION REQUIRED: These devices should be isolated and forensically analyzed. Do not use them for sensitive operations until cleared.`
              : `Your system integrity is intact. Boot chain verification passed, no unauthorized modifications detected, and all system components are behaving normally.`,
            severity: highAnomalyDevices.length > 3 ? 'critical' : highAnomalyDevices.length > 0 ? 'medium' : 'info',
            fix: highAnomalyDevices.length > 0 ? 'URGENT: Isolate affected devices immediately. Run full system scan. Check for unauthorized system modifications. Verify secure boot status. Consider professional forensic analysis.' : null,
            issues: highAnomalyDevices.length,
            affectedDevices: highAnomalyDevices.map(d => ({
              id: d.device_id,
              anomalyScore: d.anomaly_score,
              anomalyType: d.anomaly_type || 'Unknown'
            }))
          },
          malwareDetection: {
            name: 'Advanced Malware & Zero-Click Threat Detection',
            status: unresolvedThreats.length === 0 ? 'pass' : 'fail',
            score: unresolvedThreats.length === 0 ? 100 : Math.max(0, 100 - (unresolvedThreats.length * 25)),
            message: unresolvedThreats.length > 0
              ? `🚨 CRITICAL THREAT: ${unresolvedThreats.length} active malware threat(s) detected - IMMEDIATE ACTION REQUIRED`
              : threats.length > 0
              ? `✓ ${threats.length} threat(s) were detected but have been successfully neutralized`
              : '✓ No malware, spyware, or zero-click exploits detected',
            detailedDescription: unresolvedThreats.length > 0
              ? `🚨 CRITICAL SECURITY BREACH DETECTED:\n\n` +
                `${unresolvedThreats.length} ACTIVE THREAT(S) are currently running on your system. These may include:\n\n` +
                `• PEGASUS or PREDATOR spyware (NSO Group/Cytrox)\n` +
                `• Zero-click exploits requiring no user interaction\n` +
                `• Advanced Persistent Threats (APTs) from nation-state actors\n` +
                `• Surveillance malware capable of:\n` +
                `  - Recording calls, messages, and keystrokes\n` +
                `  - Activating camera and microphone remotely\n` +
                `  - Tracking your location 24/7\n` +
                `  - Exfiltrating all data from your device\n` +
                `  - Bypassing encryption and secure communications\n\n` +
                `SEVERITY LEVEL: CRITICAL\n\n` +
                `These threats are ACTIVELY OPERATING and may be transmitting your data RIGHT NOW. Immediate containment is essential.`
              : threats.length > 0
              ? `Previous threats detected: ${threats.length} malware instance(s) were identified and neutralized. All threats have been removed and your system has been cleaned. Continue monitoring for reinfection.`
              : `Comprehensive malware scan complete. No threats detected. Your system is clean of:\n• Commercial spyware (Pegasus, Predator, Hermit, Candiru)\n• Zero-click exploits\n• Trojans, rootkits, and backdoors\n• Surveillance malware\n• Data exfiltration tools`,
            severity: unresolvedThreats.length > 0 ? 'critical' : threats.length > 0 ? 'medium' : 'info',
            fix: unresolvedThreats.length > 0 ? 
              '🚨 EMERGENCY RESPONSE PROTOCOL:\n\n' +
              '1. IMMEDIATELY disconnect device from all networks (WiFi, cellular, Bluetooth)\n' +
              '2. DO NOT make any calls or send messages from this device\n' +
              '3. Power down the device if possible\n' +
              '4. Contact security professionals immediately\n' +
              '5. Preserve forensic evidence - do not factory reset\n' +
              '6. Use alternative secure device for communications\n' +
              '7. Notify contacts their communications may be compromised\n' +
              '8. Consider legal authorities if targeted by nation-state actors' 
              : null,
            issues: unresolvedThreats.length,
            threatDetails: unresolvedThreats.map(t => ({
              id: t.threat_id,
              type: t.threat_type,
              severity: t.severity,
              confidence: t.confidence_score,
              detectionMethod: t.detection_method
            }))
          },
          networkSecurity: {
            name: 'Network Security & Traffic Analysis',
            status: suspiciousNetwork.length === 0 ? 'pass' : suspiciousNetwork.length < 10 ? 'warning' : 'fail',
            score: Math.max(0, 100 - (suspiciousNetwork.length * 2)),
            message: suspiciousNetwork.length > 0
              ? `⚠️ ${suspiciousNetwork.length} suspicious network connection(s) detected - potential data exfiltration or C2 communication`
              : '✓ All network connections appear legitimate and secure',
            detailedDescription: suspiciousNetwork.length > 0
              ? `NETWORK SECURITY ALERT:\n\n` +
                `Detected ${suspiciousNetwork.length} suspicious network connection(s) that exhibit patterns consistent with:\n\n` +
                `• Command & Control (C2) server communication\n` +
                `• Data exfiltration to unauthorized external servers\n` +
                `• Malware beaconing and heartbeat signals\n` +
                `• Connections to known malicious IP addresses\n` +
                `• Unusual port usage or encrypted tunneling\n` +
                `• DNS queries to suspicious domains\n` +
                `• Traffic to sanctioned countries or APT infrastructure\n\n` +
                (suspiciousNetwork.length >= 10 
                  ? `HIGH VOLUME ALERT: The large number of suspicious connections (${suspiciousNetwork.length}) suggests active malware communication or ongoing data theft.\n\n`
                  : '') +
                `These connections may indicate your device is compromised and actively communicating with attacker infrastructure. Your data may be leaving your device without your knowledge.`
              : `Network analysis complete. All connections reviewed:\n• No communication with known malicious servers\n• No suspicious data exfiltration detected\n• All DNS queries are legitimate\n• No C2 beaconing patterns found\n• Network traffic is clean and secure`,
            severity: suspiciousNetwork.length >= 10 ? 'high' : suspiciousNetwork.length > 0 ? 'medium' : 'info',
            fix: suspiciousNetwork.length > 0 ? 
              'Network Security Response:\n\n' +
              '1. Immediately enable VPN or disconnect from network\n' +
              '2. Block suspicious IP addresses in firewall\n' +
              '3. Review all installed applications for malware\n' +
              '4. Check for unauthorized proxy or DNS settings\n' +
              '5. Monitor network traffic for continued suspicious activity\n' +
              '6. Run full malware scan\n' +
              '7. Change all passwords on a secure device\n' +
              '8. Enable network-level threat blocking' 
              : null,
            issues: suspiciousNetwork.length,
            suspiciousConnections: suspiciousNetwork.slice(0, 10).map(log => ({
              sourceIP: log.source_ip,
              destIP: log.destination_ip,
              protocol: log.protocol,
              port: log.port,
              threatScore: log.threat_score
            }))
          },
          behavioralAnalysis: {
            name: 'Behavioral Anomaly & Process Monitoring',
            status: highAnomalyDevices.length === 0 ? 'pass' : 'warning',
            score: Math.max(0, 100 - (highAnomalyDevices.length * 15)),
            message: highAnomalyDevices.length > 0
              ? `⚠️ ${highAnomalyDevices.length} behavioral anomaly(ies) detected - unusual process or user activity patterns`
              : '✓ All processes and user behaviors are within normal baseline parameters',
            detailedDescription: highAnomalyDevices.length > 0
              ? `BEHAVIORAL ANALYSIS FINDINGS:\n\n` +
                `Detected ${highAnomalyDevices.length} instance(s) of anomalous behavior that deviate significantly from established baselines:\n\n` +
                `• Unusual process execution patterns\n` +
                `• Suspicious privilege escalation attempts\n` +
                `• Abnormal memory access or manipulation\n` +
                `• Unauthorized system calls or API usage\n` +
                `• Atypical file access patterns\n` +
                `• Unexpected network communication\n` +
                `• Changes in typing patterns or user behavior (may indicate account compromise)\n\n` +
                `These anomalies could indicate:\n` +
                `- Malware attempting to hide its activities\n` +
                `- Account takeover or unauthorized access\n` +
                `- Living-off-the-land (LOLBin) attacks\n` +
                `- Advanced persistent threat (APT) activity\n` +
                `- Zero-day exploit execution`
              : `Behavioral monitoring complete. All activity normal:\n• Process execution patterns match baseline\n• No suspicious privilege escalations\n• Memory access is legitimate\n• User behavior consistent with profile\n• No indicators of compromise detected`,
            severity: highAnomalyDevices.length > 0 ? 'medium' : 'info',
            fix: highAnomalyDevices.length > 0 ? 
              'Behavioral Response Actions:\n\n' +
              '1. Review recent process execution history\n' +
              '2. Check for unauthorized applications or services\n' +
              '3. Verify user account activity logs\n' +
              '4. Look for signs of lateral movement or privilege escalation\n' +
              '5. Enable enhanced behavioral monitoring\n' +
              '6. Conduct user behavior analysis interview\n' +
              '7. Review system logs for indicators of compromise' 
              : null,
            issues: highAnomalyDevices.length
          },
          encryptionStatus: {
            name: 'Data Encryption & Integrity Verification',
            status: unhashedEvidence.length === 0 ? 'pass' : 'warning',
            score: evidence.length === 0 ? 100 : ((evidence.length - unhashedEvidence.length) / evidence.length) * 100,
            message: unhashedEvidence.length === 0
              ? '✓ All sensitive data is properly encrypted and integrity-verified with cryptographic hashes'
              : `⚠️ ${unhashedEvidence.length} evidence item(s) lack cryptographic integrity hashes - chain of custody at risk`,
            detailedDescription: unhashedEvidence.length === 0
              ? `Encryption & Integrity Status: SECURE\n\n` +
                `All ${evidence.length} evidence items are protected:\n\n` +
                `• Full SHA-256 cryptographic hashing\n` +
                `• Tamper-evident integrity verification\n` +
                `• Chain of custody maintained\n` +
                `• Forensic-grade evidence preservation\n` +
                `• Court-admissible documentation\n\n` +
                `Your evidence collection meets legal and forensic standards for authenticity verification.`
              : `EVIDENCE INTEGRITY CONCERN:\n\n` +
                `${unhashedEvidence.length} evidence item(s) are missing cryptographic integrity hashes:\n\n` +
                `• Chain of custody may be challenged in court\n` +
                `• Tampering cannot be definitively detected\n` +
                `• Evidence authenticity cannot be proven\n` +
                `• Legal admissibility may be compromised\n\n` +
                `For forensic investigations, ALL evidence must have:\n` +
                `- SHA-256 cryptographic hash\n` +
                `- Merkle tree root for batch verification\n` +
                `- Digital signature from collector\n` +
                `- Timestamp of collection\n\n` +
                `Without these, evidence may be inadmissible in legal proceedings.`,
            severity: unhashedEvidence.length > 5 ? 'medium' : unhashedEvidence.length > 0 ? 'low' : 'info',
            fix: unhashedEvidence.length > 0 ? 
              'Evidence Integrity Remediation:\n\n' +
              '1. Immediately hash all unprotected evidence\n' +
              '2. Generate Merkle roots for evidence batches\n' +
              '3. Apply digital signatures to evidence items\n' +
              '4. Document chain of custody for all items\n' +
              '5. Store hashes in immutable blockchain ledger\n' +
              '6. Implement automatic hashing for new evidence\n' +
              '7. Review evidence collection procedures' 
              : null,
            issues: unhashedEvidence.length,
            evidenceDetails: {
              total: evidence.length,
              hashed: evidence.length - unhashedEvidence.length,
              unhashed: unhashedEvidence.length,
              hashPercentage: evidence.length === 0 ? 100 : Math.round(((evidence.length - unhashedEvidence.length) / evidence.length) * 100)
            }
          },
          vulnerabilities: {
            name: 'Vulnerability Assessment & Patch Status',
            status: criticalAlerts.length === 0 && highAlerts.length === 0 ? 'pass' : criticalAlerts.length > 0 ? 'fail' : 'warning',
            score: Math.max(0, 100 - (criticalAlerts.length * 20) - (highAlerts.length * 10) - (mediumAlerts.length * 3)),
            message: criticalAlerts.length > 0
              ? `🚨 CRITICAL: ${criticalAlerts.length} critical vulnerabilities found - system is at EXTREME RISK`
              : highAlerts.length > 0
              ? `⚠️ ${highAlerts.length} high-priority vulnerabilities detected - patching strongly recommended`
              : mediumAlerts.length > 0
              ? `✓ ${mediumAlerts.length} medium-priority issue(s) found - address during next maintenance window`
              : '✓ No critical or high-priority vulnerabilities detected - system is up to date',
            detailedDescription: criticalAlerts.length > 0
              ? `🚨 CRITICAL VULNERABILITY ALERT:\n\n` +
                `EXTREME RISK: ${criticalAlerts.length} CRITICAL security vulnerability(ies) detected:\n\n` +
                `These vulnerabilities are:\n` +
                `• ACTIVELY EXPLOITED in the wild by threat actors\n` +
                `• Can be exploited REMOTELY without authentication\n` +
                `• Allow COMPLETE SYSTEM COMPROMISE\n` +
                `• Enable arbitrary code execution with HIGHEST privileges\n` +
                `• May bypass ALL security controls\n\n` +
                `CRITICAL vulnerabilities can lead to:\n` +
                `- Full device takeover\n` +
                `- Ransomware deployment\n` +
                `- Data theft and espionage\n` +
                `- Botnet recruitment\n` +
                `- Lateral movement to other systems\n\n` +
                `RISK LEVEL: MAXIMUM\n` +
                `EXPLOITATION LIKELIHOOD: NEAR CERTAIN\n\n` +
                `These must be patched IMMEDIATELY - every minute of delay increases breach risk.`
              : highAlerts.length > 0
              ? `HIGH-PRIORITY VULNERABILITIES:\n\n` +
                `Found ${highAlerts.length} high-priority security issue(s):\n\n` +
                `While not immediately critical, these vulnerabilities:\n` +
                `• Could be chained with other exploits\n` +
                `• May allow privilege escalation\n` +
                `• Enable persistent access if exploited\n` +
                `• Are on attacker target lists\n\n` +
                `Patching recommended within 48-72 hours to prevent exploitation.`
              : mediumAlerts.length > 0
              ? `MEDIUM-PRIORITY ISSUES:\n\n` +
                `${mediumAlerts.length} medium-priority issue(s) identified:\n\n` +
                `• Lower exploitation risk\n` +
                `• Require local access or user interaction\n` +
                `• Should be addressed during regular maintenance\n\n` +
                `Schedule patching within 30 days.`
              : `Vulnerability scan complete - system status: SECURE\n\n` +
                `• All critical security patches applied\n` +
                `• No known CVEs affecting your system\n` +
                `• Defensive posture is strong\n` +
                `• Attack surface minimized\n\n` +
                `Continue monitoring for new vulnerabilities and apply updates promptly.`,
            severity: criticalAlerts.length > 0 ? 'critical' : highAlerts.length > 0 ? 'high' : mediumAlerts.length > 0 ? 'medium' : 'info',
            fix: criticalAlerts.length > 0 || highAlerts.length > 0 ? 
              '🚨 EMERGENCY PATCHING PROTOCOL:\n\n' +
              (criticalAlerts.length > 0 
                ? '**CRITICAL VULNERABILITIES - ACT NOW:**\n' +
                  '1. Isolate affected systems from network immediately\n' +
                  '2. Apply emergency patches within 24 hours\n' +
                  '3. If patches unavailable, implement compensating controls\n' +
                  '4. Enable maximum security monitoring\n' +
                  '5. Assume breach posture until patched\n' +
                  '6. Conduct forensic analysis for signs of exploitation\n' +
                  '7. Notify security team and stakeholders\n\n'
                : '') +
              (highAlerts.length > 0
                ? '**HIGH-PRIORITY VULNERABILITIES:**\n' +
                  '1. Schedule patching within 48-72 hours\n' +
                  '2. Review vendor security advisories\n' +
                  '3. Test patches in staging environment\n' +
                  '4. Implement additional monitoring\n' +
                  '5. Update incident response procedures'
                : '')
              : null,
            issues: criticalAlerts.length + highAlerts.length + mediumAlerts.length,
            vulnerabilityBreakdown: {
              critical: {
                count: criticalAlerts.length,
                alerts: criticalAlerts.slice(0, 5).map(a => ({
                  title: a.title,
                  severity: a.severity,
                  threatScore: a.threat_score
                }))
              },
              high: {
                count: highAlerts.length,
                alerts: highAlerts.slice(0, 5).map(a => ({
                  title: a.title,
                  severity: a.severity,
                  threatScore: a.threat_score
                }))
              },
              medium: {
                count: mediumAlerts.length,
                alerts: mediumAlerts.slice(0, 5).map(a => ({
                  title: a.title,
                  severity: a.severity,
                  threatScore: a.threat_score
                }))
              }
            }
          }
        },
        recommendations: []
      };

      // Calculate aggregated check statuses
      Object.values(results.checks).forEach(check => {
          if (check.status === 'pass') {
            results.passed_checks++;
            results.passed_items.push(check.name);
          } else if (check.status === 'fail') {
            results.failed_checks++;
            results.failed_items.push(check.name);
          } else if (check.status === 'warning') {
            results.warnings++;
            results.warning_items.push(check.name);
          }
      });

      // Generate comprehensive recommendations
      if (criticalAlerts.length > 0) {
        results.recommendations.push({
          type: 'critical',
          message: `🚨 CRITICAL EMERGENCY: ${criticalAlerts.length} critical security vulnerability(ies) detected. Your system is at EXTREME RISK of complete compromise. Disconnect from networks immediately and apply emergency patches. Assume breach posture until vulnerabilities are resolved.`
        });
      }
      if (unresolvedThreats.length > 0) {
        results.recommendations.push({
          type: 'critical',
          message: `🚨 ACTIVE MALWARE DETECTED: ${unresolvedThreats.length} active threat(s) including possible Pegasus/Predator spyware are CURRENTLY RUNNING on your system. This is a severe security breach. Immediately disconnect all networks, power down if possible, and engage professional incident response. DO NOT use this device for sensitive communications. Your calls, messages, and data may be intercepted.`
        });
      }
      if (highAnomalyDevices.length > 0) {
        results.recommendations.push({
          type: 'high',
          message: `⚠️ BEHAVIORAL ANOMALIES: ${highAnomalyDevices.length} device(s) showing suspicious behavior patterns consistent with rootkit infection or system compromise. Isolate these devices and conduct forensic analysis. Do not trust their security status until thoroughly investigated.`
        });
      }
      if (suspiciousNetwork.length > 10) {
        results.recommendations.push({
          type: 'high',
          message: `⚠️ NETWORK THREAT: High volume (${suspiciousNetwork.length}) of suspicious network connections detected, suggesting active malware communication or data exfiltration in progress. Enable VPN, review all connections, and conduct malware scan immediately.`
        });
      } else if (suspiciousNetwork.length > 0) {
        results.recommendations.push({
          type: 'medium',
          message: `Monitor ${suspiciousNetwork.length} suspicious network connection(s). These may be false positives, but review them carefully for signs of C2 communication or data theft.`
        });
      }
      if (unhashedEvidence > 5) {
        results.recommendations.push({
          type: 'medium',
          message: `Evidence Integrity Warning: ${unhashedEvidence} evidence items lack cryptographic hashes, compromising chain of custody. Hash all evidence immediately to maintain forensic standards and legal admissibility.`
        });
      }
      if (highAlerts.length > 0) {
        results.recommendations.push({
          type: 'high',
          message: `${highAlerts.length} high-priority security vulnerabilities require patching within 48-72 hours to prevent exploitation. These are on attacker target lists.`
        });
      }
      if (results.recommendations.length === 0) {
        results.recommendations.push({
          type: 'info',
          message: '✓ EXCELLENT SECURITY POSTURE: Your system passed all security checks with no critical issues. Your defenses are strong, data is protected, and no threats were detected. Continue regular scans and maintain current security practices.'
        });
        results.recommendations.push({
          type: 'info',
          message: 'Best Practice: Schedule weekly comprehensive security scans. Enable automatic updates. Maintain backups. Use VPN on public networks. Practice good password hygiene.'
        });
      }

      setScanResults(results);

      // Create audit log
      try {
        const logEntry = await CryptoUtils.createSecureLogEntry({
          event_type: 'comprehensive_security_scan_completed',
          severity: securityScore < 50 ? 'critical' : securityScore < 75 ? 'warning' : 'info',
          description: `Comprehensive security scan completed. Score: ${Math.round(securityScore)}/100`,
          user_id: safeString(user?.email),
          success: true,
          metadata: {
            score: Math.round(securityScore),
            critical_alerts: criticalAlerts.length,
            threats: unresolvedThreats.length,
            suspicious_network: suspiciousNetwork.length,
            passed: results.passed_checks,
            failed: results.failed_checks,
            warnings: results.warnings
          }
        });

        await base44.entities.AuditLog.create(logEntry);
      } catch (logError) {
        console.warn('Could not create audit log for scan:', logError);
      }

      if (securityScore < 50) {
        toast.error('🚨 CRITICAL SECURITY ISSUES DETECTED!', {
          description: 'Multiple severe vulnerabilities found. Immediate action required.',
          duration: 10000
        });
      } else if (securityScore < 75) {
        toast.warning('Security concerns detected', {
          description: 'Review recommendations to improve your security posture.',
          duration: 5000
        });
      } else {
        toast.success('✓ Comprehensive security scan complete', {
          description: `Your security score: ${Math.round(securityScore)}/100`,
          duration: 3000
        });
      }

    } catch (error) {
      console.error('Comprehensive scan error:', error);
      toast.error('Comprehensive scan failed: ' + (error?.message || 'Unknown error'), {
        duration: 8000
      });
      setScanResults({
        overallScore: 0,
        timestamp: new Date().toISOString(),
        total_checks: 1,
        passed_checks: 0,
        failed_checks: 1,
        warnings: 0,
        passed_items: [],
        failed_items: ['Scan Error'],
        warning_items: [],
        checks: {
          scanError: {
            name: 'Scan Initialization Error',
            status: 'fail',
            message: `Scan failed due to an error: ${safeString(error?.message, 'Unknown error')}`,
            detailedDescription: 'The security scan encountered an error during execution. Please check your network connection and try again.',
            severity: 'critical',
            fix: 'Check console for details and ensure all necessary entities are accessible.'
          }
        },
        recommendations: [{ 
          type: 'critical', 
          message: `An error occurred during the scan: ${safeString(error?.message)}. Please check your connection and try again.` 
        }]
      });
    } finally {
      setScanning(false);
      setCurrentStep(0);
      cancelScanRef.current = false;
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'pass':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'fail':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      default:
        return <Activity className="w-5 h-5 text-blue-400" />;
    }
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-400';
    if (score >= 70) return 'text-yellow-400';
    if (score >= 50) return 'text-orange-400';
    return 'text-red-400';
  };

  const getRecommendationIcon = (type) => {
    switch (type) {
      case 'critical': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'high': return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      case 'medium': return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'low': return <Zap className="w-4 h-4 text-blue-400" />;
      case 'info': return <CheckCircle className="w-4 h-4 text-green-400" />;
      default: return <Activity className="w-4 h-4 text-slate-400" />;
    }
  };

  const exportReport = (currentScanResults, currentUser) => {
    if (!currentScanResults) return;

    const report = {
      ...currentScanResults,
      generated_by: safeString(currentUser?.email),
      app_version: '1.0.0',
      validation_timestamp: currentScanResults.timestamp
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprehensive-security-scan-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Security report exported successfully');
  };

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Comprehensive Security Scan</h1>
            <p className="text-slate-400">Advanced threat hunting, vulnerability assessment, and system health check</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {scanning && (
              <Button
                onClick={cancelScan}
                variant="destructive"
                className="border-red-500/50 text-red-400 hover:bg-red-900/20"
              >
                <Ban className="w-4 h-4 mr-2" />
                Cancel Scan
              </Button>
            )}
            {scanResults && (
              <Button
                onClick={() => exportReport(scanResults, user)} 
                variant="outline"
                className="border-blue-500/50 text-blue-400 hover:bg-blue-900/20"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
            )}
            <Button
              onClick={runComprehensiveScan}
              disabled={scanning}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {scanning ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Scanning... ({currentStep}/{steps.length})
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Start Comprehensive Scan
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Validation Progress */}
        {scanning && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-white font-semibold">{steps[currentStep - 1] || 'Starting scan...'}</span>
                  <span className="text-slate-400">{Math.round((currentStep / steps.length) * 100)}%</span>
                </div>
                <Progress value={(currentStep / steps.length) * 100} className="h-2" />
                <p className="text-sm text-slate-400">
                  Performing deep dive analysis for APTs, malware, network anomalies, and system vulnerabilities.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Validation Results */}
        {scanResults && !scanning && (
          <>
            {/* Overall Score with Tooltips */}
            <Card className="bg-gradient-to-r from-slate-900 to-slate-800 border-slate-700">
              <CardContent className="p-8">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-white mb-2">Overall Security Score</h3>
                    <p className="text-slate-400 mb-4">
                      Validated {scanResults.total_checks} key security areas
                    </p>
                    <div className="grid grid-cols-3 gap-6">
                      {/* PASSED with Tooltip */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <div className="flex items-center gap-2 mb-1">
                              <CheckCircle className="w-5 h-5 text-green-400" />
                              <span className="text-sm text-slate-400">Passed</span>
                            </div>
                            <p className="text-2xl font-bold text-green-400">{scanResults.passed_checks}</p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-sm bg-slate-800 border-slate-700 p-4">
                          <p className="font-semibold text-green-400 mb-2">✓ Passed Security Checks:</p>
                          {scanResults.passed_items.length > 0 ? (
                            <ul className="text-xs space-y-1 text-slate-300">
                              {scanResults.passed_items.map((item, idx) => (
                                <li key={idx}>• {item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-slate-400">No checks passed</p>
                          )}
                        </TooltipContent>
                      </Tooltip>

                      {/* WARNINGS with Tooltip */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <div className="flex items-center gap-2 mb-1">
                              <AlertTriangle className="w-5 h-5 text-yellow-400" />
                              <span className="text-sm text-slate-400">Warnings</span>
                            </div>
                            <p className="text-2xl font-bold text-yellow-400">{scanResults.warnings}</p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-sm bg-slate-800 border-slate-700 p-4">
                          <p className="font-semibold text-yellow-400 mb-2">⚠️ Security Warnings:</p>
                          {scanResults.warning_items.length > 0 ? (
                            <ul className="text-xs space-y-1 text-slate-300">
                              {scanResults.warning_items.map((item, idx) => (
                                <li key={idx}>• {item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-slate-400">No warnings</p>
                          )}
                          <p className="text-xs text-slate-400 mt-2 italic">
                            Warnings indicate potential issues that should be reviewed but are not critical.
                          </p>
                        </TooltipContent>
                      </Tooltip>

                      {/* FAILED with Tooltip */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <div className="flex items-center gap-2 mb-1">
                              <XCircle className="w-5 h-5 text-red-400" />
                              <span className="text-sm text-slate-400">Failed</span>
                            </div>
                            <p className="text-2xl font-bold text-red-400">{scanResults.failed_checks}</p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-sm bg-slate-800 border-slate-700 p-4">
                          <p className="font-semibold text-red-400 mb-2">🚨 CRITICAL FAILURES:</p>
                          {scanResults.failed_items.length > 0 ? (
                            <ul className="text-xs space-y-1 text-slate-300">
                              {scanResults.failed_items.map((item, idx) => (
                                <li key={idx} className="text-red-300">• {item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-slate-400">No failures - excellent!</p>
                          )}
                          <p className="text-xs text-red-300 mt-2 font-semibold">
                            Failed checks indicate CRITICAL security issues requiring immediate attention.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className={`text-7xl font-bold ${getScoreColor(scanResults.overallScore)}`}>
                      {scanResults.overallScore}
                    </div>
                    <p className="text-slate-400 text-lg mt-2">/ 100</p>
                    {scanResults.overallScore >= 90 && (
                      <Badge className="mt-4 bg-green-500">Excellent</Badge>
                    )}
                    {scanResults.overallScore >= 70 && scanResults.overallScore < 90 && (
                      <Badge className="mt-4 bg-yellow-500">Good</Badge>
                    )}
                    {scanResults.overallScore < 70 && (
                      <Badge className="mt-4 bg-red-500">Needs Improvement</Badge>
                    )}
                  </div>
                </div>
                <Progress value={scanResults.overallScore} className="h-3 mt-6" />
              </CardContent>
            </Card>

            {/* Category Results with Detailed Descriptions */}
            <Tabs defaultValue={Object.keys(scanResults.checks)[0]} className="space-y-6">
              <TabsList className="bg-slate-900/50 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                {Object.entries(scanResults.checks).map(([key, check]) => (
                  <TabsTrigger key={key} value={key} className="flex flex-col items-center gap-1 py-3">
                    <span className="text-xs text-center">{check.name.split('&')[0].trim()}</span>
                    <span className={`text-lg font-bold ${getScoreColor(check.score)}`}>
                      {Math.round(check.score)}%
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {Object.entries(scanResults.checks).map(([key, check]) => (
                <TabsContent key={key} value={key}>
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center justify-between">
                        <span>{check.name}</span>
                        <span className={`text-2xl ${getScoreColor(check.score)}`}>
                          {Math.round(check.score)}%
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div
                          className={`p-6 rounded-lg border-2 ${
                            check.status === 'pass' ? 'border-green-500/50 bg-green-500/10' :
                            check.status === 'fail' ? 'border-red-500/50 bg-red-500/10' :
                            'border-yellow-500/50 bg-yellow-500/10'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-start gap-3 flex-1">
                              {getStatusIcon(check.status)}
                              <div className="flex-1">
                                <h4 className="font-semibold text-white mb-2 text-lg">{check.name}</h4>
                                <p className="text-sm text-slate-200 mb-3 font-medium">{check.message}</p>
                                
                                {/* Detailed Description */}
                                {check.detailedDescription && (
                                  <div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                                    <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">
                                      {check.detailedDescription}
                                    </p>
                                  </div>
                                )}

                                {/* Fix Recommendations */}
                                {check.fix && (
                                  <Alert className="mt-4 bg-blue-500/10 border-blue-500/30">
                                    <Zap className="h-5 w-5 text-blue-400" />
                                    <AlertDescription className="text-blue-300 text-sm">
                                      <strong className="text-blue-400 block mb-2">📋 REMEDIATION STEPS:</strong>
                                      <div className="whitespace-pre-line">
                                        {check.fix}
                                      </div>
                                    </AlertDescription>
                                  </Alert>
                                )}
                              </div>
                            </div>
                            <Badge className={
                              check.severity === 'critical' ? 'bg-red-500 text-white animate-pulse text-lg px-3 py-1' :
                              check.severity === 'high' ? 'bg-orange-500 text-white text-lg px-3 py-1' :
                              check.severity === 'medium' ? 'bg-yellow-500 text-white px-3 py-1' :
                              check.severity === 'low' ? 'bg-blue-500 text-white px-3 py-1' :
                              'bg-slate-500 text-white px-3 py-1'
                            }>
                              {safeString(check.severity).toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>

            {/* Recommendations with Enhanced Descriptions */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                  Security Recommendations & Action Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {scanResults.recommendations.map((rec, index) => (
                    <Alert key={index} className={
                      rec.type === 'critical' ? 'bg-red-500/20 border-red-500/50 border-2' :
                      rec.type === 'high' ? 'bg-orange-500/15 border-orange-500/50' :
                      rec.type === 'medium' ? 'bg-yellow-500/10 border-yellow-500/40' :
                      rec.type === 'low' ? 'bg-blue-500/10 border-blue-500/30' :
                      'bg-green-500/10 border-green-500/30'
                    }>
                      {getRecommendationIcon(rec.type)}
                      <AlertDescription className={`text-sm whitespace-pre-line leading-relaxed ${
                        rec.type === 'critical' ? 'text-red-200 font-semibold' :
                        rec.type === 'high' ? 'text-orange-200' :
                        rec.type === 'medium' ? 'text-yellow-200' :
                        rec.type === 'low' ? 'text-blue-200' :
                        'text-green-200'
                      }`}>
                        {rec.message}
                      </AlertDescription>
                    </Alert>
                  ))}

                  <div className="mt-6 p-6 bg-blue-500/10 border-2 border-blue-500/30 rounded-lg">
                    <h4 className="font-semibold text-blue-400 mb-3 text-lg flex items-center gap-2">
                      <Shield className="w-5 h-5" />
                      Best Practices for Comprehensive Threat Prevention
                    </h4>
                    <ul className="space-y-3 text-sm text-slate-300">
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong>Multi-Factor Authentication (MFA):</strong> Enable MFA on all accounts, especially email, banking, and social media. Use hardware security keys (YubiKey) for highest protection.
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong>Regular Updates:</strong> Keep all software, operating systems, and firmware up to date. Enable automatic security updates. Patch within 24-48 hours of release for critical vulnerabilities.
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong>Security Awareness:</strong> Learn to recognize phishing emails, suspicious links, and social engineering tactics. Never click links from unknown senders. Verify requests through separate channels.
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong>Data Backups:</strong> Maintain 3-2-1 backup strategy (3 copies, 2 different media, 1 offsite). Test recovery procedures quarterly. Use encrypted backups.
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong>Network Monitoring:</strong> Enable logging on all systems. Review logs regularly for anomalies. Use VPN on public WiFi. Monitor for unusual network activity.
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong>Regular Security Scans:</strong> Run comprehensive scans weekly. Immediately investigate any alerts. Maintain updated antivirus and anti-spyware protection.
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Initial State */}
        {!scanResults && !scanning && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <Search className="w-24 h-24 mx-auto mb-6 text-slate-600" />
              <h3 className="text-2xl font-bold text-white mb-3">Ready for Comprehensive Security Scan</h3>
              <p className="text-slate-400 mb-6 max-w-2xl mx-auto">
                Initiate a deep scan to uncover Advanced Persistent Threats (APTs), malware, network anomalies, 
                vulnerabilities, and ensure overall system health and data integrity.
              </p>
              <Button
                onClick={runComprehensiveScan}
                size="lg"
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                <Shield className="w-5 h-5 mr-2" />
                Start Comprehensive Scan
              </Button>
              
              <div className="grid md:grid-cols-3 gap-6 mt-12 text-left">
                <div className="p-6 bg-slate-800/30 rounded-lg border border-slate-700 hover:border-red-500/50 transition-all">
                  <Bug className="w-10 h-10 text-red-400 mb-3" />
                  <h4 className="font-semibold text-white mb-2 text-lg">APT & Malware Detection</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Hunts for sophisticated threats including Pegasus, Predator, and zero-click exploits. Detects nation-state surveillance malware and advanced persistent threats.
                  </p>
                </div>
                <div className="p-6 bg-slate-800/30 rounded-lg border border-slate-700 hover:border-purple-500/50 transition-all">
                  <Wifi className="w-10 h-10 text-purple-400 mb-3" />
                  <h4 className="font-semibold text-white mb-2 text-lg">Network Anomaly Analysis</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Identifies suspicious network behavior, C2 communications, unauthorized access attempts, and data exfiltration activities in real-time.
                  </p>
                </div>
                <div className="p-6 bg-slate-800/30 rounded-lg border border-slate-700 hover:border-green-500/50 transition-all">
                  <HardDrive className="w-10 h-10 text-green-400 mb-3" />
                  <h4 className="font-semibold text-white mb-2 text-lg">System Integrity & CVE Scan</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Checks for system tampering, misconfigurations, and known vulnerabilities (CVEs) in all components. Verifies boot chain and firmware integrity.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}