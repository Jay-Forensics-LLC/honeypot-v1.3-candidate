import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Evidence Snapshot Management
 * Creates immutable point-in-time snapshots of evidence for forensic defensibility
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, ...params } = await req.json();

    switch (action) {
      case 'create_snapshot': {
        const { caseId, snapshotName, evidenceIds, purpose, notes } = params;

        // Fetch all evidence
        const evidence = await Promise.all(
          evidenceIds.map(id => base44.entities.EvidenceV2.filter({ id }))
        );
        const flatEvidence = evidence.flat();

        if (flatEvidence.length === 0) {
          return Response.json({ error: 'No evidence found' }, { status: 404 });
        }

        // Fetch tags for each evidence
        const tagsMap = {};
        for (const ev of flatEvidence) {
          const tags = await base44.entities.EvidenceTag.filter({
            evidence_id: ev.id,
            is_active: true
          });
          const tagIds = tags.map(t => t.tag_id);
          const tagRecords = await Promise.all(
            tagIds.map(id => base44.entities.Tag.filter({ id }))
          );
          tagsMap[ev.id] = tagRecords.flat().map(t => t.display_name);
        }

        // Fetch exhibit assignments
        const exhibitsMap = {};
        for (const ev of flatEvidence) {
          const assignments = await base44.entities.ExhibitAssignment.filter({
            evidence_id: ev.id
          });
          if (assignments.length > 0) {
            exhibitsMap[ev.id] = assignments[0].exhibit_number;
          }
        }

        // Create snapshot items
        const snapshotItems = flatEvidence.map(ev => ({
          evidence_id: ev.id,
          frozen_state: {
            title: ev.title,
            description: ev.description,
            evidence_type: ev.evidence_type,
            file_name: ev.file_name,
            file_size: ev.file_size,
            file_url: ev.file_url,
            collection_timestamp: ev.collection_timestamp,
            collected_by: ev.collected_by,
            metadata: ev.metadata
          },
          evidence_hash: ev.sha256_hash,
          exhibit_number: exhibitsMap[ev.id] || null,
          tags_at_freeze: tagsMap[ev.id] || [],
          ai_analysis_refs: []
        }));

        // Calculate snapshot hash
        const snapshotContent = JSON.stringify(snapshotItems);
        const encoder = new TextEncoder();
        const data = encoder.encode(snapshotContent);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const snapshotHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Get case info
        const cases = await base44.entities.Case.filter({ id: caseId });
        const caseStatus = cases[0]?.status || 'unknown';

        // Create snapshot
        const snapshot = await base44.asServiceRole.entities.EvidenceSnapshot.create({
          organization_id: user.organization_id,
          case_id: caseId,
          snapshot_name: snapshotName,
          snapshot_hash: snapshotHash,
          created_by: user.email,
          frozen_at: new Date().toISOString(),
          evidence_count: flatEvidence.length,
          snapshot_metadata: {
            case_status: caseStatus,
            purpose: purpose || 'General analysis',
            notes: notes || ''
          }
        });

        // Create snapshot items
        const createdItems = await Promise.all(
          snapshotItems.map(item =>
            base44.asServiceRole.entities.EvidenceSnapshotItem.create({
              organization_id: user.organization_id,
              snapshot_id: snapshot.id,
              ...item
            })
          )
        );

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: 'EVIDENCE_SNAPSHOT_CREATED',
          severity: 'info',
          description: `Evidence snapshot "${snapshotName}" created with ${flatEvidence.length} items`,
          user_id: user.email,
          success: true,
          metadata: {
            snapshot_id: snapshot.id,
            case_id: caseId,
            evidence_count: flatEvidence.length,
            snapshot_hash: snapshotHash
          }
        });

        return Response.json({ snapshot, items: createdItems });
      }

      case 'list_snapshots': {
        const { caseId } = params;
        const snapshots = await base44.entities.EvidenceSnapshot.filter({
          case_id: caseId
        });
        
        snapshots.sort((a, b) => new Date(b.frozen_at) - new Date(a.frozen_at));
        
        return Response.json({ snapshots });
      }

      case 'get_snapshot': {
        const { snapshotId } = params;
        
        const snapshots = await base44.entities.EvidenceSnapshot.filter({
          id: snapshotId
        });
        
        if (snapshots.length === 0) {
          return Response.json({ error: 'Snapshot not found' }, { status: 404 });
        }

        const items = await base44.entities.EvidenceSnapshotItem.filter({
          snapshot_id: snapshotId
        });

        return Response.json({ snapshot: snapshots[0], items });
      }

      case 'verify_snapshot': {
        const { snapshotId } = params;
        
        const snapshots = await base44.entities.EvidenceSnapshot.filter({
          id: snapshotId
        });
        
        if (snapshots.length === 0) {
          return Response.json({ error: 'Snapshot not found' }, { status: 404 });
        }

        const snapshot = snapshots[0];
        const items = await base44.entities.EvidenceSnapshotItem.filter({
          snapshot_id: snapshotId
        });

        // Recalculate hash
        const snapshotContent = JSON.stringify(items.map(i => ({
          evidence_id: i.evidence_id,
          frozen_state: i.frozen_state,
          evidence_hash: i.evidence_hash,
          exhibit_number: i.exhibit_number,
          tags_at_freeze: i.tags_at_freeze,
          ai_analysis_refs: i.ai_analysis_refs
        })));
        
        const encoder = new TextEncoder();
        const data = encoder.encode(snapshotContent);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const calculatedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const isValid = calculatedHash === snapshot.snapshot_hash;

        return Response.json({
          valid: isValid,
          stored_hash: snapshot.snapshot_hash,
          calculated_hash: calculatedHash
        });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Evidence snapshot error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});