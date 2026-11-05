import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import crypto from 'node:crypto';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { operation, device_id } = await req.json();

    if (operation === 'resolve' || !operation) {

      const resolution = await computeEffectivePolicy(base44, user.organization_id, device_id);
      return Response.json(resolution);
    }

    return Response.json({ error: 'Unknown operation' }, { status: 400 });
  } catch (error) {
    console.error('Resolution error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function computeEffectivePolicy(base44, organization_id, device_id) {
  // Get all active assignments for device
  const directAssignments = await base44.asServiceRole.entities.PolicyAssignment.filter({
    organization_id,
    target_type: 'DEVICE',
    target_id: device_id,
    is_active: true
  });

  // Get group assignments
  const memberships = await base44.asServiceRole.entities.DeviceGroupMembership.filter({
    organization_id,
    device_id
  });

  const groupAssignments = [];
  for (const membership of memberships) {
    const assignments = await base44.asServiceRole.entities.PolicyAssignment.filter({
      organization_id,
      target_type: 'GROUP',
      target_id: membership.group_id,
      is_active: true
    });
    groupAssignments.push(...assignments);
  }

  // Merge all assignments
  const allAssignments = [...directAssignments, ...groupAssignments];
  
  if (allAssignments.length === 0) {
    return {
      device_id,
      resolved_policy_ids: [],
      resolved_policy_payload_json: getDefaultPolicy(),
      resolution_metadata: {
        total_assignments: 0,
        direct_assignments: 0,
        group_assignments: 0,
        conflict_resolution_log: []
      }
    };
  }

  // Sort by priority (higher first)
  allAssignments.sort((a, b) => b.priority - a.priority);

  // Fetch policies
  const policies = await Promise.all(
    allAssignments.map(a => base44.asServiceRole.entities.SecurityPolicy.get(a.policy_id))
  );

  // Merge policies
  const merged = mergePolicies(policies, allAssignments);

  // Compute hash
  const resolution_hash = crypto.createHash('sha256')
    .update(JSON.stringify(merged.resolved_policy_payload_json))
    .digest('hex');

  // Store resolution
  const resolution = await base44.asServiceRole.entities.EffectivePolicyResolution.create({
    organization_id,
    device_id,
    resolved_policy_ids: policies.map(p => p.id),
    resolved_policy_payload_json: merged.resolved_policy_payload_json,
    resolution_metadata: {
      total_assignments: allAssignments.length,
      direct_assignments: directAssignments.length,
      group_assignments: groupAssignments.length,
      conflict_resolution_log: merged.conflict_log
    },
    resolved_at: new Date().toISOString(),
    resolution_hash
  });

  return resolution;
}

function mergePolicies(policies, assignments) {
  const conflict_log = [];
  
  // Auto-response: union of enabled rules, highest priority wins on conflicts
  const autoResponseRules = [];
  const seenTriggers = new Set();
  
  for (let i = 0; i < policies.length; i++) {
    const rules = policies[i].policy_payload_json?.auto_response_rules || [];
    for (const rule of rules) {
      if (rule.enabled && !seenTriggers.has(rule.trigger_event)) {
        autoResponseRules.push(rule);
        seenTriggers.add(rule.trigger_event);
        conflict_log.push({
          domain: 'auto_response',
          winning_policy_id: policies[i].id,
          reason: `Priority ${assignments[i].priority} for trigger ${rule.trigger_event}`
        });
      }
    }
  }

  // Firewall: STRICT > BALANCED > CUSTOM, highest priority overrides
  let firewallConfig = null;
  const profilePrecedence = { STRICT: 3, BALANCED: 2, CUSTOM: 1 };
  let highestFirewallPrecedence = 0;

  for (let i = 0; i < policies.length; i++) {
    const fw = policies[i].policy_payload_json?.firewall_config;
    if (fw) {
      const precedence = profilePrecedence[fw.profile] || 0;
      if (precedence > highestFirewallPrecedence || (precedence === highestFirewallPrecedence && i === 0)) {
        firewallConfig = fw;
        highestFirewallPrecedence = precedence;
        conflict_log.push({
          domain: 'firewall',
          winning_policy_id: policies[i].id,
          reason: `Profile ${fw.profile} (precedence ${precedence})`
        });
      }
    }
  }

  // USB: BLOCK_ALL > BLOCKLIST > ALLOWLIST > ALLOW_ALL
  let usbRestrictions = null;
  const usbPrecedence = { BLOCK_ALL: 4, BLOCKLIST: 3, ALLOWLIST: 2, ALLOW_ALL: 1 };
  let highestUsbPrecedence = 0;

  for (let i = 0; i < policies.length; i++) {
    const usb = policies[i].policy_payload_json?.usb_restrictions;
    if (usb) {
      const precedence = usbPrecedence[usb.mode] || 0;
      if (precedence > highestUsbPrecedence || (precedence === highestUsbPrecedence && i === 0)) {
        usbRestrictions = usb;
        highestUsbPrecedence = precedence;
        conflict_log.push({
          domain: 'usb',
          winning_policy_id: policies[i].id,
          reason: `Mode ${usb.mode} (precedence ${precedence})`
        });
      }
    }
  }

  // Hardening: REQUIRED accumulates, duplicates resolved by priority
  const hardeningItems = [];
  const seenControls = new Set();

  for (let i = 0; i < policies.length; i++) {
    const items = policies[i].policy_payload_json?.hardening_checklist?.items || [];
    for (const item of items) {
      if (item.requirement === 'REQUIRED' && !seenControls.has(item.control_id)) {
        hardeningItems.push(item);
        seenControls.add(item.control_id);
      }
    }
  }

  return {
    resolved_policy_payload_json: {
      auto_response_rules: autoResponseRules,
      firewall_config: firewallConfig,
      usb_restrictions: usbRestrictions,
      hardening_checklist: { items: hardeningItems }
    },
    conflict_log
  };
}

function getDefaultPolicy() {
  return {
    auto_response_rules: [],
    firewall_config: { profile: 'BALANCED', logging_level: 'BASIC', rules: [], apply_mode: 'RECOMMEND_ONLY' },
    usb_restrictions: { mode: 'ALLOW_ALL', log_violations: false, alert_on_violation: false },
    hardening_checklist: { items: [] }
  };
}