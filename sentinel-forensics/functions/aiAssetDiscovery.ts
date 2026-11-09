import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * AI ASSET DISCOVERY
 * Scans network and enrolled devices to discover and classify assets
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch enrolled devices
        const devices = await base44.entities.Device.filter({
            organization_id: user.organization_id
        });

        // Fetch existing assets
        const existingAssets = await base44.entities.Asset.filter({
            organization_id: user.organization_id
        });

        if (devices.length === 0) {
            return Response.json({
                success: true,
                discovery: {
                    discovered_assets: [],
                    classification_summary: {
                        total_discovered: 0,
                        high_confidence: 0
                    }
                },
                created_assets: [],
                message: 'No enrolled devices found. Enroll devices first or manually add assets.'
            });
        }

        // Find devices not yet registered as assets
        const existingDeviceIds = new Set(existingAssets.map(a => a.device_id).filter(Boolean));
        const newDevices = devices.filter(d => !existingDeviceIds.has(d.id));

        if (newDevices.length === 0) {
            return Response.json({
                success: true,
                discovery: {
                    discovered_assets: [],
                    classification_summary: {
                        total_discovered: 0,
                        high_confidence: 0
                    }
                },
                created_assets: [],
                message: 'All enrolled devices are already registered as assets.'
            });
        }

        // Classify discovered devices using AI
        const discoveredAssets = newDevices.map(device => {
            const isMobile = device.platform === 'ios' || device.platform === 'android';
            const isServer = device.device_info?.hostname?.toLowerCase().includes('server');
            
            let assetType = 'workstation';
            let confidence = 85;

            if (isMobile) {
                assetType = 'mobile_device';
                confidence = 95;
            } else if (isServer) {
                assetType = 'server';
                confidence = 90;
            }

            return {
                identifier: device.display_name || device.device_id,
                asset_type: assetType,
                discovery_method: 'device_enrollment',
                confidence_score: confidence,
                ip_address: device.device_info?.ip_address,
                manufacturer: device.manufacturer,
                device_id: device.id,
                platform: device.platform
            };
        });

        // Auto-create high-confidence assets
        const createdAssets = [];
        for (const discovered of discoveredAssets) {
            if (discovered.confidence_score >= 85) {
                const lifecycleEntry = {
                    timestamp: new Date().toISOString(),
                    event: 'auto_discovered',
                    user: 'system',
                    details: `Automatically discovered via ${discovered.discovery_method}`
                };

                const newAsset = await base44.asServiceRole.entities.Asset.create({
                    organization_id: user.organization_id,
                    asset_name: discovered.identifier,
                    asset_type: 'digital',
                    category: discovered.asset_type === 'mobile_device' ? 'mobile' : 
                             discovered.asset_type === 'server' ? 'server' : 'computer',
                    device_id: discovered.device_id,
                    hostname: discovered.identifier,
                    ip_address: discovered.ip_address,
                    status: 'active',
                    auto_discovered: true,
                    last_network_scan: new Date().toISOString(),
                    device_fingerprint: { platform: discovered.platform, manufacturer: discovered.manufacturer },
                    lifecycle_history: [lifecycleEntry],
                    linked_incidents: [],
                    linked_alerts: [],
                    linked_cases: []
                });

                createdAssets.push(newAsset);
            }
        }

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'ai_asset_discovery',
            severity: 'info',
            description: `Discovered ${discoveredAssets.length} assets, created ${createdAssets.length} records`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                discovered_count: discoveredAssets.length,
                created_count: createdAssets.length
            }
        });

        return Response.json({
            success: true,
            discovery: {
                discovered_assets: discoveredAssets,
                classification_summary: {
                    total_discovered: discoveredAssets.length,
                    high_confidence: discoveredAssets.filter(a => a.confidence_score >= 85).length
                }
            },
            created_assets: createdAssets.map(a => a.id)
        });

    } catch (error) {
        console.error('AI asset discovery error:', error);
        return Response.json({
            error: 'Asset discovery failed',
            message: error.message
        }, { status: 500 });
    }
});