import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * MDM Profile Analysis using AI
 * 
 * Analyzes MDM profiles to determine legitimacy
 * Detects enterprise vs rogue MDM
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { device_fingerprint, mdm_status } = await req.json();

        if (!mdm_status) {
            return Response.json({
                error: 'mdm_status required',
                example: {
                    device_fingerprint: { model: 'iPhone 14' },
                    mdm_status: {
                        mdm_detected: true,
                        mdm_vendor: 'Jamf',
                        certificates: []
                    }
                }
            }, { status: 400 });
        }

        // Analyze MDM legitimacy using AI
        const prompt = `Analyze this Mobile Device Management (MDM) profile for legitimacy.

MDM Vendor: ${mdm_status.mdm_vendor || 'Unknown'}
Profile ID: ${mdm_status.mdm_profile_id || 'Unknown'}
Supervision Type: ${mdm_status.supervision_type || 'Unknown'}
Certificates Count: ${mdm_status.certificates?.length || 0}
Configuration Profiles: ${mdm_status.configuration_profiles?.length || 0}

Device: ${device_fingerprint?.model || 'Unknown'}

Determine:
1. Is this likely a legitimate enterprise MDM?
2. What is the legitimacy score (0-100)?
3. What type of MDM is it (enterprise, consumer, rogue)?
4. What is the risk level?
5. Provide recommendations`;

        const analysis = await base44.integrations.Core.InvokeLLM({
            prompt,
            response_json_schema: {
                type: 'object',
                properties: {
                    is_legitimate: { type: 'boolean' },
                    legitimacy_score: { type: 'number' },
                    mdm_type: { 
                        type: 'string',
                        enum: ['enterprise', 'consumer', 'unknown', 'rogue']
                    },
                    risk_level: {
                        type: 'string',
                        enum: ['low', 'medium', 'high', 'critical']
                    },
                    recommendations: {
                        type: 'array',
                        items: { type: 'string' }
                    },
                    reasoning: { type: 'string' }
                }
            }
        });

        // Heuristic scoring
        let heuristicScore = 50;

        // Known enterprise vendors
        const enterpriseVendors = ['jamf', 'intune', 'airwatch', 'mobileiron', 'vmware'];
        if (mdm_status.mdm_vendor && 
            enterpriseVendors.some(v => mdm_status.mdm_vendor.toLowerCase().includes(v))) {
            heuristicScore += 30;
        }

        // Has certificates
        if (mdm_status.certificates?.length > 0) {
            heuristicScore += 10;
        }

        // Is supervised
        if (mdm_status.is_supervised) {
            heuristicScore += 10;
        }

        // Combine AI + heuristic
        const finalScore = Math.floor((analysis.legitimacy_score + heuristicScore) / 2);

        const result = {
            ...analysis,
            legitimacy_score: finalScore,
            heuristic_score: heuristicScore,
            ai_score: analysis.legitimacy_score,
            analysis_method: 'ai_plus_heuristics',
            analyzed_at: new Date().toISOString()
        };

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'mdm_analysis_completed',
            severity: result.risk_level === 'high' || result.risk_level === 'critical' ? 'warning' : 'info',
            description: `MDM profile analyzed: ${mdm_status.mdm_vendor || 'Unknown'} (${finalScore}/100)`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                legitimacy_score: finalScore,
                risk_level: result.risk_level,
                mdm_type: result.mdm_type
            }
        });

        return Response.json(result);

    } catch (error) {
        console.error('MDM analysis error:', error);
        return Response.json({
            error: 'Analysis failed',
            message: error.message
        }, { status: 500 });
    }
});