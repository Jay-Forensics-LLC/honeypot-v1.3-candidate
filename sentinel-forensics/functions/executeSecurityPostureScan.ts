import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SECURITY POSTURE SCANNER
 * Continuous monitoring for misconfigurations and vulnerabilities
 * 
 * ADMIN ONLY - Verifies admin role before execution
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    // SECURITY: Admin-only function
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    
    const { scan_type = 'system_config', trigger_type = 'manual', asset_ids = [] } = await req.json();
    
    const scanId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    
    // Create scan record
    const scanRecord = {
      id: scanId,
      organization_id: user.organization_id,
      scan_type,
      trigger_type,
      status: 'running',
      started_at: startedAt,
      assets_scanned: asset_ids,
      initiated_by: user.email,
      findings_count: { critical: 0, high: 0, medium: 0, low: 0 }
    };
    
    await base44.asServiceRole.entities.SecurityPostureScan.create(scanRecord);
    
    // Execute scan
    const findings = await performScan(base44, user.organization_id, scan_type, asset_ids);
    
    // Count by severity
    const counts = findings.reduce((acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, { critical: 0, high: 0, medium: 0, low: 0 });
    
    // Store findings
    for (const finding of findings) {
      await base44.asServiceRole.entities.SecurityFinding.create({
        ...finding,
        organization_id: user.organization_id,
        scan_id: scanId,
        first_detected: new Date().toISOString(),
        last_detected: new Date().toISOString(),
        detection_count: 1,
        status: 'open'
      });
    }
    
    // Calculate scan hash
    const scanHash = await calculateHash(JSON.stringify({
      scan_id: scanId,
      findings: findings.map(f => f.evidence_hash),
      timestamp: startedAt
    }));
    
    // Update scan record
    await base44.asServiceRole.entities.SecurityPostureScan.update(scanId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - new Date(startedAt).getTime(),
      findings_count: counts,
      scan_hash: scanHash
    });
    
    // Auto-remediate if policies exist
    await triggerRemediation(base44, user.organization_id, findings);
    
    return Response.json({
      success: true,
      scan_id: scanId,
      findings_count: counts,
      scan_hash: scanHash
    });
    
  } catch (error) {
    console.error('Security scan failed:', error);
    return Response.json({
      error: 'Security scan failed',
      details: error.message
    }, { status: 500 });
  }
});

/**
 * Perform security scan based on type
 */
async function performScan(base44, orgId, scanType, assetIds) {
  const findings = [];
  
  switch (scanType) {
    case 'system_config':
      findings.push(...await scanSystemConfig(base44, orgId));
      break;
      
    case 'application_config':
      findings.push(...await scanAppConfig(base44, orgId));
      break;
      
    case 'network_exposure':
      findings.push(...await scanNetworkExposure(base44, orgId));
      break;
      
    case 'dependency_vuln':
      findings.push(...await scanDependencies(base44, orgId));
      break;
      
    default:
      findings.push(...await scanSystemConfig(base44, orgId));
  }
  
  return findings;
}

/**
 * Scan system configurations
 */
async function scanSystemConfig(base44, orgId) {
  const findings = [];
  
  // Check device compliance
  const devices = await base44.asServiceRole.entities.Device.filter({ organization_id: orgId });
  
  for (const device of devices) {
    // Check for weak authentication
    if (!device.mfa_enabled) {
      const evidenceHash = await calculateHash(JSON.stringify({
        device_id: device.id,
        check: 'mfa_disabled',
        timestamp: new Date().toISOString()
      }));
      
      findings.push({
        finding_type: 'weak_auth',
        severity: 'high',
        title: `MFA Not Enabled on Device ${device.hostname || device.id}`,
        description: 'Multi-factor authentication is not enabled, creating authentication bypass risk',
        impact: 'Attackers could compromise device with stolen credentials alone',
        affected_assets: [{
          asset_id: device.id,
          asset_type: 'device',
          asset_name: device.hostname || device.id
        }],
        remediation_steps: [
          'Enable MFA for device access',
          'Configure backup authentication methods',
          'Review recent authentication logs'
        ],
        auto_remediable: false,
        evidence: { device_id: device.id, mfa_enabled: false },
        evidence_hash: evidenceHash
      });
    }
    
    // Check for excessive permissions
    if (device.admin_users && device.admin_users.length > 3) {
      const evidenceHash = await calculateHash(JSON.stringify({
        device_id: device.id,
        check: 'excessive_admins',
        count: device.admin_users.length,
        timestamp: new Date().toISOString()
      }));
      
      findings.push({
        finding_type: 'excessive_permissions',
        severity: 'medium',
        title: `Excessive Admin Users on ${device.hostname || device.id}`,
        description: `${device.admin_users.length} admin users configured, increasing attack surface`,
        impact: 'Higher risk of credential compromise and privilege abuse',
        affected_assets: [{
          asset_id: device.id,
          asset_type: 'device',
          asset_name: device.hostname || device.id
        }],
        remediation_steps: [
          'Review admin user list',
          'Remove unnecessary admin privileges',
          'Implement least-privilege principle'
        ],
        auto_remediable: false,
        evidence: { device_id: device.id, admin_count: device.admin_users.length },
        evidence_hash: evidenceHash
      });
    }
  }
  
  return findings;
}

