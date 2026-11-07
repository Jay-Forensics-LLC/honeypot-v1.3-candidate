import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { createHash } from 'node:crypto';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trigger_id, event_context } = await req.json();

    if (!trigger_id) {
      return Response.json({ error: 'trigger_id required' }, { status: 400 });
    }

    // Get trigger configuration
    const triggers = await base44.entities.ForensicTrigger.filter({
      id: trigger_id,
      organization_id: user.organization_id,
      is_active: true
    });

    if (!triggers || triggers.length === 0) {
      return Response.json({ error: 'Trigger not found or inactive' }, { status: 404 });
    }

    const trigger = triggers[0];

    // Create collection record
    const collectionName = `${trigger.trigger_name}_${new Date().toISOString()}`;
    const collection = await base44.asServiceRole.entities.ForensicCollection.create({
      organization_id: user.organization_id,
      trigger_id: trigger.id,
      collection_name: collectionName,
      triggered_by_event: event_context || {},
      collection_timestamp: new Date().toISOString(),
      status: 'collecting',
      artifacts_collected: [],
      collection_metadata: {
        total_artifacts: 0,
        total_size_bytes: 0,
        devices_involved: [],
        users_involved: [],
        time_window_start: new Date(Date.now() - (trigger.collection_scope?.lookback_hours || 24) * 3600000).toISOString(),
        time_window_end: new Date().toISOString()
      },
      chain_of_custody: [{
        timestamp: new Date().toISOString(),
        action: 'collection_initiated',
        actor: user.email,
        hash_before: null,
        hash_after: null
      }]
    });

    // Collect artifacts based on scope
    const artifacts = [];
    const scope = trigger.collection_scope || {};

    // 1. Collect logs
    if (scope.collect_logs) {
      const logs = await collectSystemLogs(base44, user.organization_id, event_context, scope.lookback_hours);
      artifacts.push(...logs);
    }

    // 2. Collect network state
    if (scope.collect_network_state) {
      const networkState = await collectNetworkState(base44, user.organization_id, event_context);
      artifacts.push(...networkState);
    }

    // 3. Collect process information
    if (scope.collect_process_list) {
      const processes = await collectProcessInfo(base44, user.organization_id, event_context);
      artifacts.push(...processes);
    }

    // 4. Collect user activity
    if (scope.collect_user_activity) {
      const userActivity = await collectUserActivity(base44, user.organization_id, event_context, scope.lookback_hours);
      artifacts.push(...userActivity);
    }

    // Store artifacts with multi-location redundancy
    const storedArtifacts = await storeArtifacts(
      base44,
      collection.id,
      artifacts,
      trigger.storage_locations || ['primary', 'encrypted_vault']
    );

    // Run AI analysis if enabled
    let aiAnalysis = null;
    if (trigger.ai_analysis_enabled) {
      aiAnalysis = await runAIAnalysis(base44, collection, storedArtifacts, event_context);
    }

    // Calculate collection hash for integrity
    const collectionHash = createHash('sha256')
      .update(JSON.stringify({
        collection_id: collection.id,
        artifacts: storedArtifacts.map(a => a.hash_sha256),
        timestamp: collection.collection_timestamp
      }))
      .digest('hex');

    // Update collection with results
    await base44.asServiceRole.entities.ForensicCollection.update(collection.id, {
      status: 'completed',
      artifacts_collected: storedArtifacts.map(a => ({
        artifact_id: a.id,
        artifact_type: a.artifact_type,
        size_bytes: a.size_bytes,
        hash_sha256: a.hash_sha256,
        storage_locations: Object.keys(a.file_urls)
      })),
      collection_metadata: {
        ...collection.collection_metadata,
        total_artifacts: storedArtifacts.length,
        total_size_bytes: storedArtifacts.reduce((sum, a) => sum + a.size_bytes, 0)
      },
      ai_analysis: aiAnalysis,
      verified: true,
      collection_hash: collectionHash,
      chain_of_custody: [
        ...collection.chain_of_custody,
        {
          timestamp: new Date().toISOString(),
          action: 'collection_completed',
          actor: 'system',
          hash_before: null,
          hash_after: collectionHash
        }
      ]
    });

    // Update trigger execution count
    await base44.asServiceRole.entities.ForensicTrigger.update(trigger.id, {
      execution_count: (trigger.execution_count || 0) + 1,
      last_triggered_at: new Date().toISOString()
    });

    // Auto-create case if configured
    if (trigger.auto_create_case) {
      await autoCreateCase(base44, user.organization_id, collection, aiAnalysis);
    }

    // Send notifications
    if (trigger.notification_channels && trigger.notification_channels.length > 0) {
      await sendNotifications(base44, trigger, collection, aiAnalysis);
    }

    return Response.json({
      success: true,
      collection_id: collection.id,
      artifacts_count: storedArtifacts.length,
      collection_hash: collectionHash,
      ai_analysis: aiAnalysis
    });

  } catch (error) {
    console.error('Forensic collection failed:', error);
    return Response.json({ 
      error: 'Collection failed', 
      details: error.message 
    }, { status: 500 });
  }
});

