import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Automated Data Retention Policy Enforcement
 * Runs on a schedule to archive/delete old records per policy
 * SYSTEM WORKER - Uses SYSTEM_WORKER_TOKEN for authentication
 */
Deno.serve(async (req) => {
    try {
        // Validate system worker token
        const authHeader = req.headers.get('Authorization');
        const expectedToken = Deno.env.get('SYSTEM_WORKER_TOKEN');
        
        if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
            return Response.json({ 
                error: 'Unauthorized',
                message: 'Valid system worker token required'
            }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);

        // Fetch all active retention policies
        const policies = await base44.asServiceRole.entities.DataRetentionPolicy.filter({});

        const results = {
            timestamp: new Date().toISOString(),
            policies_processed: 0,
            records_archived: 0,
            records_deleted: 0,
            errors: [],
            details: []
        };

        for (const policy of policies) {
            try {
                results.policies_processed++;

                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - policy.retention_period_days);

                // Map data categories to entity names
                const entityMap = {
                    'audit_logs': 'AuditLog',
                    'evidence': 'EvidenceV2',
                    'reports': 'Report',
                    'user_data': 'User',
                    'scan_sessions': 'ScanSession',
                    'alerts': 'Alert',
                    'case_files': 'Case'
                };

                const entityName = entityMap[policy.data_category];
                if (!entityName) {
                    results.errors.push({
                        policy_id: policy.policy_id,
                        error: `Unknown data category: ${policy.data_category}`
                    });
                    continue;
                }

                // Don't process User entity automatically (GDPR requires manual review)
                if (entityName === 'User') {
                    results.details.push({
                        policy: policy.policy_name,
                        category: policy.data_category,
                        status: 'skipped',
                        message: 'User data requires manual GDPR review'
                    });
                    continue;
                }

                // Fetch old records
                const allRecords = await base44.asServiceRole.entities[entityName].list();
                const oldRecords = allRecords.filter(record => {
                    const recordDate = new Date(record.created_date);
                    return recordDate < cutoffDate;
                });

                // Check for legal holds
                const recordsToProcess = oldRecords.filter(record => 
                    !record.legal_hold && 
                    !record.deletion_protected
                );

                let archived = 0;
                let deleted = 0;

                for (const record of recordsToProcess) {
                    try {
                        // Archive if enabled
                        if (policy.archive_before_delete) {
                            // Create archive record
                            const archiveData = {
                                original_entity: entityName,
                                original_id: record.id,
                                original_data: record,
                                archived_by: 'system_worker',
                                archived_at: new Date().toISOString(),
                                retention_policy_id: policy.policy_id,
                                deletion_scheduled_for: policy.auto_delete_enabled ? 
                                    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() : null
                            };

                            // Anonymize if required
                            if (policy.anonymization_required) {
                                archiveData.original_data = anonymizeRecord(archiveData.original_data);
                            }

                            // Store in RecycleBin as archive
                            await base44.asServiceRole.entities.RecycleBin.create({
                                original_entity: entityName,
                                original_id: record.id,
                                original_data: archiveData.original_data,
                                deleted_by: 'retention_policy',
                                deleted_at: new Date().toISOString(),
                                deletion_reason: `Retention policy: ${policy.policy_name}`,
                                permanent_delete_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
                            });

                            archived++;
                        }

                        // Delete if auto-delete enabled
                        if (policy.auto_delete_enabled) {
                            await base44.asServiceRole.entities[entityName].delete(record.id);
                            deleted++;
                        }

                    } catch (recordError) {
                        results.errors.push({
                            policy_id: policy.policy_id,
                            record_id: record.id,
                            error: recordError.message
                        });
                    }
                }

                // Update policy stats
                await base44.asServiceRole.entities.DataRetentionPolicy.update(policy.id, {
                    last_enforcement: new Date().toISOString(),
                    records_archived: (policy.records_archived || 0) + archived,
                    records_deleted: (policy.records_deleted || 0) + deleted
                });

                results.records_archived += archived;
                results.records_deleted += deleted;

                results.details.push({
                    policy: policy.policy_name,
                    category: policy.data_category,
                    records_found: oldRecords.length,
                    records_archived: archived,
                    records_deleted: deleted,
                    status: 'completed'
                });

            } catch (policyError) {
                results.errors.push({
                    policy_id: policy.policy_id,
                    error: policyError.message
                });
            }
        }

        // Create audit log
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'data_retention_enforced',
            severity: results.errors.length > 0 ? 'warning' : 'info',
            description: `Data retention policies enforced: ${results.records_deleted} deleted, ${results.records_archived} archived`,
            user_id: 'system_worker',
            timestamp: new Date().toISOString(),
            success: results.errors.length === 0,
            metadata: {
                policies_processed: results.policies_processed,
                records_archived: results.records_archived,
                records_deleted: results.records_deleted,
                errors_count: results.errors.length
            }
        });

        return Response.json(results);

    } catch (error) {
        console.error('Retention enforcement error:', error);
        return Response.json({
            error: 'Retention enforcement failed',
            message: error.message
        }, { status: 500 });
    }
});

/**
 * Helper function to anonymize sensitive data
 */
function anonymizeRecord(record) {
    const anonymized = { ...record };
    
    // Remove PII fields
    const piiFields = ['email', 'phone', 'full_name', 'ip_address', 'device_fingerprint', 
                       'gps_coordinates', 'location', 'user_email', 'user_id'];
    
    for (const field of piiFields) {
        if (anonymized[field]) {
            anonymized[field] = '[REDACTED]';
        }
    }
    
    // Anonymize nested metadata
    if (anonymized.metadata) {
        anonymized.metadata = {
            ...anonymized.metadata,
            anonymized: true,
            anonymization_date: new Date().toISOString()
        };
    }
    
    return anonymized;
}