/**
 * Scan application configurations
 */
async function scanAppConfig(base44, orgId) {
  const findings = [];
  
  // Check for weak session timeouts
  const evidenceHash = await calculateHash(JSON.stringify({
    check: 'session_timeout',
    timestamp: new Date().toISOString()
  }));
  
  findings.push({
    finding_type: 'misconfiguration',
    severity: 'medium',
    title: 'Session Timeout Configuration Review Required',
    description: 'Session timeout settings should be reviewed for compliance',
    impact: 'Extended sessions increase risk of session hijacking',
    affected_assets: [{
      asset_id: 'app',
      asset_type: 'application',
      asset_name: 'Sentinel Forensics Platform'
    }],
    remediation_steps: [
      'Review session timeout configuration',
      'Set timeout to 30 minutes for sensitive operations',
      'Implement idle timeout warnings'
    ],
    auto_remediable: false,
    evidence: { check_type: 'session_config' },
    evidence_hash: evidenceHash
  });
  
  return findings;
}

/**
 * Scan network exposure
 */
async function scanNetworkExposure(base44, orgId) {
  const findings = [];
  
  // Check for devices with public exposure
  const devices = await base44.asServiceRole.entities.Device.filter({ 
    organization_id: orgId 
  });
  
  for (const device of devices) {
    if (device.network_status === 'public' || device.external_ip) {
      const evidenceHash = await calculateHash(JSON.stringify({
        device_id: device.id,
        check: 'public_exposure',
        timestamp: new Date().toISOString()
      }));
      
      findings.push({
        finding_type: 'network_exposure',
        severity: 'high',
        title: `Public Network Exposure: ${device.hostname || device.id}`,
        description: 'Device is accessible from public internet',
        impact: 'Direct attack surface for external threat actors',
        affected_assets: [{
          asset_id: device.id,
          asset_type: 'device',
          asset_name: device.hostname || device.id
        }],
        remediation_steps: [
          'Move device behind firewall',
          'Implement VPN access requirement',
          'Review and restrict exposed ports'
        ],
        auto_remediable: false,
        evidence: { device_id: device.id, external_ip: device.external_ip },
        evidence_hash: evidenceHash
      });
    }
  }
  
  return findings;
}

/**
 * Scan for dependency vulnerabilities
 */
async function scanDependencies(base44, orgId) {
  const findings = [];
  
  // Placeholder for dependency scanning
  // Would integrate with OWASP Dependency-Check, Snyk, etc.
  
  return findings;
}

/**
 * Trigger automated remediation based on policies
 */
async function triggerRemediation(base44, orgId, findings) {
  try {
    // Fetch active remediation policies
    const policies = await base44.asServiceRole.entities.RemediationPolicy.filter({
      organization_id: orgId,
      is_enabled: true
    });
    
    for (const finding of findings) {
      // Match finding to policies
      const matchedPolicies = policies.filter(p => 
        p.condition.finding_types?.includes(finding.finding_type) &&
        p.condition.severities?.includes(finding.severity)
      );
      
      for (const policy of matchedPolicies) {
        if (policy.approval_mode === 'automatic' && finding.auto_remediable) {
          // Execute auto-remediation
          await executeRemediation(base44, finding, policy);
        } else if (policy.approval_mode === 'alert_only') {
          // Create alert
          await base44.asServiceRole.entities.Alert.create({
            organization_id: orgId,
            alert_type: 'security_finding',
            severity: finding.severity,
            title: finding.title,
            description: `Auto-remediation policy "${policy.name}" matched but requires approval`,
            source: 'security_posture_scan',
            status: 'new',
            detection_timestamp: new Date().toISOString()
          });
        }
      }
    }
  } catch (error) {
    console.error('Remediation trigger failed:', error);
  }
}

/**
 * Execute remediation action
 */
async function executeRemediation(base44, finding, policy) {
  const actionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  
  const actionRecord = {
    id: actionId,
    organization_id: finding.organization_id,
    finding_id: finding.id,
    policy_id: policy.id,
    action_type: policy.action.action_type,
    approval_mode: 'automatic',
    initiated_by: 'system',
    started_at: startedAt,
    status: 'running'
  };
  
  await base44.asServiceRole.entities.RemediationAction.create(actionRecord);
  
  try {
    // Execute action based on type
    // (Implementation would vary by action_type)
    
    // Update action as completed
    await base44.asServiceRole.entities.RemediationAction.update(actionId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - new Date(startedAt).getTime()
    });
    
  } catch (error) {
    await base44.asServiceRole.entities.RemediationAction.update(actionId, {
      status: 'failed',
      error_message: error.message,
      completed_at: new Date().toISOString()
    });
  }
}

/**
 * Calculate SHA-256 hash
 */
async function calculateHash(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}