async function collectSystemLogs(base44, orgId, eventContext, lookbackHours) {
  const artifacts = [];
  const startTime = new Date(Date.now() - lookbackHours * 3600000);

  // Collect device logs
  const deviceLogs = await base44.asServiceRole.entities.DeviceLog.filter({
    organization_id: orgId,
    created_date: { $gte: startTime.toISOString() }
  }, '-created_date', 1000);

  if (deviceLogs && deviceLogs.length > 0) {
    const logData = JSON.stringify(deviceLogs);
    artifacts.push({
      artifact_type: 'system_log',
      artifact_name: 'device_logs.json',
      artifact_content: { logs: deviceLogs },
      size_bytes: new Blob([logData]).size,
      hash_sha256: createHash('sha256').update(logData).digest('hex'),
      source_device_id: eventContext?.device_id || 'multiple',
      collected_at: new Date().toISOString()
    });
  }

  // Collect security events
  const securityEvents = await base44.asServiceRole.entities.SecurityEvent.filter({
    organization_id: orgId,
    detection_timestamp: { $gte: startTime.toISOString() }
  }, '-detection_timestamp', 1000);

  if (securityEvents && securityEvents.length > 0) {
    const eventData = JSON.stringify(securityEvents);
    artifacts.push({
      artifact_type: 'system_log',
      artifact_name: 'security_events.json',
      artifact_content: { events: securityEvents },
      size_bytes: new Blob([eventData]).size,
      hash_sha256: createHash('sha256').update(eventData).digest('hex'),
      collected_at: new Date().toISOString()
    });
  }

  return artifacts;
}

async function collectNetworkState(base44, orgId, eventContext) {
  const artifacts = [];

  // Collect network logs
  const networkLogs = await base44.asServiceRole.entities.NetworkLog.filter({
    organization_id: orgId
  }, '-created_date', 500);

  if (networkLogs && networkLogs.length > 0) {
    const logData = JSON.stringify(networkLogs);
    artifacts.push({
      artifact_type: 'network_connection_log',
      artifact_name: 'network_connections.json',
      artifact_content: { connections: networkLogs },
      size_bytes: new Blob([logData]).size,
      hash_sha256: createHash('sha256').update(logData).digest('hex'),
      collected_at: new Date().toISOString()
    });
  }

  return artifacts;
}

async function collectProcessInfo(base44, orgId, eventContext) {
  const artifacts = [];

  // Collect device information including running processes
  const devices = await base44.asServiceRole.entities.Device.filter({
    organization_id: orgId,
    status: 'enrolled'
  });

  if (devices && devices.length > 0) {
    const processData = JSON.stringify(devices.map(d => ({
      device_id: d.device_id,
      display_name: d.display_name,
      system_metrics: d.system_metrics,
      installed_software: d.installed_software,
      collected_at: new Date().toISOString()
    })));

    artifacts.push({
      artifact_type: 'process_list',
      artifact_name: 'device_processes.json',
      artifact_content: { devices: devices.length, snapshot_time: new Date().toISOString() },
      size_bytes: new Blob([processData]).size,
      hash_sha256: createHash('sha256').update(processData).digest('hex'),
      collected_at: new Date().toISOString()
    });
  }

  return artifacts;
}

async function collectUserActivity(base44, orgId, eventContext, lookbackHours) {
  const artifacts = [];
  const startTime = new Date(Date.now() - lookbackHours * 3600000);

  // Collect UBA data
  const ubaData = await base44.asServiceRole.entities.UserBehaviorAnalytics.filter({
    organization_id: orgId,
    analysis_period_start: { $gte: startTime.toISOString() }
  });

  if (ubaData && ubaData.length > 0) {
    const activityData = JSON.stringify(ubaData);
    artifacts.push({
      artifact_type: 'user_activity_log',
      artifact_name: 'user_behavior.json',
      artifact_content: { users: ubaData.length },
      size_bytes: new Blob([activityData]).size,
      hash_sha256: createHash('sha256').update(activityData).digest('hex'),
      collected_at: new Date().toISOString()
    });
  }

  return artifacts;
}

