import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SEED TEST DATA FOR AI ANALYTICS
 * Creates sample artifacts and events for testing
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { caseId } = await req.json();

        if (!caseId) {
            return Response.json({ error: 'caseId required' }, { status: 400 });
        }

        // Verify case exists
        const cases = await base44.entities.Case.filter({ id: caseId });
        if (cases.length === 0) {
            return Response.json({ error: 'Case not found' }, { status: 404 });
        }

        // Create sample artifacts
        const pcapArtifact = await base44.asServiceRole.entities.EvidenceArtifact.create({
            organization_id: user.organization_id,
            case_id: caseId,
            artifact_type: 'pcap_metadata',
            file_name: 'network_capture_2026-01-01.pcap',
            sha256_hash: 'a'.repeat(64),
            size_bytes: 1024000,
            labels: ['network', 'test'],
            notes: 'Test network capture'
        });

        const memoryArtifact = await base44.asServiceRole.entities.EvidenceArtifact.create({
            organization_id: user.organization_id,
            case_id: caseId,
            artifact_type: 'memory_dump',
            file_name: 'memory_dump_host1.raw',
            sha256_hash: 'b'.repeat(64),
            size_bytes: 8192000,
            labels: ['memory', 'test'],
            notes: 'Test memory dump'
        });

        const syslogArtifact = await base44.asServiceRole.entities.EvidenceArtifact.create({
            organization_id: user.organization_id,
            case_id: caseId,
            artifact_type: 'system_log',
            file_name: 'system_events.evtx',
            sha256_hash: 'c'.repeat(64),
            size_bytes: 512000,
            labels: ['logs', 'test'],
            notes: 'Test system logs'
        });

        // Create sample normalized events

        // Network events - beaconing pattern (C2 indicator)
        const networkEvents = [];
        const baseTime = new Date('2026-01-01T10:00:00Z');
        for (let i = 0; i < 15; i++) {
            const eventTime = new Date(baseTime.getTime() + i * 60000); // Every 60 seconds
            networkEvents.push({
                organization_id: user.organization_id,
                case_id: caseId,
                artifact_id: pcapArtifact.id,
                event_type: 'net_flow',
                event_time: eventTime.toISOString(),
                host_id: 'workstation-01',
                src_ip: '192.168.1.100',
                src_port: 49152 + i,
                dst_ip: '203.0.113.42', // Suspicious external IP
                dst_port: 8080,
                attributes_json: {
                    bytes_sent: 1024,
                    bytes_received: 512,
                    protocol: 'TCP'
                },
                quality_score: 1.0
            });
        }

        // Memory events - RWX region (code injection indicator)
        const memoryEvents = [
            {
                organization_id: user.organization_id,
                case_id: caseId,
                artifact_id: memoryArtifact.id,
                event_type: 'memory_region',
                event_time: '2026-01-01T10:15:00Z',
                host_id: 'workstation-01',
                process_id: 1234,
                process_name: 'explorer.exe',
                attributes_json: {
                    base_address: '0x7FFE0000',
                    size: 4096,
                    protection: 'RWX', // SUSPICIOUS
                    type: 'MEM_PRIVATE'
                },
                quality_score: 1.0
            },
            {
                organization_id: user.organization_id,
                case_id: caseId,
                artifact_id: memoryArtifact.id,
                event_type: 'memory_string',
                event_time: '2026-01-01T10:16:00Z',
                host_id: 'workstation-01',
                process_id: 1234,
                process_name: 'explorer.exe',
                attributes_json: {
                    content: 'powershell -enc JABzAD0ATgBlAHcALQBPAGIAagBlAGMAdAAgAEkATwAuAE0A', // Encoded PowerShell
                    offset: '0x1234'
                },
                quality_score: 0.95
            },
            {
                organization_id: user.organization_id,
                case_id: caseId,
                artifact_id: memoryArtifact.id,
                event_type: 'memory_proc',
                event_time: '2026-01-01T10:17:00Z',
                host_id: 'workstation-01',
                process_id: 5678,
                parent_process_id: 0, // Orphan process - SUSPICIOUS
                process_name: 'svchost.exe',
                command_line: 'svchost.exe -k netsvcs',
                attributes_json: {
                    user: 'SYSTEM',
                    start_time: '2026-01-01T09:00:00Z'
                },
                quality_score: 1.0
            }
        ];

        // Behavior events - suspicious PowerShell
        const behaviorEvents = [
            {
                organization_id: user.organization_id,
                case_id: caseId,
                artifact_id: syslogArtifact.id,
                event_type: 'powershell',
                event_time: '2026-01-01T10:20:00Z',
                host_id: 'workstation-01',
                actor_user: 'john.doe',
                process_id: 9876,
                process_name: 'powershell.exe',
                command_line: 'powershell.exe -ExecutionPolicy Bypass -enc JABzAD0ATgBlAHcALQBPAGIAagBlAGMAdAAgAEkATwAuAE0A',
                attributes_json: {
                    script_block_text: 'Encoded command detected'
                },
                quality_score: 1.0
            },
            {
                organization_id: user.organization_id,
                case_id: caseId,
                artifact_id: syslogArtifact.id,
                event_type: 'auth',
                event_time: '2026-01-01T02:30:00Z', // Off-hours login - SUSPICIOUS
                host_id: 'workstation-01',
                actor_user: 'john.doe',
                attributes_json: {
                    logon_type: 10, // RemoteInteractive
                    source_ip: '203.0.113.99'
                },
                quality_score: 1.0
            },
            {
                organization_id: user.organization_id,
                case_id: caseId,
                artifact_id: syslogArtifact.id,
                event_type: 'process_start',
                event_time: '2026-01-01T10:25:00Z',
                host_id: 'workstation-01',
                actor_user: 'john.doe',
                process_id: 8888,
                parent_process_id: 1234,
                process_name: 'reg.exe', // Admin tool - first time use
                command_line: 'reg.exe add HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v Test /t REG_SZ /d malware.exe',
                attributes_json: {
                    integrity_level: 'High'
                },
                quality_score: 1.0
            }
        ];

        // Bulk create events
        const allEvents = [...networkEvents, ...memoryEvents, ...behaviorEvents];
        for (const event of allEvents) {
            await base44.asServiceRole.entities.NormalizedEvent.create(event);
        }

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'test_data_seeded',
            severity: 'info',
            description: `Seeded ${allEvents.length} test events for AI analytics`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                case_id: caseId,
                artifacts_created: 3,
                events_created: allEvents.length
            }
        });

        return Response.json({
            success: true,
            artifacts_created: [pcapArtifact.id, memoryArtifact.id, syslogArtifact.id],
            events_created: allEvents.length,
            message: `Created 3 artifacts and ${allEvents.length} events with realistic anomaly patterns (beaconing, RWX memory, suspicious PowerShell, off-hours auth, registry persistence)`
        });

    } catch (error) {
        console.error('Seed test data error:', error);
        return Response.json({
            error: 'Failed to seed test data',
            message: error.message
        }, { status: 500 });
    }
});