import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Compliance Evaluation Engine
 * Evaluates a device against baseline compliance policies
 * Stores violations as DeviceEvent records
 */

const DEFAULT_POLICIES = {
  os_supported: {
    name: 'OS Supported',
    check: (device, config) => {
      const supported = {
        Windows: ['10', '11'],
        macOS: ['12', '13', '14', '15'],
        Linux: ['5.10', '5.15', '6.0'],
        iOS: ['15', '16', '17', '18'],
        Android: ['12', '13', '14', '15']
      };
      
      const family = device.os_family;
      const version = device.os_version || '';
      const supportedVersions = supported[family] || [];
      
      return supportedVersions.some(v => version.startsWith(v));
    }
  },
  agent_version_minimum: {
    name: 'Agent Version Minimum',
    check: (device, config) => {
      const minVersion = config?.min_version || '1.0.0';
      const agentVersion = device.agent_version || '0.0.0';
      return agentVersion >= minVersion;
    }
  },
  disk_encryption: {
    name: 'Disk Encryption Enabled',
    check: (device) => device.disk_encryption_enabled === true
  },
  firewall: {
    name: 'Firewall Enabled',
    check: (device) => device.firewall_enabled === true
  },
  secure_boot: {
    name: 'Secure Boot Enabled',
    check: (device) => {
      // Exempt mobile devices from secure boot requirement
      if (['iOS', 'Android'].includes(device.os_family)) return true;
      return device.secure_boot_enabled === true;
    }
  },
  edr_present: {
    name: 'EDR Present',
    check: (device) => device.edr_present === true
  },
  last_seen_freshness: {
    name: 'Last Seen Freshness',
    check: (device, config) => {
      const maxStaleDays = config?.max_stale_days || 7;
      if (!device.agent_last_seen_at) return false;
      
      const lastSeen = new Date(device.agent_last_seen_at);
      const daysSince = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince <= maxStaleDays;
    }
  }
};

function calculateRiskScore(violations) {
  const weights = {
    critical: 30,
    high: 20,
    medium: 10,
    low: 5
  };
  
  let score = 0;
  violations.forEach(v => {
    score += weights[v.severity] || 0;
  });
  
  return Math.min(score, 100);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { device_id, trigger_remediation } = await req.json();

    if (!device_id) {
      return Response.json({ error: 'device_id required' }, { status: 400 });
    }

    // Fetch device
    const devices = await base44.entities.Device.filter({
      organization_id: user.organization_id,
      id: device_id
    });

    if (devices.length === 0) {
      return Response.json({ error: 'Device not found' }, { status: 404 });
    }

    const device = devices[0];

    // Fetch active compliance policies
    const policies = await base44.entities.CompliancePolicy.filter({
      organization_id: user.organization_id,
      enabled: true
    });

    // Build policy map
    const policyMap = {};
    policies.forEach(p => {
      policyMap[p.policy_name] = p;
    });

    // Evaluate all policies
    const violations = [];
    const passed = [];

    for (const [policyKey, policyDef] of Object.entries(DEFAULT_POLICIES)) {
      const customPolicy = policyMap[policyKey];
      
      // Skip if device is exempted
      if (customPolicy?.exempted_devices?.includes(device_id)) {
        continue;
      }

      const policyConfig = customPolicy?.policy_config || {};
      const isCompliant = policyDef.check(device, policyConfig);

      if (!isCompliant) {
        violations.push({
          policy: policyKey,
          policy_name: policyDef.name,
          severity: customPolicy?.severity || 'medium',
          auto_remediate: customPolicy?.auto_remediate || false
        });
      } else {
        passed.push(policyKey);
      }
    }

    // Calculate compliance status
    const criticalCount = violations.filter(v => v.severity === 'critical').length;
    const highCount = violations.filter(v => v.severity === 'high').length;
    
    let complianceStatus = 'pass';
    if (criticalCount > 0 || highCount > 2) {
      complianceStatus = 'fail';
    } else if (violations.length > 0) {
      complianceStatus = 'warn';
    }

    const riskScore = calculateRiskScore(violations);

    // Store compliance evaluation as DeviceEvent
    await base44.asServiceRole.entities.DeviceEvent.create({
      organization_id: user.organization_id,
      device_id,
      event_type: 'compliance_eval',
      payload: {
        evaluated_at: new Date().toISOString(),
        compliance_status: complianceStatus,
        violations,
        passed_policies: passed,
        risk_score: riskScore,
        total_policies_checked: Object.keys(DEFAULT_POLICIES).length
      },
      actor: 'system',
      status: 'success'
    });

    // Store individual violations as policy_violation events
    for (const violation of violations) {
      await base44.asServiceRole.entities.DeviceEvent.create({
        organization_id: user.organization_id,
        device_id,
        event_type: 'policy_violation',
        payload: {
          policy: violation.policy,
          policy_name: violation.policy_name,
          severity: violation.severity,
          detected_at: new Date().toISOString(),
          device_info: {
            hostname: device.hostname,
            user: device.user,
            os: `${device.os_family} ${device.os_version}`
          }
        },
        actor: 'system',
        status: 'success'
      });
    }

    // Update device compliance fields
    await base44.asServiceRole.entities.Device.update(device_id, {
      compliance_status: complianceStatus,
      risk_score: riskScore,
      critical_findings_count: criticalCount,
      agent_status: device.agent_last_seen_at ? 
        ((Date.now() - new Date(device.agent_last_seen_at).getTime()) < 300000 ? 'online' : 'stale') : 
        'offline'
    });

    return Response.json({
      success: true,
      device_id,
      compliance_status: complianceStatus,
      risk_score: riskScore,
      violations,
      passed_policies: passed,
      total_violations: violations.length,
      critical_violations: criticalCount
    });

  } catch (error) {
    console.error('Compliance evaluation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});