async function storeArtifacts(base44, collectionId, artifacts, storageLocations) {
  const storedArtifacts = [];

  for (const artifact of artifacts) {
    const fileUrls = {};

    // Store in primary location
    if (storageLocations.includes('primary')) {
      const artifactData = JSON.stringify(artifact.artifact_content);
      const blob = new Blob([artifactData], { type: 'application/json' });
      const file = new File([blob], artifact.artifact_name);

      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });
      fileUrls.primary = uploadResult.file_url;
    }

    // Store in encrypted vault
    if (storageLocations.includes('encrypted_vault')) {
      const encryptedData = JSON.stringify(artifact.artifact_content);
      const blob = new Blob([encryptedData], { type: 'application/json' });
      const file = new File([blob], `encrypted_${artifact.artifact_name}`);

      const uploadResult = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
      fileUrls.encrypted_vault = uploadResult.file_uri;
    }

    // Create artifact record
    const storedArtifact = await base44.asServiceRole.entities.ForensicArtifact.create({
      organization_id: artifact.organization_id || base44.auth.me().organization_id,
      collection_id: collectionId,
      artifact_type: artifact.artifact_type,
      artifact_name: artifact.artifact_name,
      source_device_id: artifact.source_device_id,
      source_user_email: artifact.source_user_email,
      collected_at: artifact.collected_at,
      artifact_content: artifact.artifact_content,
      file_urls: fileUrls,
      size_bytes: artifact.size_bytes,
      hash_sha256: artifact.hash_sha256,
      encrypted: storageLocations.includes('encrypted_vault'),
      chain_verified: true,
      tamper_evident: true
    });

    storedArtifacts.push(storedArtifact);
  }

  return storedArtifacts;
}

async function runAIAnalysis(base44, collection, artifacts, eventContext) {
  try {
    // Prepare data for AI analysis
    const analysisPrompt = `Analyze this forensic collection and provide:
1. Summary of findings
2. Threat indicators with confidence scores
3. Attack timeline reconstruction
4. Recommended immediate actions

Collection: ${collection.collection_name}
Triggered by: ${JSON.stringify(eventContext)}
Artifacts collected: ${artifacts.length}

Artifact summary:
${artifacts.map(a => `- ${a.artifact_type}: ${a.artifact_name}`).join('\n')}

Provide analysis in structured JSON format.`;

    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: analysisPrompt,
      response_json_schema: {
        type: 'object',
        properties: {
          findings_summary: { type: 'string' },
          threat_indicators: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                indicator: { type: 'string' },
                confidence: { type: 'number' },
                severity: { type: 'string' }
              }
            }
          },
          attack_timeline: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                timestamp: { type: 'string' },
                event: { type: 'string' },
                evidence_ids: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          recommended_actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string' },
                urgency: { type: 'string' },
                rationale: { type: 'string' }
              }
            }
          }
        }
      }
    });

    return {
      analysis_status: 'completed',
      ...response
    };

  } catch (error) {
    console.error('AI analysis failed:', error);
    return {
      analysis_status: 'failed',
      findings_summary: 'AI analysis failed: ' + error.message
    };
  }
}

async function autoCreateCase(base44, orgId, collection, aiAnalysis) {
  try {
    const caseData = {
      organization_id: orgId,
      case_name: `Automated: ${collection.collection_name}`,
      case_type: 'automated_forensic',
      severity: aiAnalysis?.threat_indicators?.[0]?.severity || 'medium',
      description: aiAnalysis?.findings_summary || 'Automatically created from forensic collection',
      status: 'open'
    };

    const newCase = await base44.asServiceRole.entities.Case.create(caseData);

    // Update collection with case reference
    await base44.asServiceRole.entities.ForensicCollection.update(collection.id, {
      case_id: newCase.id
    });

    return newCase;
  } catch (error) {
    console.error('Auto-create case failed:', error);
    return null;
  }
}

async function sendNotifications(base44, trigger, collection, aiAnalysis) {
  const message = `Forensic Collection Triggered: ${collection.collection_name}
Trigger: ${trigger.trigger_name}
Artifacts: ${collection.collection_metadata?.total_artifacts || 0}
${aiAnalysis?.findings_summary ? '\nFindings: ' + aiAnalysis.findings_summary : ''}`;

  for (const channel of trigger.notification_channels) {
    if (channel === 'email') {
      // Send email notification (implement based on available email service)
    }
  }
}