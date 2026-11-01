import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { caseId, includeAuditTrail = true } = await req.json();

        if (!caseId) {
            return Response.json({ error: 'caseId is required' }, { status: 400 });
        }

        // ✅ CRITICAL: Validate user has access to case FIRST (RLS check)
        const userCases = await base44.entities.Case.filter({ id: caseId });
        
        if (!userCases || userCases.length === 0) {
            await base44.entities.AuditLog.create({
                event_type: 'unauthorized_report_access',
                severity: 'warning',
                description: `User attempted to generate report for inaccessible case`,
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: false,
                metadata: { case_id: caseId, reason: 'rls_denied' }
            });
            
            return Response.json({ 
                error: 'Forbidden',
                message: 'You do not have access to this case'
            }, { status: 403 });
        }

        const caseData = userCases[0];

        // Now safe to use service role since we validated access
        const allEvidence = await base44.asServiceRole.entities.EvidenceV2.list();
        const evidence = allEvidence.filter(e => e.case_id === caseId);

        const allAlerts = await base44.asServiceRole.entities.Alert.list();
        const alerts = allAlerts.filter(a => {
            return evidence.some(e => e.id === a.source || e.title === a.source);
        });

        const allDevices = await base44.asServiceRole.entities.Device.list();
        const devices = allDevices.filter(d => d.case_ids && d.case_ids.includes(caseId));

        let auditLogs = [];
        if (includeAuditTrail) {
            const allLogs = await base44.asServiceRole.entities.AuditLog.list('-timestamp', 1000);
            auditLogs = allLogs.filter(log => 
                log.metadata?.case_id === caseId || 
                evidence.some(e => log.metadata?.evidence_id === e.id)
            );
        }

        const forensicData = {
            case_info: {
                case_number: caseData.case_number,
                title: caseData.title,
                description: caseData.description,
                case_type: caseData.case_type,
                priority: caseData.priority,
                status: caseData.status,
                start_date: caseData.start_date,
                assigned_investigator: caseData.assigned_investigator
            },
            evidence_items: evidence.map(e => ({
                evidence_number: e.evidence_number,
                title: e.title,
                description: e.description,
                evidence_type: e.evidence_type,
                collection_timestamp: e.collection_timestamp,
                file_hash_sha256: e.file_hash_sha256,
                chain_of_custody: e.chain_of_custody || [],
                is_verified: e.is_verified,
                risk_score: e.risk_score,
                threat_classification: e.threat_classification,
                pegasus_indicators: e.pegasus_indicators
            })),
            alerts: alerts.map(a => ({
                alert_type: a.alert_type,
                severity: a.severity,
                title: a.title,
                description: a.description,
                detection_timestamp: a.detection_timestamp,
                threat_score: a.threat_score,
                status: a.status
            })),
            device_info: devices.map(d => ({
                display_name: d.display_name,
                platform: d.platform,
                status: d.status,
                last_seen_at: d.last_seen_at,
                capabilities: d.capabilities
            })),
            audit_trail: includeAuditTrail ? auditLogs.map(log => ({
                event_type: log.event_type,
                severity: log.severity,
                description: log.description,
                timestamp: log.timestamp,
                user_id: log.user_id,
                success: log.success
            })) : []
        };

        const prompt = `You are Sentinel AI, a forensic analyst within a zero-trust, high-integrity platform.

**CASE INFORMATION:**
${JSON.stringify(forensicData.case_info, null, 2)}

**EVIDENCE (${forensicData.evidence_items.length} items):**
${JSON.stringify(forensicData.evidence_items, null, 2)}

**ALERTS (${forensicData.alerts.length} items):**
${JSON.stringify(forensicData.alerts, null, 2)}

**DEVICES (${forensicData.device_info.length} items):**
${JSON.stringify(forensicData.device_info, null, 2)}

${includeAuditTrail ? `**AUDIT TRAIL (${forensicData.audit_trail.length} entries):**
${JSON.stringify(forensicData.audit_trail.slice(0, 50), null, 2)}` : ''}

Generate a structured forensic report with:

1. **EXECUTIVE SUMMARY**
2. **INCIDENT TIMELINE**
3. **FORENSIC ANALYSIS**
4. **LEGAL ADMISSIBILITY & INTEGRITY ASSESSMENT**
5. **RISK ASSESSMENT & RECOMMENDATIONS**

Output in professional Markdown format.`;

        // Use AI Orchestrator with structured payload (Phase 5)
        const aiResult = await base44.asServiceRole.functions.invoke('aiOrchestrator', {
            orgId: user.organization_id,
            userId: user.email,
            taskType: 'forensic_report',
            sensitivity: 'high', // Forensic reports are critical
            costTier: user.subscription_tier || 'free',
            latencyToleranceMs: 20000, // Allow up to 20s for comprehensive reports
            input: {
                prompt: prompt,
                rawDataRefs: evidence.map(e => e.id) // Link evidence for context enrichment
            },
            max_tokens: 8000
        });

        const claudeResponse = aiResult.data.response;

        const reportNumber = `RPT-${Date.now().toString().slice(-8)}`;
        
        // Use service role for report creation (user already validated)
        const report = await base44.asServiceRole.entities.Report.create({
            case_id: caseId,
            report_number: reportNumber,
            title: `Forensic Analysis Report - ${caseData.case_number}`,
            report_type: 'final',
            status: 'approved',
            findings: claudeResponse,
            methodology: 'AI-Assisted Forensic Analysis using Claude 4.5',
            conclusions: 'See findings section',
            recommendations: 'See risk assessment section',
            evidence_references: evidence.map(e => e.evidence_number),
            generated_date: new Date().toISOString().split('T')[0],
            approved_by: user.email
        });

        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'forensic_report_generated',
            severity: 'info',
            description: `AI-generated forensic report for case ${caseData.case_number}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                case_id: caseId,
                report_id: report.id,
                evidence_count: evidence.length,
                alert_count: alerts.length
            }
        });

        return Response.json({
            success: true,
            report_id: report.id,
            report_number: reportNumber,
            report_content: claudeResponse,
            metadata: {
                evidence_count: evidence.length,
                alert_count: alerts.length,
                device_count: devices.length,
                audit_entries: auditLogs.length
            }
        });

    } catch (error) {
        console.error('Forensic summary generation error:', error);
        return Response.json({
            error: 'Failed to generate forensic summary',
            message: error.message
        }, { status: 500 });
    }
});