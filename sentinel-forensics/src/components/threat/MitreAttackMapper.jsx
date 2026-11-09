import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Shield, AlertTriangle } from 'lucide-react';

/**
 * MITRE ATT&CK FRAMEWORK MAPPER
 * Maps threat indicators to MITRE ATT&CK techniques
 * Provides tactical context for threat analysis
 */

// MITRE ATT&CK Technique Database (subset of common techniques)
const ATTACK_TECHNIQUES = {
  // Initial Access
  T1566: { id: 'T1566', name: 'Phishing', tactic: 'Initial Access' },
  T1190: { id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access' },
  T1133: { id: 'T1133', name: 'External Remote Services', tactic: 'Initial Access' },
  
  // Execution
  T1059: { id: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'Execution' },
  T1203: { id: 'T1203', name: 'Exploitation for Client Execution', tactic: 'Execution' },
  
  // Persistence
  T1547: { id: 'T1547', name: 'Boot or Logon Autostart Execution', tactic: 'Persistence' },
  T1543: { id: 'T1543', name: 'Create or Modify System Process', tactic: 'Persistence' },
  T1574: { id: 'T1574', name: 'Hijack Execution Flow', tactic: 'Persistence' },
  
  // Privilege Escalation
  T1068: { id: 'T1068', name: 'Exploitation for Privilege Escalation', tactic: 'Privilege Escalation' },
  T1055: { id: 'T1055', name: 'Process Injection', tactic: 'Privilege Escalation' },
  
  // Defense Evasion
  T1027: { id: 'T1027', name: 'Obfuscated Files or Information', tactic: 'Defense Evasion' },
  T1070: { id: 'T1070', name: 'Indicator Removal', tactic: 'Defense Evasion' },
  T1562: { id: 'T1562', name: 'Impair Defenses', tactic: 'Defense Evasion' },
  T1036: { id: 'T1036', name: 'Masquerading', tactic: 'Defense Evasion' },
  
  // Credential Access
  T1003: { id: 'T1003', name: 'OS Credential Dumping', tactic: 'Credential Access' },
  T1110: { id: 'T1110', name: 'Brute Force', tactic: 'Credential Access' },
  T1056: { id: 'T1056', name: 'Input Capture', tactic: 'Credential Access' },
  
  // Discovery
  T1082: { id: 'T1082', name: 'System Information Discovery', tactic: 'Discovery' },
  T1083: { id: 'T1083', name: 'File and Directory Discovery', tactic: 'Discovery' },
  T1057: { id: 'T1057', name: 'Process Discovery', tactic: 'Discovery' },
  T1046: { id: 'T1046', name: 'Network Service Discovery', tactic: 'Discovery' },
  
  // Lateral Movement
  T1021: { id: 'T1021', name: 'Remote Services', tactic: 'Lateral Movement' },
  T1080: { id: 'T1080', name: 'Taint Shared Content', tactic: 'Lateral Movement' },
  
  // Collection
  T1005: { id: 'T1005', name: 'Data from Local System', tactic: 'Collection' },
  T1113: { id: 'T1113', name: 'Screen Capture', tactic: 'Collection' },
  T1560: { id: 'T1560', name: 'Archive Collected Data', tactic: 'Collection' },
  
  // Command and Control
  T1071: { id: 'T1071', name: 'Application Layer Protocol', tactic: 'Command and Control' },
  T1095: { id: 'T1095', name: 'Non-Application Layer Protocol', tactic: 'Command and Control' },
  T1572: { id: 'T1572', name: 'Protocol Tunneling', tactic: 'Command and Control' },
  
  // Exfiltration
  T1041: { id: 'T1041', name: 'Exfiltration Over C2 Channel', tactic: 'Exfiltration' },
  T1048: { id: 'T1048', name: 'Exfiltration Over Alternative Protocol', tactic: 'Exfiltration' },
  T1567: { id: 'T1567', name: 'Exfiltration Over Web Service', tactic: 'Exfiltration' },
  
  // Impact
  T1486: { id: 'T1486', name: 'Data Encrypted for Impact', tactic: 'Impact' },
  T1490: { id: 'T1490', name: 'Inhibit System Recovery', tactic: 'Impact' },
  T1529: { id: 'T1529', name: 'System Shutdown/Reboot', tactic: 'Impact' }
};

/**
 * Map threat indicators to MITRE ATT&CK techniques
 * Uses keyword matching and alert type analysis
 */
function mapThreatToTechniques(threat) {
  const techniques = [];
  const title = (threat.title || '').toLowerCase();
  const description = (threat.description || '').toLowerCase();
  const alertType = threat.alert_type || '';
  const threatText = `${title} ${description} ${alertType}`.toLowerCase();

  // Network Anomaly -> C2 and Discovery
  if (alertType === 'network_anomaly' || threatText.includes('network')) {
    techniques.push('T1071', 'T1046', 'T1095');
  }

  // Device Tampering -> Persistence and Defense Evasion
  if (alertType === 'device_tampering' || threatText.includes('tamper') || threatText.includes('modify')) {
    techniques.push('T1543', 'T1562', 'T1574');
  }

  // Malware Detection -> Execution and Defense Evasion
  if (alertType === 'malware_detected' || threatText.includes('malware') || threatText.includes('virus')) {
    techniques.push('T1059', 'T1027', 'T1055');
  }

  // Surveillance Detection -> Collection and Credential Access
  if (alertType === 'surveillance_detected' || threatText.includes('surveillance') || threatText.includes('pegasus')) {
    techniques.push('T1113', 'T1056', 'T1005');
  }

  // Unauthorized Access -> Initial Access and Credential Access
  if (alertType === 'unauthorized_access' || threatText.includes('unauthorized') || threatText.includes('access')) {
    techniques.push('T1133', 'T1110', 'T1003');
  }

  // Data Exfiltration -> Exfiltration and Collection
  if (alertType === 'data_exfiltration' || threatText.includes('exfiltration') || threatText.includes('data leak')) {
    techniques.push('T1041', 'T1048', 'T1560');
  }

  // System Compromise -> Privilege Escalation and Persistence
  if (alertType === 'system_compromise' || threatText.includes('compromise') || threatText.includes('exploit')) {
    techniques.push('T1068', 'T1547', 'T1203');
  }

  // Privilege Escalation indicators
  if (threatText.includes('privilege') || threatText.includes('elevation') || threatText.includes('root')) {
    techniques.push('T1068', 'T1055');
  }

  // Credential theft indicators
  if (threatText.includes('credential') || threatText.includes('password') || threatText.includes('keylog')) {
    techniques.push('T1003', 'T1110', 'T1056');
  }

  // Ransomware indicators
  if (threatText.includes('ransom') || threatText.includes('encrypt')) {
    techniques.push('T1486', 'T1490');
  }

  // Phishing indicators
  if (threatText.includes('phish') || threatText.includes('email')) {
    techniques.push('T1566');
  }

  // C2 indicators
  if (threatText.includes('c2') || threatText.includes('command and control') || threatText.includes('beacon')) {
    techniques.push('T1071', 'T1095');
  }

  // Defense evasion indicators
  if (threatText.includes('evasion') || threatText.includes('obfuscat') || threatText.includes('hide')) {
    techniques.push('T1027', 'T1036', 'T1070');
  }

  // Lateral movement indicators
  if (threatText.includes('lateral') || threatText.includes('spread')) {
    techniques.push('T1021', 'T1080');
  }

  // Discovery indicators
  if (threatText.includes('discovery') || threatText.includes('recon') || threatText.includes('scan')) {
    techniques.push('T1082', 'T1083', 'T1057');
  }

  // Remove duplicates
  return [...new Set(techniques)];
}

/**
 * Get tactic color for visual distinction
 */
function getTacticColor(tactic) {
  const colors = {
    'Initial Access': 'bg-red-500/20 text-red-300 border-red-500/50',
    'Execution': 'bg-orange-500/20 text-orange-300 border-orange-500/50',
    'Persistence': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
    'Privilege Escalation': 'bg-purple-500/20 text-purple-300 border-purple-500/50',
    'Defense Evasion': 'bg-blue-500/20 text-blue-300 border-blue-500/50',
    'Credential Access': 'bg-pink-500/20 text-pink-300 border-pink-500/50',
    'Discovery': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50',
    'Lateral Movement': 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50',
    'Collection': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
    'Command and Control': 'bg-red-500/20 text-red-300 border-red-500/50',
    'Exfiltration': 'bg-rose-500/20 text-rose-300 border-rose-500/50',
    'Impact': 'bg-red-600/20 text-red-400 border-red-600/50'
  };
  return colors[tactic] || 'bg-slate-500/20 text-slate-300 border-slate-500/50';
}

/**
 * Main MITRE ATT&CK Mapper Component
 */
export default function MitreAttackMapper({ threat, compact = false }) {
  const techniqueIds = mapThreatToTechniques(threat);
  
  if (techniqueIds.length === 0) {
    return null;
  }

  const techniques = techniqueIds.map(id => ATTACK_TECHNIQUES[id]).filter(Boolean);

  if (compact) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {techniques.slice(0, 3).map(technique => (
          <a
            key={technique.id}
            href={`https://attack.mitre.org/techniques/${technique.id}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700/50 hover:border-blue-500/50 transition-all"
          >
            <Shield className="w-3 h-3" />
            {technique.id}
          </a>
        ))}
        {techniques.length > 3 && (
          <span className="text-xs text-slate-500">+{techniques.length - 3} more</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Shield className="w-3.5 h-3.5" />
        <span className="font-semibold">MITRE ATT&CK Techniques:</span>
      </div>
      
      <div className="space-y-2">
        {techniques.map(technique => (
          <a
            key={technique.id}
            href={`https://attack.mitre.org/techniques/${technique.id}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-2 rounded-lg bg-slate-800/30 border border-slate-700 hover:bg-slate-800/50 hover:border-blue-500/50 transition-all group"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Badge variant="outline" className={getTacticColor(technique.tactic)}>
                {technique.tactic}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white group-hover:text-blue-300 transition-colors">
                  {technique.id}: {technique.name}
                </p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors flex-shrink-0" />
          </a>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
        <AlertTriangle className="w-3 h-3" />
        <span>Techniques mapped from threat indicators • Click for MITRE documentation</span>
      </div>
    </div>
  );
}

/**
 * Export mapping function for external use
 */
export { mapThreatToTechniques, ATTACK_TECHNIQUES };