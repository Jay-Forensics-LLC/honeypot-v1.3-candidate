
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * AI Threat Actor Analysis
 * Correlates IOCs to identify potential APT groups and campaigns
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { ioc_sample } = await req.json();

        if (!ioc_sample || ioc_sample.length === 0) {
            return Response.json({
                error: 'ioc_sample is required',
                example: {
                    ioc_sample: [
                        { type: 'ip', value: '1.2.3.4', threat_score: 85 },
                        { type: 'domain', value: 'evil.com', threat_score: 90 }
                    ]
                }
            }, { status: 400 });
        }

        // Get existing APT groups for context
        const aptGroups = await base44.asServiceRole.entities.APTGroup.list('-last_updated', 50);

        // Use AI to analyze patterns
        const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
        
        if (!anthropicKey) {
            return Response.json({
                error: 'AI analysis unavailable',
                message: 'ANTHROPIC_API_KEY not configured'
            }, { status: 503 });
        }

        const prompt = `As a cyber threat intelligence analyst, analyze these IOCs and identify potential threat actors:

IOCS (${ioc_sample.length} indicators):
${ioc_sample.slice(0, 50).map(ioc => `- ${ioc.type}: ${ioc.value} (threat score: ${ioc.threat_score})`).join('\n')}

KNOWN APT GROUPS (context):
${aptGroups.slice(0, 10).map(apt => `- ${apt.group_name}: ${apt.target_sectors?.join(', ')} | TTPs: ${apt.ttps?.initial_access?.join(', ')}`).join('\n')}

TASK:
1. Identify patterns in the IOCs (infrastructure, targeting, timing)
2. Match to known APT groups or identify new threat actors
3. Assess confidence in attribution (0-100%)
4. Identify TTPs and attack patterns
5. Suggest which groups are most likely responsible
6. Recommend defensive measures

Return JSON: {
  identified_actors: [{
    apt_group_name,
    confidence,
    matching_iocs,
    matching_ttps,
    campaign_name,
    motivation,
    targeting_pattern
  }],
  new_threat_actors: [{
    suggested_name,
    evidence,
    patterns_identified,
    sophistication_level
  }],
  attack_patterns: [{
    pattern_type,
    description,
    severity
  }],
  defensive_recommendations: [string]
}`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20240620',
                max_tokens: 3072,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            })
        });

        const responseText = await response.text();

        if (!response.ok) {
            console.error('Anthropic API Error:', {
                status: response.status,
                statusText: response.statusText,
                body: responseText,
                headers: Object.fromEntries(response.headers.entries())
            });

            return Response.json({
                error: 'AI analysis failed',
                message: `Anthropic API returned ${response.status}: ${response.statusText}`,
                details: responseText,
                debug_info: {
                    api_key_configured: !!anthropicKey,
                    api_key_prefix: anthropicKey?.substring(0, 7) + '...',
                    endpoint: 'https://api.anthropic.com/v1/messages',
                    model: 'claude-3-5-sonnet-20240620' // Updated model name here too for debug info
                }
            }, { status: response.status });
        }

        const aiResponse = JSON.parse(responseText);
        const content = aiResponse.content?.[0]?.text;
        
        if (!content) {
            return Response.json({
                error: 'Invalid AI response',
                message: 'No content in API response',
                raw_response: aiResponse
            }, { status: 500 });
        }
        
        let analysis = {};
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                analysis = JSON.parse(jsonMatch[0]);
            } else {
                // Fallback: return raw content
                return Response.json({
                    error: 'AI response parsing failed',
                    message: 'Could not extract JSON from AI response',
                    raw_content: content
                }, { status: 500 });
            }
        } catch (parseError) {
            console.error('Failed to parse AI response:', parseError);
            return Response.json({
                error: 'AI analysis parsing failed',
                raw_response: content
            }, { status: 500 });
        }

        // Update APT group records with new correlations
        if (analysis.identified_actors) {
            for (const actor of analysis.identified_actors) {
                const existing = aptGroups.find(g => 
                    g.group_name.toLowerCase() === actor.apt_group_name.toLowerCase()
                );

                if (existing) {
                    // Update existing group
                    await base44.asServiceRole.entities.APTGroup.update(existing.id, {
                        confidence_score: Math.max(existing.confidence_score || 0, actor.confidence),
                        linked_iocs: [
                            ...(existing.linked_iocs || []),
                            ...actor.matching_iocs
                        ],
                        last_updated: new Date().toISOString()
                    });
                }
            }
        }

        return Response.json({
            success: true,
            identified_actors: analysis.identified_actors || [],
            new_threat_actors: analysis.new_threat_actors || [],
            attack_patterns: analysis.attack_patterns || [],
            defensive_recommendations: analysis.defensive_recommendations || [],
            iocs_analyzed: ioc_sample.length,
            analysis_timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Threat actor analysis error:', error);
        return Response.json({
            error: 'Analysis failed',
            message: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});
