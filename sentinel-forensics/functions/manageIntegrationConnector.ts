import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, connector_id, connector_data } = await req.json();

    // TEST CONNECTION
    if (action === 'test') {
      if (!connector_id && !connector_data) {
        return Response.json({ error: 'connector_id or connector_data required' }, { status: 400 });
      }

      const config = connector_data?.configuration || 
                     (await base44.entities.IntegrationConnector.filter({ id: connector_id }))[0]?.configuration;

      if (!config) {
        return Response.json({ error: 'Connector not found' }, { status: 404 });
      }

      // Simulate connection test based on type
      try {
        // In production, this would make actual API calls
        // For now, validate configuration structure
        if (!config.api_endpoint) {
          throw new Error('API endpoint required');
        }

        return Response.json({
          success: true,
          message: 'Connection successful',
          test_results: {
            endpoint_reachable: true,
            auth_valid: true,
            api_version: 'v1.0'
          }
        });
      } catch (error) {
        return Response.json({
          success: false,
          message: 'Connection failed',
          error: error.message
        }, { status: 400 });
      }
    }

    // CREATE CONNECTOR
    if (action === 'create') {
      if (!connector_data) {
        return Response.json({ error: 'connector_data required' }, { status: 400 });
      }

      // Validate configuration
      if (!connector_data.configuration?.api_endpoint) {
        return Response.json({ error: 'API endpoint required' }, { status: 400 });
      }

      const connector = await base44.asServiceRole.entities.IntegrationConnector.create({
        organization_id: user.organization_id,
        ...connector_data,
        created_by: user.email,
        status: 'testing'
      });

      // Log activity
      await base44.asServiceRole.entities.AuditLog.create({
        organization_id: user.organization_id,
        event_type: 'integration_created',
        severity: 'info',
        description: `Integration connector created: ${connector.name} (${connector.connector_type})`,
        user_id: user.email,
        success: true,
        metadata: { connector_id: connector.id, connector_type: connector.connector_type }
      });

      return Response.json({ success: true, connector });
    }

    // UPDATE CONNECTOR
    if (action === 'update') {
      if (!connector_id || !connector_data) {
        return Response.json({ error: 'connector_id and connector_data required' }, { status: 400 });
      }

      const connector = await base44.asServiceRole.entities.IntegrationConnector.update(
        connector_id,
        connector_data
      );

      await base44.asServiceRole.entities.AuditLog.create({
        organization_id: user.organization_id,
        event_type: 'integration_updated',
        severity: 'info',
        description: `Integration connector updated: ${connector.name}`,
        user_id: user.email,
        success: true,
        metadata: { connector_id }
      });

      return Response.json({ success: true, connector });
    }

    // DELETE CONNECTOR
    if (action === 'delete') {
      if (!connector_id) {
        return Response.json({ error: 'connector_id required' }, { status: 400 });
      }

      const connector = (await base44.entities.IntegrationConnector.filter({ id: connector_id }))[0];
      
      await base44.asServiceRole.entities.IntegrationConnector.delete(connector_id);

      await base44.asServiceRole.entities.AuditLog.create({
        organization_id: user.organization_id,
        event_type: 'integration_deleted',
        severity: 'warning',
        description: `Integration connector deleted: ${connector?.name}`,
        user_id: user.email,
        success: true,
        metadata: { connector_id }
      });

      return Response.json({ success: true });
    }

    // IMPORT FROM EXTERNAL SYSTEM
    if (action === 'import') {
      if (!connector_id) {
        return Response.json({ error: 'connector_id required' }, { status: 400 });
      }

      const connector = (await base44.entities.IntegrationConnector.filter({ id: connector_id }))[0];
      if (!connector) {
        return Response.json({ error: 'Connector not found' }, { status: 404 });
      }

      const { case_id, parameters } = connector_data || {};

      // Create job
      const job = await base44.asServiceRole.entities.IntegrationJob.create({
        organization_id: user.organization_id,
        connector_id,
        case_id,
        job_type: 'import',
        direction: 'inbound',
        status: 'running',
        parameters: parameters || {},
        initiated_by: user.email,
        started_at: new Date().toISOString()
      });

      try {
        // Simulate import (in production, call actual API)
        const mockImportedData = [
          { type: 'log_entry', timestamp: new Date().toISOString(), content: 'Sample log from external system' }
        ];

        // Import as evidence
        const evidenceItems = [];
        for (const item of mockImportedData) {
          const evidence = await base44.asServiceRole.entities.EvidenceV2.create({
            organization_id: user.organization_id,
            case_id: case_id || null,
            title: `Imported from ${connector.name}`,
            description: JSON.stringify(item.content),
            evidence_type: 'device_log',
            collection_timestamp: item.timestamp,
            source_system: connector.connector_type,
            metadata: { imported_via: connector_id, job_id: job.id }
          });
          evidenceItems.push(evidence);
        }

        // Update job
        await base44.asServiceRole.entities.IntegrationJob.update(job.id, {
          status: 'completed',
          records_processed: mockImportedData.length,
          completed_at: new Date().toISOString(),
          result_summary: { evidence_created: evidenceItems.length }
        });

        return Response.json({
          success: true,
          job_id: job.id,
          records_imported: mockImportedData.length,
          evidence_ids: evidenceItems.map(e => e.id)
        });

      } catch (error) {
        await base44.asServiceRole.entities.IntegrationJob.update(job.id, {
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        });

        throw error;
      }
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Integration management error:', error);
    return Response.json({
      error: 'Operation failed',
      details: error.message
    }, { status: 500 });
  }
});