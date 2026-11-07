import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { device_id } = await req.json();

    const device = await base44.entities.MobileDevice.get(device_id);
    if (!device) {
      return Response.json({ error: 'Device not found' }, { status: 404 });
    }

    // Fetch org default policy if exists
    const orgDefaults = await base44.entities.MDMPolicy.filter({
      is_default: true,
      $or: [
        { platform: device.platform },
        { platform: 'both' }
      ]
    });
    const orgDefault = orgDefaults[0] || null;

    // Fetch device-assigned policy if exists
    let assignedPolicy = null;
    if (device.policy_state?.applied_policy_id) {
      assignedPolicy = await base44.entities.MDMPolicy.get(device.policy_state.applied_policy_id);
    }

    // Build policy sources list (priority order: higher number = lower priority, baseline wins)
    const sources = [];
    
    // Platform baseline (implicit, highest priority for security-floor settings)
    const baseline = {
      source_type: 'baseline',
      name: `${device.platform.toUpperCase()} Security Baseline`,
      priority: 1000,
      policy_config: getBaseline(device.platform)
    };
    sources.push(baseline);

    // Org default policy
    if (orgDefault) {
      sources.push({
        source_type: 'org_default',
        policy_id: orgDefault.id,
        name: orgDefault.policy_name,
        priority: 500,
        policy_config: orgDefault.policy_config
      });
    }

    // Device-assigned policy (lowest priority, but user-specific)
    if (assignedPolicy) {
      sources.push({
        source_type: 'device_assignment',
        policy_id: assignedPolicy.id,
        name: assignedPolicy.policy_name,
        priority: 100,
        policy_config: assignedPolicy.policy_config
      });
    }

    // Compute effective policy + resolution map
    const { effectivePolicy, resolutionMap, domainSummary } = mergePoliciesToEffective(sources);

    const result = {
      device_id,
      evaluated_at: new Date().toISOString(),
      platform: device.platform,
      policy_sources: sources.map(s => ({
        source_type: s.source_type,
        name: s.name,
        priority: s.priority,
        policy_id: s.policy_id || null
      })),
      effective_policy: effectivePolicy,
      resolution_map: resolutionMap,
      domain_summary: domainSummary
    };

    return Response.json(result);

  } catch (error) {
    console.error('getEffectiveMDMPolicy error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getBaseline(platform) {
  // Minimal security floor enforced regardless of policy
  return {
    passcode: {
      required: true, // Security floor
      min_length: 4,
      require_alphanumeric: false,
      allow_biometric: true,
      max_failed_attempts: 10
    },
    encryption: {
      require_device_encryption: platform === 'ios' // iOS default
    },
    network: {
      require_vpn: false,
      block_untrusted_wifi: false
    },
    app_restrictions: {
      blocked_apps: [],
      require_app_signatures: platform === 'ios' // iOS enforced
    },
    security: {
      enable_remote_wipe: true,
      allow_camera: true,
      allow_screenshots: true,
      require_screen_lock: true
    }
  };
}

function mergePoliciesToEffective(sources) {
  const resolutionMap = {};
  const domainSummary = {};
  const effectivePolicy = { policy_config: {} };

  // Define resolution rules per key path
  const rules = {
    // Booleans where true = more secure (OR logic)
    'passcode.required': { type: 'bool_or', rationale: 'Passcode remains required (security floor)' },
    'encryption.require_device_encryption': { type: 'bool_or', rationale: 'Encryption enforced (most restrictive)' },
    'network.require_vpn': { type: 'bool_or', rationale: 'VPN required (most restrictive)' },
    'network.block_untrusted_wifi': { type: 'bool_or', rationale: 'Untrusted WiFi blocked (most restrictive)' },
    'security.enable_remote_wipe': { type: 'bool_or', rationale: 'Remote wipe enabled (security requirement)' },
    'security.require_screen_lock': { type: 'bool_or', rationale: 'Screen lock required (security floor)' },
    
    // Booleans where false = more secure (AND logic)
    'security.allow_camera': { type: 'bool_and', rationale: 'Camera access denied (most restrictive)' },
    'security.allow_screenshots': { type: 'bool_and', rationale: 'Screenshots denied (most restrictive)' },
    
    // Numbers (restrictive max/min)
    'passcode.min_length': { type: 'number_max', rationale: 'Longest passcode required (most restrictive)' },
    'passcode.max_failed_attempts': { type: 'number_min', rationale: 'Fewest attempts allowed (most restrictive)' },
    
    // Arrays (union)
    'app_restrictions.blocked_apps': { type: 'array_union', rationale: 'All blocked apps combined (most restrictive)' },
    
    // Pass-through (first wins or specific logic)
    'passcode.require_alphanumeric': { type: 'bool_or', rationale: 'Alphanumeric required (most restrictive)' },
    'passcode.allow_biometric': { type: 'first_defined', rationale: 'First policy defining this value' },
    'app_restrictions.require_app_signatures': { type: 'bool_or', rationale: 'App signatures required (most restrictive)' }
  };

  const domains = ['passcode', 'encryption', 'network', 'app_restrictions', 'security'];

  domains.forEach(domain => {
    effectivePolicy.policy_config[domain] = {};
    domainSummary[domain] = { conflicts: 0, keys: 0 };
  });

  // Process each rule
  Object.entries(rules).forEach(([keyPath, rule]) => {
    const [domain, key] = keyPath.split('.');
    domainSummary[domain].keys++;

    const candidates = [];
    sources.forEach(source => {
      const value = source.policy_config?.[domain]?.[key];
      if (value !== undefined) {
        candidates.push({
          source_type: source.source_type,
          name: source.name,
          priority: source.priority,
          value
        });
      }
    });

    if (candidates.length === 0) {
      // No value defined, skip
      return;
    }

    let finalValue;
    let winnerSource;
    let ruleUsed;

    if (rule.type === 'bool_or') {
      // Any true wins
      const trueCandidate = candidates.find(c => c.value === true);
      if (trueCandidate) {
        finalValue = true;
        winnerSource = trueCandidate;
      } else {
        finalValue = false;
        winnerSource = candidates[0]; // First (highest priority)
      }
      ruleUsed = 'security_floor_or';
    } else if (rule.type === 'bool_and') {
      // Any false wins
      const falseCandidate = candidates.find(c => c.value === false);
      if (falseCandidate) {
        finalValue = false;
        winnerSource = falseCandidate;
      } else {
        finalValue = true;
        winnerSource = candidates[0];
      }
      ruleUsed = 'security_floor_and';
    } else if (rule.type === 'number_max') {
      // Highest number wins
      candidates.sort((a, b) => b.value - a.value);
      finalValue = candidates[0].value;
      winnerSource = candidates[0];
      ruleUsed = 'max_restrictive';
    } else if (rule.type === 'number_min') {
      // Lowest number wins
      candidates.sort((a, b) => a.value - b.value);
      finalValue = candidates[0].value;
      winnerSource = candidates[0];
      ruleUsed = 'min_restrictive';
    } else if (rule.type === 'array_union') {
      // Merge all arrays
      const allValues = candidates.flatMap(c => c.value || []);
      finalValue = [...new Set(allValues)]; // Deduplicate
      winnerSource = { source_type: 'merged', name: 'All sources (union)' };
      ruleUsed = 'array_union';
    } else if (rule.type === 'first_defined') {
      // First defined wins (by priority)
      finalValue = candidates[0].value;
      winnerSource = candidates[0];
      ruleUsed = 'first_defined';
    }

    effectivePolicy.policy_config[domain][key] = finalValue;

    if (candidates.length > 1) {
      domainSummary[domain].conflicts++;
    }

    resolutionMap[`policy_config.${domain}.${key}`] = {
      final_value: finalValue,
      rule: ruleUsed,
      winner_source: {
        source_type: winnerSource.source_type,
        name: winnerSource.name
      },
      candidates: candidates.map(c => ({
        source_type: c.source_type,
        name: c.name,
        value: c.value
      })),
      rationale: rule.rationale
    };
  });

  return { effectivePolicy, resolutionMap, domainSummary };
}