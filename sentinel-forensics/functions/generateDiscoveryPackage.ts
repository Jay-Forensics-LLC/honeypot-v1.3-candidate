import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Generate Discovery Package
 * Assembles evidence with bates numbers and index
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { case_id, evidence_ids, recipient, bates_prefix } = await req.json();

        if (!case_id || !evidence_ids || evidence_ids.length === 0) {
            return Response.json({
                error: 'case_id and evidence_ids required'
            }, { status: 400 });
        }

        const packageId = `PKG-${Date.now()}`;
        const startBates = `${bates_prefix || 'SENT'}-00001`;
        const endBates = `${bates_prefix || 'SENT'}-${String(evidence_ids.length).padStart(5, '0')}`;

        // Fetch evidence items
        const evidencePromises = evidence_ids.map(id => 
            base44.entities.EvidenceV2.filter({ id })
        );
        const evidenceArrays = await Promise.all(evidencePromises);
        const evidenceItems = evidenceArrays.flat();

        // Generate index document
        const indexContent = {
            package_id: packageId,
            case_id,
            recipient: recipient || 'Unknown',
            generated_date: new Date().toISOString(),
            generated_by: user.email,
            bates_range: `${startBates} - ${endBates}`,
            items: evidenceItems.map((item, idx) => ({
                bates_number: `${bates_prefix || 'SENT'}-${String(idx + 1).padStart(5, '0')}`,
                evidence_number: item.evidence_number,
                title: item.title,
                type: item.evidence_type,
                hash: item.file_hash_sha256,
                collected: item.collection_timestamp
            }))
        };

        // Create package record
        await base44.entities.DiscoveryPackage.create({
            package_id: packageId,
            case_id,
            package_name: `Discovery Package - ${new Date().toLocaleDateString()}`,
            recipient: recipient || 'Unknown',
            evidence_items: evidence_ids,
            bates_range_start: startBates,
            bates_range_end: endBates,
            created_at: new Date().toISOString(),
            delivery_method: 'secure_portal'
        });

        // Audit log
        await base44.entities.AuditLog.create({
            event_type: 'discovery_package_generated',
            severity: 'info',
            description: 'Discovery package created',
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                package_id: packageId,
                evidence_count: evidence_ids.length
            }
        });

        return Response.json({
            success: true,
            package_id: packageId,
            bates_range: `${startBates} - ${endBates}`,
            index: indexContent
        });

    } catch (error) {
        console.error('Discovery package error:', error);
        return Response.json({
            error: 'Package generation failed',
            message: error.message
        }, { status: 500 });
    }
});