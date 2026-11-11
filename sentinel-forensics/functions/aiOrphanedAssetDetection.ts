import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * AI ORPHANED ASSET DETECTION
 * Identifies orphaned, unmanaged, ghost, and shadow assets
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch all assets
        const assets = await base44.entities.Asset.filter({
            organization_id: user.organization_id
        });

        if (assets.length === 0) {
            return Response.json({
                success: true,
                detection: {
                    orphaned_assets: [],
                    unmanaged_assets: [],
                    ghost_assets: [],
                    shadow_assets: [],
                    summary: {
                        total_orphaned: 0,
                        total_unmanaged: 0,
                        total_ghost: 0,
                        total_shadow: 0
                    },
                    recommended_actions: []
                },
                message: 'No assets found in inventory. Add assets to run detection.'
            });
        }

        // Fetch devices for cross-reference
        const devices = await base44.entities.Device.filter({
            organization_id: user.organization_id
        });

        const now = new Date();
        const orphanedAssets = [];
        const unmanagedAssets = [];
        const ghostAssets = [];
        const shadowAssets = [];

        for (const asset of assets) {
            const issues = [];
            let isOrphaned = false;
            let isUnmanaged = false;

            // Check 1: Orphaned (inactive for >90 days)
            const lastActivity = asset.last_network_scan || asset.updated_date || asset.created_date;
            const daysSinceActivity = (now - new Date(lastActivity)) / (1000 * 60 * 60 * 24);
            
            if (daysSinceActivity > 90) {
                isOrphaned = true;
                const riskLevel = daysSinceActivity > 365 ? 'critical' : 
                                 daysSinceActivity > 180 ? 'high' : 'medium';
                
                orphanedAssets.push({
                    asset_id: asset.id,
                    asset_name: asset.asset_name,
                    orphan_reason: `No activity for ${Math.floor(daysSinceActivity)} days`,
                    days_inactive: Math.floor(daysSinceActivity),
                    risk_level: riskLevel,
                    recommended_action: daysSinceActivity > 365 ? 'retire' : 
                                       daysSinceActivity > 180 ? 'investigate' : 'verify_status'
                });
            }

            // Check 2: Unmanaged (missing key fields)
            const managementGaps = [];
            if (!asset.current_owner) managementGaps.push('no_owner');
            if (!asset.location) managementGaps.push('no_location');
            if (!asset.deployment_date) managementGaps.push('no_deployment_date');
            if (!asset.purchase_date) managementGaps.push('no_purchase_date');

            if (managementGaps.length >= 2) {
                isUnmanaged = true;
                unmanagedAssets.push({
                    asset_id: asset.id,
                    asset_name: asset.asset_name,
                    management_gaps: managementGaps,
                    compliance_issues: managementGaps.includes('no_owner') ? 
                        ['ownership_unclear', 'accountability_gap'] : 
                        ['incomplete_records']
                });
            }

            // Check 3: Ghost Assets (linked to non-existent device)
            if (asset.device_id && !devices.find(d => d.id === asset.device_id)) {
                ghostAssets.push({
                    asset_id: asset.id,
                    asset_name: asset.asset_name,
                    device_id: asset.device_id,
                    reason: 'Device reference not found - device may have been deleted'
                });
            }

            // Check 4: Shadow Assets (duplicate identifiers)
            const duplicateSerial = assets.filter(a => 
                a.id !== asset.id && 
                a.serial_number && 
                a.serial_number === asset.serial_number
            );
            
            if (duplicateSerial.length > 0) {
                shadowAssets.push({
                    asset_id: asset.id,
                    asset_name: asset.asset_name,
                    shadow_reason: 'Duplicate serial number detected',
                    duplicate_count: duplicateSerial.length,
                    duplicate_ids: duplicateSerial.map(a => a.id)
                });
            }
        }

        // Generate recommended actions
        const recommendedActions = [];
        
        if (orphanedAssets.length > 0) {
            const criticalCount = orphanedAssets.filter(a => a.risk_level === 'critical').length;
            if (criticalCount > 0) {
                recommendedActions.push({
                    action: 'Retire or decommission',
                    target_count: criticalCount,
                    priority: 'high',
                    details: 'Assets inactive for over a year'
                });
            }
        }

        if (unmanagedAssets.length > 0) {
            recommendedActions.push({
                action: 'Complete asset records',
                target_count: unmanagedAssets.length,
                priority: 'medium',
                details: 'Fill in missing owner, location, or dates'
            });
        }

        if (ghostAssets.length > 0) {
            recommendedActions.push({
                action: 'Verify device links',
                target_count: ghostAssets.length,
                priority: 'high',
                details: 'Referenced devices no longer exist'
            });
        }

        if (shadowAssets.length > 0) {
            recommendedActions.push({
                action: 'Resolve duplicates',
                target_count: shadowAssets.length,
                priority: 'medium',
                details: 'Multiple assets with same serial number'
            });
        }

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'ai_orphaned_asset_detection',
            severity: 'info',
            description: `Detected ${orphanedAssets.length} orphaned, ${unmanagedAssets.length} unmanaged assets`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                orphaned_count: orphanedAssets.length,
                unmanaged_count: unmanagedAssets.length,
                ghost_count: ghostAssets.length,
                shadow_count: shadowAssets.length
            }
        });

        return Response.json({
            success: true,
            detection: {
                orphaned_assets: orphanedAssets,
                unmanaged_assets: unmanagedAssets,
                ghost_assets: ghostAssets,
                shadow_assets: shadowAssets,
                summary: {
                    total_orphaned: orphanedAssets.length,
                    total_unmanaged: unmanagedAssets.length,
                    total_ghost: ghostAssets.length,
                    total_shadow: shadowAssets.length
                },
                recommended_actions: recommendedActions
            }
        });

    } catch (error) {
        console.error('Orphaned asset detection error:', error);
        return Response.json({
            error: 'Detection failed',
            message: error.message
        }, { status: 500 });
    }
});