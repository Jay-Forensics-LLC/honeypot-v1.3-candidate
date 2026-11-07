/**
 * Run Security Detections (Internal Job)
 * Generates Finding records from agent events, inventory, and threat intel
 * 
 * Detection types:
 * - CVE mapping (software vulnerabilities)
 * - Persistence artifacts (suspicious tasks/services)
 * - Network threats (IOC matching, beaconing)
 * 
 * Triggered by: Scheduled automation (every 15 minutes)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireInternalJobSecret, sanitizeError } from './helpers/security.js';

const DETECTION_RUN_ID = crypto.randomUUID();

// Known CVE database (simplified - in production, use NVD API or local DB)
const CVE_DATABASE = {
  'chrome': {
    '120.0.6099.109': ['CVE-2024-0001', 'CVE-2024-0002'],
    '119.0.6045.123': ['CVE-2023-7024', 'CVE-2023-7023']
  },
  'firefox': {
    '121.0': ['CVE-2024-0741', 'CVE-2024-0742'],
    '120.0': ['CVE-2023-6856', 'CVE-2023-6857']
  },
  'windows': {
    '10.0.19045.3930': ['CVE-2024-20656', 'CVE-2024-20657']
  }
};

// Suspicious persistence patterns
const PERSISTENCE_RULES = [
  {
    rule_id: 'PERS-001',
    name: 'Suspicious Scheduled Task',
    pattern: /\\Microsoft\\Windows\\SystemRestore|\\Update\\|\\Maintenance\\/i,
    severity: 'HIGH'
  },
  {
    rule_id: 'PERS-002',
    name: 'Run Key with Script',
    pattern: /\.(vbs|ps1|bat|cmd)$/i,
    severity: 'MEDIUM'
  }
];

async function detectVulnerabilities(base44: any, orgId: string): Promise<any[]> {
  const findings = [];
  
  // Get software inventories
  const inventories = await base44.asServiceRole.entities.SoftwareInventory.filter({
    organization_id: orgId
  });
  
  for (const inventory of inventories) {
    const items = Array.isArray(inventory.items_json?.items) 
      ? inventory.items_json.items 
      : (inventory.items_json || []);
    
    for (const item of items) {
      const product = item.product?.toLowerCase() || '';
      const version = item.version || '';
      
      // Check CVE database
      for (const [key, versions] of Object.entries(CVE_DATABASE)) {
        if (product.includes(key) && versions[version]) {
          const cves = versions[version];
          
          for (const cve of cves) {
            findings.push({
              organization_id: orgId,
              finding_type: 'vulnerability',
              severity: 'HIGH',
              title: `${cve}: Vulnerable ${item.product} ${version} detected`,
              description: `Known vulnerability in installed software: ${item.product} ${version}`,
              details_json: {
                cve_id: cve,
                product: item.product,
                version: version,
                vendor: item.vendor,
                install_path: item.install_path,
                detection_method: 'software_inventory_cve_mapping'
              },
              device_id: inventory.device_id,
              evidence_links_json: {
                agent_event_ids: [inventory.source_event_id],
                software_inventory_id: inventory.id
              },
              provenance_json: {
                detection_rule: 'CVE_INVENTORY_MATCH',
                rule_version: '1.0',
                detection_run_id: DETECTION_RUN_ID,
                detection_method: 'cve_database_lookup',
                confidence_score: 95
              },
              status: 'open'
            });
          }
        }
      }
    }
  }
  
  return findings;
}

async function detectPersistence(base44: any, orgId: string): Promise<any[]> {
  const findings = [];
  
  // Get persistence artifact events
  const events = await base44.asServiceRole.entities.AgentEvent.filter({
    organization_id: orgId,
    event_type: 'persistence_artifact'
  });
  
  for (const event of events) {
    const artifacts = event.payload_json?.artifacts || [];
    
    for (const artifact of artifacts) {
      for (const rule of PERSISTENCE_RULES) {
        if (rule.pattern.test(artifact.path || artifact.name || '')) {
          findings.push({
            organization_id: orgId,
            finding_type: 'behavioral_anomaly',
            severity: rule.severity,
            title: rule.name,
            description: `Suspicious persistence mechanism detected: ${artifact.type}`,
            details_json: {
              artifact_type: artifact.type,
              artifact_name: artifact.name,
              artifact_path: artifact.path,
              command: artifact.command,
              hash: artifact.hash,
              rule_matched: rule.rule_id
            },
            device_id: event.device_id,
            evidence_links_json: {
              agent_event_ids: [event.id]
            },
            provenance_json: {
              detection_rule: rule.rule_id,
              rule_version: '1.0',
              detection_run_id: DETECTION_RUN_ID,
              detection_method: 'persistence_pattern_matching',
              confidence_score: 80
            },
            status: 'open'
          });
        }
      }
    }
  }
  
  return findings;
}

async function detectNetworkThreats(base44: any, orgId: string): Promise<any[]> {
  const findings = [];
  
  // Get network flow events
  const events = await base44.asServiceRole.entities.AgentEvent.filter({
    organization_id: orgId,
    event_type: 'network_flow'
  });
  
  // Get threat intel indicators
  const indicators = await base44.asServiceRole.entities.Indicator.filter({
    indicator_type: 'ip'
  });
  
  const maliciousIPs = new Set(indicators.map(i => i.value));
  
  for (const event of events) {
    const flows = event.payload_json?.flows || [];
    
    for (const flow of flows) {
      // Check against IOCs
      if (maliciousIPs.has(flow.destination_ip)) {
        findings.push({
          organization_id: orgId,
          finding_type: 'network_threat',
          severity: 'CRITICAL',
          title: `Connection to known malicious IP: ${flow.destination_ip}`,
          description: 'Network connection to IP address flagged in threat intelligence',
          details_json: {
            destination_ip: flow.destination_ip,
            destination_port: flow.destination_port,
            protocol: flow.protocol,
            process_name: flow.process_name,
            process_path: flow.process_path,
            bytes_sent: flow.bytes_sent,
            bytes_received: flow.bytes_received,
            connection_time: flow.timestamp
          },
          device_id: event.device_id,
          evidence_links_json: {
            agent_event_ids: [event.id],
            indicator_ids: indicators.filter(i => i.value === flow.destination_ip).map(i => i.id)
          },
          provenance_json: {
            detection_rule: 'NETWORK_IOC_MATCH',
            rule_version: '1.0',
            detection_run_id: DETECTION_RUN_ID,
            detection_method: 'ioc_correlation',
            confidence_score: 90
          },
          status: 'open'
        });
      }
    }
  }
  
  return findings;
}

Deno.serve(async (req) => {
  try {
    requireInternalJobSecret(req);
    
    const base44 = createClientFromRequest(req);
    
    // Get all organizations
    const orgs = await base44.asServiceRole.entities.User.list();
    const uniqueOrgs = [...new Set(orgs.map(u => u.organization_id).filter(Boolean))];
    
    let totalFindings = 0;
    const findingsByOrg: Record<string, number> = {};
    
    for (const orgId of uniqueOrgs) {
      const vulnFindings = await detectVulnerabilities(base44, orgId);
      const persistFindings = await detectPersistence(base44, orgId);
      const networkFindings = await detectNetworkThreats(base44, orgId);
      
      const allFindings = [...vulnFindings, ...persistFindings, ...networkFindings];
      
      // Create finding records (avoid duplicates)
      let createdCount = 0;
      for (const finding of allFindings) {
        // Check if similar finding already exists
        const existing = await base44.asServiceRole.entities.Finding.filter({
          organization_id: orgId,
          device_id: finding.device_id,
          finding_type: finding.finding_type,
          title: finding.title,
          status: 'open'
        });
        
        if (existing.length === 0) {
          await base44.asServiceRole.entities.Finding.create(finding);
          createdCount++;
        }
      }
      
      findingsByOrg[orgId] = createdCount;
      totalFindings += createdCount;
    }
    
    return Response.json({
      success: true,
      detection_run_id: DETECTION_RUN_ID,
      organizations_processed: uniqueOrgs.length,
      total_findings_created: totalFindings,
      findings_by_org: findingsByOrg,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[RUN-DETECTIONS] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});