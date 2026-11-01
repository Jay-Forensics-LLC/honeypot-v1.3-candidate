import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Manage Report Definitions (CRUD)
 * RBAC: Only users with case access can manage report definitions
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
      case 'create': {
        const { caseId, name, description, template, config } = params;

        // Verify case access
        const cases = await base44.entities.Case.filter({ id: caseId });
        if (!cases[0]) {
          return Response.json({ error: 'Case not found' }, { status: 404 });
        }

        // Hash config for tamper-evidence
        const configStr = JSON.stringify(config);
        const configHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(configStr));
        const configHashHex = Array.from(new Uint8Array(configHash))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        // Create definition
        const definition = await base44.entities.ReportDefinition.create({
          organization_id: user.organization_id,
          case_id: caseId,
          name,
          description: description || '',
          template,
          created_by: user.email
        });

        // Create initial version
        const version = await base44.asServiceRole.entities.ReportDefinitionVersion.create({
          organization_id: user.organization_id,
          definition_id: definition.id,
          version_number: 1,
          config,
          config_hash: configHashHex,
          created_by: user.email
        });

        // Update definition with current version
        await base44.entities.ReportDefinition.update(definition.id, {
          current_version_id: version.id
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: 'REPORT_DEFINITION_CREATED',
          severity: 'info',
          description: `Report definition created: ${name}`,
          user_id: user.email,
          success: true,
          metadata: {
            definition_id: definition.id,
            case_id: caseId,
            version_id: version.id,
            config_hash: configHashHex
          }
        });

        return Response.json({ definition, version });
      }

      case 'list': {
        const { caseId } = params;
        const definitions = await base44.entities.ReportDefinition.filter({
          case_id: caseId,
          is_archived: false
        });
        return Response.json({ definitions });
      }

      case 'get': {
        const { definitionId } = params;
        const definitions = await base44.entities.ReportDefinition.filter({ id: definitionId });
        const definition = definitions[0];

        if (!definition) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }

        // Get versions
        const versions = await base44.asServiceRole.entities.ReportDefinitionVersion.filter({
          definition_id: definitionId
        });

        return Response.json({ definition, versions });
      }

      case 'update_version': {
        const { definitionId, config } = params;

        const definitions = await base44.entities.ReportDefinition.filter({ id: definitionId });
        const definition = definitions[0];

        if (!definition) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }

        // Get current version number
        const versions = await base44.asServiceRole.entities.ReportDefinitionVersion.filter({
          definition_id: definitionId
        });
        const maxVersion = Math.max(...versions.map(v => v.version_number), 0);

        // Hash new config
        const configStr = JSON.stringify(config);
        const configHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(configStr));
        const configHashHex = Array.from(new Uint8Array(configHash))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        // Create new version
        const newVersion = await base44.asServiceRole.entities.ReportDefinitionVersion.create({
          organization_id: user.organization_id,
          definition_id: definitionId,
          version_number: maxVersion + 1,
          config,
          config_hash: configHashHex,
          created_by: user.email
        });

        // Update definition
        await base44.entities.ReportDefinition.update(definitionId, {
          current_version_id: newVersion.id
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: 'REPORT_DEFINITION_VERSIONED',
          severity: 'info',
          description: `Report definition updated: ${definition.name} (v${newVersion.version_number})`,
          user_id: user.email,
          success: true,
          metadata: {
            definition_id: definitionId,
            version_id: newVersion.id,
            version_number: newVersion.version_number,
            config_hash: configHashHex
          }
        });

        return Response.json({ version: newVersion });
      }

      case 'archive': {
        const { definitionId } = params;
        await base44.entities.ReportDefinition.update(definitionId, {
          is_archived: true
        });

        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id,
          event_type: 'REPORT_DEFINITION_ARCHIVED',
          severity: 'info',
          description: `Report definition archived: ${definitionId}`,
          user_id: user.email,
          success: true,
          metadata: { definition_id: definitionId }
        });

        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Report definition management error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});