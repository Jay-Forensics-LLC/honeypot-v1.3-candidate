import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Forensic Timeline Reconstruction Engine
 * Analyzes evidence and builds a defensible temporal sequence
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { caseId, autoCorrelate = true } = await req.json();

    if (!caseId) {
      return Response.json({ error: 'caseId required' }, { status: 400 });
    }

    // Get all evidence for case
    const evidence = await base44.entities.EvidenceV2.filter({ case_id: caseId });

    if (evidence.length === 0) {
      return Response.json({ 
        success: true, 
        message: 'No evidence to reconstruct',
        events: []
      });
    }

    // Extract temporal events from evidence
    const events = [];
    
    for (const item of evidence) {
      // Primary collection event
      const collectionTime = item.collection_timestamp || item.created_date;
      if (collectionTime) {
        events.push({
          organization_id: user.organization_id,
          case_id: caseId,
          event_timestamp: collectionTime,
          event_type: 'evidence_collection',
          event_title: `Evidence Collected: ${item.title}`,
          event_description: `${item.evidence_type} evidence collected by ${item.collected_by}`,
          severity: 'info',
          confidence: 90,
          source_evidence_ids: [item.id],
          metadata: {
            evidence_type: item.evidence_type,
            collector: item.collected_by,
            hash: item.sha256_hash
          },
          reconstructed_by: user.email
        });
      }

      // Parse metadata for additional timestamps
      if (item.metadata) {
        // File creation/modification times
        if (item.metadata.file_created_at) {
          events.push({
            organization_id: user.organization_id,
            case_id: caseId,
            event_timestamp: item.metadata.file_created_at,
            event_type: 'file_access',
            event_title: `File Created: ${item.title}`,
            event_description: 'Original file creation timestamp',
            severity: 'info',
            confidence: 80,
            source_evidence_ids: [item.id],
            metadata: { evidence_id: item.id },
            reconstructed_by: user.email
          });
        }

        if (item.metadata.file_modified_at) {
          events.push({
            organization_id: user.organization_id,
            case_id: caseId,
            event_timestamp: item.metadata.file_modified_at,
            event_type: 'file_access',
            event_title: `File Modified: ${item.title}`,
            event_description: 'File modification detected',
            severity: 'low',
            confidence: 80,
            source_evidence_ids: [item.id],
            metadata: { evidence_id: item.id },
            reconstructed_by: user.email
          });
        }

        // Network activity timestamps
        if (item.evidence_type === 'network_capture' && item.metadata.packets) {
          const packets = Array.isArray(item.metadata.packets) ? item.metadata.packets : [];
          packets.slice(0, 50).forEach((packet, idx) => {
            if (packet.timestamp) {
              events.push({
                organization_id: user.organization_id,
                case_id: caseId,
                event_timestamp: packet.timestamp,
                event_type: 'network_activity',
                event_title: `Network Packet: ${packet.protocol || 'Unknown'}`,
                event_description: `${packet.source_ip || 'Unknown'} → ${packet.dest_ip || 'Unknown'}`,
                severity: packet.is_suspicious ? 'high' : 'info',
                confidence: 70,
                source_evidence_ids: [item.id],
                metadata: { packet_index: idx, ...packet },
                reconstructed_by: user.email
              });
            }
          });
        }

        // System events
        if (item.metadata.event_time) {
          events.push({
            organization_id: user.organization_id,
            case_id: caseId,
            event_timestamp: item.metadata.event_time,
            event_type: 'system_event',
            event_title: item.metadata.event_type || 'System Event',
            event_description: item.description || 'System event detected',
            severity: item.metadata.severity || 'info',
            confidence: 75,
            source_evidence_ids: [item.id],
            metadata: { evidence_id: item.id },
            reconstructed_by: user.email
          });
        }
      }

      // Authentication events from logs
      if (item.evidence_type === 'log' && item.description) {
        const authPatterns = [
          { pattern: /login|signin|authenticate/i, type: 'authentication', severity: 'medium' },
          { pattern: /logout|signout/i, type: 'authentication', severity: 'low' },
          { pattern: /failed.*login|auth.*failed/i, type: 'authentication', severity: 'high' }
        ];

        authPatterns.forEach(({ pattern, type, severity }) => {
          if (pattern.test(item.description)) {
            events.push({
              organization_id: user.organization_id,
              case_id: caseId,
              event_timestamp: collectionTime,
              event_type: type,
              event_title: `Authentication Activity: ${item.title}`,
              event_description: item.description,
              severity: severity,
              confidence: 65,
              source_evidence_ids: [item.id],
              metadata: { evidence_id: item.id, pattern_matched: pattern.toString() },
              reconstructed_by: user.email
            });
          }
        });
      }
    }

    // Sort events chronologically
    events.sort((a, b) => new Date(a.event_timestamp) - new Date(b.event_timestamp));

    // Auto-correlate nearby events
    if (autoCorrelate) {
      for (let i = 0; i < events.length; i++) {
        const correlatedIds = [];
        const currentTime = new Date(events[i].event_timestamp);

        // Find events within 5 minutes
        for (let j = 0; j < events.length; j++) {
          if (i === j) continue;
          const otherTime = new Date(events[j].event_timestamp);
          const diffMs = Math.abs(currentTime - otherTime);
          const diffMinutes = diffMs / 1000 / 60;

          if (diffMinutes <= 5) {
            correlatedIds.push(j.toString());
          }
        }

        if (correlatedIds.length > 0) {
          events[i].correlated_events = correlatedIds;
        }
      }
    }

    // Detect timeline gaps (> 1 hour)
    const gaps = [];
    for (let i = 1; i < events.length; i++) {
      const prevTime = new Date(events[i - 1].event_timestamp);
      const currTime = new Date(events[i].event_timestamp);
      const gapHours = (currTime - prevTime) / 1000 / 60 / 60;

      if (gapHours > 1) {
        gaps.push({
          start: events[i - 1].event_timestamp,
          end: events[i].event_timestamp,
          duration_hours: gapHours.toFixed(2)
        });
      }
    }

    // Delete existing timeline events for this case
    const existingEvents = await base44.entities.TimelineEvent.filter({ case_id: caseId });
    for (const evt of existingEvents) {
      await base44.entities.TimelineEvent.delete(evt.id);
    }

    // Create new timeline events
    const createdEvents = [];
    for (const event of events) {
      const created = await base44.entities.TimelineEvent.create(event);
      createdEvents.push(created);
    }

    // Audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      event_type: 'TIMELINE_RECONSTRUCTED',
      severity: 'info',
      description: `Timeline reconstructed for case with ${createdEvents.length} events`,
      user_id: user.email,
      success: true,
      metadata: {
        case_id: caseId,
        event_count: createdEvents.length,
        gap_count: gaps.length,
        evidence_analyzed: evidence.length
      }
    });

    return Response.json({
      success: true,
      timeline: {
        events: createdEvents,
        total_events: createdEvents.length,
        timeline_gaps: gaps,
        earliest_event: events[0]?.event_timestamp,
        latest_event: events[events.length - 1]?.event_timestamp
      }
    });

  } catch (error) {
    console.error('Timeline reconstruction error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});