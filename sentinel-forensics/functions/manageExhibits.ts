import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Exhibit Numbering Management
 * Handles case-level exhibit configuration and assignment
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
      case 'get_config': {
        const { caseId } = params;
        
        let configs = await base44.entities.CaseExhibitConfig.filter({ case_id: caseId });
        
        // Create default config if none exists
        if (configs.length === 0) {
          const config = await base44.entities.CaseExhibitConfig.create({
            organization_id: user.organization_id,
            case_id: caseId,
            prefix: 'Exhibit',
            format_type: 'numeric',
            next_sequence: 1,
            auto_assign_on_ingest: false,
            last_modified_by: user.email
          });
          return Response.json({ config });
        }

        return Response.json({ config: configs[0] });
      }

      case 'update_config': {
        const { caseId, prefix, format_type, auto_assign_on_ingest } = params;
        
        const configs = await base44.entities.CaseExhibitConfig.filter({ case_id: caseId });
        
        if (configs.length === 0) {
          return Response.json({ error: 'Config not found' }, { status: 404 });
        }

        const updated = await base44.entities.CaseExhibitConfig.update(configs[0].id, {
          prefix: prefix || configs[0].prefix,
          format_type: format_type || configs[0].format_type,
          auto_assign_on_ingest: auto_assign_on_ingest !== undefined ? auto_assign_on_ingest : configs[0].auto_assign_on_ingest,
          last_modified_by: user.email
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: 'EXHIBIT_CONFIG_UPDATED',
          severity: 'info',
          description: `Exhibit config updated for case`,
          user_id: user.email,
          success: true,
          metadata: { case_id: caseId, changes: { prefix, format_type, auto_assign_on_ingest } }
        });

        return Response.json({ config: updated });
      }

      case 'assign_exhibit': {
        const { caseId, evidenceId, method } = params;

        // Check if already assigned
        const existing = await base44.entities.ExhibitAssignment.filter({
          case_id: caseId,
          evidence_id: evidenceId
        });

        if (existing.length > 0) {
          return Response.json({ assignment: existing[0], already_assigned: true });
        }

        // Get config
        const configs = await base44.entities.CaseExhibitConfig.filter({ case_id: caseId });
        if (configs.length === 0) {
          return Response.json({ error: 'No exhibit config found' }, { status: 404 });
        }

        const config = configs[0];

        // Generate exhibit number
        const exhibitNumber = generateExhibitNumber(
          config.prefix,
          config.format_type,
          config.next_sequence
        );

        // Create assignment
        const assignment = await base44.asServiceRole.entities.ExhibitAssignment.create({
          organization_id: user.organization_id,
          case_id: caseId,
          evidence_id: evidenceId,
          exhibit_number: exhibitNumber,
          sequence_value: config.next_sequence,
          assigned_by: user.email,
          assigned_at: new Date().toISOString(),
          assignment_method: method || 'manual'
        });

        // Increment sequence
        await base44.entities.CaseExhibitConfig.update(config.id, {
          next_sequence: config.next_sequence + 1
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: 'EXHIBIT_ASSIGNED',
          severity: 'info',
          description: `Exhibit ${exhibitNumber} assigned to evidence`,
          user_id: user.email,
          success: true,
          metadata: {
            case_id: caseId,
            evidence_id: evidenceId,
            exhibit_number: exhibitNumber,
            method
          }
        });

        return Response.json({ assignment });
      }

      case 'list_assignments': {
        const { caseId } = params;
        const assignments = await base44.entities.ExhibitAssignment.filter({
          case_id: caseId
        });
        
        // Sort by sequence
        assignments.sort((a, b) => a.sequence_value - b.sequence_value);
        
        return Response.json({ assignments });
      }

      case 'get_assignment': {
        const { evidenceId } = params;
        const assignments = await base44.entities.ExhibitAssignment.filter({
          evidence_id: evidenceId
        });
        return Response.json({ assignment: assignments[0] || null });
      }

      case 'bulk_assign': {
        const { caseId, evidenceIds, method } = params;
        
        const configs = await base44.entities.CaseExhibitConfig.filter({ case_id: caseId });
        if (configs.length === 0) {
          return Response.json({ error: 'No exhibit config found' }, { status: 404 });
        }

        const config = configs[0];
        const assignments = [];
        let sequence = config.next_sequence;

        for (const evidenceId of evidenceIds) {
          // Skip if already assigned
          const existing = await base44.entities.ExhibitAssignment.filter({
            case_id: caseId,
            evidence_id: evidenceId
          });

          if (existing.length === 0) {
            const exhibitNumber = generateExhibitNumber(
              config.prefix,
              config.format_type,
              sequence
            );

            const assignment = await base44.asServiceRole.entities.ExhibitAssignment.create({
              organization_id: user.organization_id,
              case_id: caseId,
              evidence_id: evidenceId,
              exhibit_number: exhibitNumber,
              sequence_value: sequence,
              assigned_by: user.email,
              assigned_at: new Date().toISOString(),
              assignment_method: method || 'bulk'
            });

            assignments.push(assignment);
            sequence++;
          }
        }

        // Update sequence
        await base44.entities.CaseExhibitConfig.update(config.id, {
          next_sequence: sequence
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: 'EXHIBIT_BULK_ASSIGNED',
          severity: 'info',
          description: `${assignments.length} exhibits assigned in bulk`,
          user_id: user.email,
          success: true,
          metadata: {
            case_id: caseId,
            count: assignments.length
          }
        });

        return Response.json({ assignments, count: assignments.length });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Exhibit management error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function generateExhibitNumber(prefix, formatType, sequence) {
  switch (formatType) {
    case 'alpha':
      return `${prefix} ${toAlpha(sequence)}`;
    case 'year_based':
      const year = new Date().getFullYear();
      return `${prefix} ${year}-${String(sequence).padStart(3, '0')}`;
    case 'numeric':
    default:
      return `${prefix} ${sequence}`;
  }
}

function toAlpha(num) {
  let result = '';
  while (num > 0) {
    const remainder = (num - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    num = Math.floor((num - 1) / 26);
  }
  return result || 'A';
}