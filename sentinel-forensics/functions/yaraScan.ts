import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * YARA Rule Scanning Function
 * Scans files or memory dumps against YARA rules
 * Enterprise tier only
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // RBAC: Enterprise tier or admin only
        const allowedTiers = ['enterprise', 'forensic_suite'];
        if (!allowedTiers.includes(user.subscription_tier) && user.role !== 'admin') {
            return Response.json({
                error: 'Feature requires Enterprise subscription',
                current_tier: user.subscription_tier,
                required_tiers: allowedTiers
            }, { status: 403 });
        }

        const { evidence_id, file_url, rule_ids } = await req.json();

        if (!evidence_id || !file_url) {
            return Response.json({
                error: 'Missing required fields',
                required: ['evidence_id', 'file_url']
            }, { status: 400 });
        }

        // Fetch YARA rules
        let rules;
        if (rule_ids && rule_ids.length > 0) {
            rules = await Promise.all(
                rule_ids.map(id => base44.entities.YARARule.filter({ id }))
            );
            rules = rules.flat().filter(r => r.enabled);
        } else {
            rules = await base44.entities.YARARule.filter({ enabled: true });
        }

        if (rules.length === 0) {
            return Response.json({
                error: 'No YARA rules available',
                message: 'Please upload YARA rules first'
            }, { status: 400 });
        }

        // Download file to scan
        const fileResponse = await fetch(file_url);
        if (!fileResponse.ok) {
            throw new Error('Failed to download file for scanning');
        }

        const fileBuffer = await fileResponse.arrayBuffer();
        const fileContent = new TextDecoder().decode(fileBuffer);
        const fileHex = Array.from(new Uint8Array(fileBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        // Simple YARA-like pattern matching (production should use actual YARA engine)
        const matches = [];

        for (const rule of rules) {
            try {
                // Extract strings section from YARA rule
                const stringsMatch = rule.rule_content.match(/strings:\s*([\s\S]*?)condition:/);
                if (!stringsMatch) continue;

                const stringsSection = stringsMatch[1];
                const stringDefinitions = stringsSection.match(/\$\w+\s*=\s*"([^"]+)"/g) || [];

                let ruleMatched = false;
                const matchDetails = [];

                for (const strDef of stringDefinitions) {
                    const match = strDef.match(/\$(\w+)\s*=\s*"([^"]+)"/);
                    if (!match) continue;

                    const [, varName, pattern] = match;
                    
                    // Search for pattern in file content
                    if (fileContent.includes(pattern)) {
                        ruleMatched = true;
                        const offset = fileContent.indexOf(pattern);
                        matchDetails.push({
                            variable: varName,
                            pattern,
                            offset,
                            context: fileContent.substring(
                                Math.max(0, offset - 50),
                                Math.min(fileContent.length, offset + pattern.length + 50)
                            )
                        });
                    }
                }

                if (ruleMatched) {
                    matches.push({
                        rule_id: rule.id,
                        rule_name: rule.rule_name,
                        severity: rule.severity,
                        category: rule.category,
                        description: rule.description,
                        match_details: matchDetails,
                        reference: rule.reference
                    });

                    // Update rule match count
                    await base44.asServiceRole.entities.YARARule.update(rule.id, {
                        match_count: (rule.match_count || 0) + 1,
                        last_matched: new Date().toISOString()
                    });
                }
            } catch (ruleError) {
                console.error(`Error processing rule ${rule.rule_name}:`, ruleError);
            }
        }

        // Create threat detection record
        const threatDetection = await base44.entities.ThreatDetection.create({
            evidence_id,
            detection_engine: 'yara',
            threat_found: matches.length > 0,
            threat_name: matches.length > 0 ? matches[0].rule_name : null,
            threat_family: matches.length > 0 ? matches[0].category : null,
            threat_severity: matches.length > 0 ? matches[0].severity : 'info',
            confidence_score: matches.length > 0 ? 85 : 0,
            detection_details: {
                signatures_matched: matches.map(m => m.rule_name),
                total_rules_scanned: rules.length,
                matches: matches
            },
            scan_timestamp: new Date().toISOString(),
            false_positive: false
        });

        // Audit log
        await base44.entities.AuditLog.create({
            event_type: 'yara_scan_completed',
            severity: matches.length > 0 ? 'warning' : 'info',
            description: `YARA scan completed: ${matches.length} threat(s) detected`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                evidence_id,
                detection_id: threatDetection.id,
                rules_scanned: rules.length,
                matches_found: matches.length,
                threat_names: matches.map(m => m.rule_name)
            }
        });

        return Response.json({
            success: true,
            detection_id: threatDetection.id,
            threat_found: matches.length > 0,
            matches_count: matches.length,
            matches,
            rules_scanned: rules.length,
            scan_timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('YARA scan error:', error);
        return Response.json({
            error: 'Scan failed',
            message: error.message
        }, { status: 500 });
    }
});