import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * AI-Powered PII/Sensitive Data Redaction
 * Uses Claude to identify and redact sensitive information before sharing
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { text, redaction_level = 'standard', custom_patterns = [] } = await req.json();

        if (!text) {
            return Response.json({ error: 'text field is required' }, { status: 400 });
        }

        // Define redaction patterns
        const patterns = {
            email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            phone: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
            ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
            credit_card: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
            ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
            mac_address: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
            api_key: /\b[A-Za-z0-9_-]{32,}\b/g,
            private_key: /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/g
        };

        let redactedText = text;
        const redactionLog = [];

        // Apply regex-based redactions
        for (const [type, regex] of Object.entries(patterns)) {
            const matches = text.match(regex) || [];
            if (matches.length > 0) {
                redactedText = redactedText.replace(regex, `[REDACTED-${type.toUpperCase()}]`);
                redactionLog.push({
                    pattern_type: type,
                    matches_found: matches.length,
                    method: 'regex'
                });
            }
        }

        // Apply custom patterns
        for (const pattern of custom_patterns) {
            try {
                const regex = new RegExp(pattern.regex, 'g');
                const matches = text.match(regex) || [];
                if (matches.length > 0) {
                    redactedText = redactedText.replace(regex, pattern.replacement || '[REDACTED]');
                    redactionLog.push({
                        pattern_type: pattern.name || 'custom',
                        matches_found: matches.length,
                        method: 'custom_regex'
                    });
                }
            } catch (regexError) {
                console.error('Invalid custom regex:', regexError);
            }
        }

        // Use AI for advanced PII detection (Claude)
        if (redaction_level === 'comprehensive' || redaction_level === 'ai_assisted') {
            try {
                const aiPrompt = `You are a privacy compliance assistant. Analyze this text and identify ANY sensitive personal information that should be redacted before public disclosure.

Look for:
- Personal names (even partial)
- Addresses (physical or email)
- Phone numbers
- National IDs or passport numbers
- Financial information
- Medical information
- Legal case numbers
- Internal identifiers
- Corporate secrets

Text to analyze:
${redactedText}

Return a JSON array of findings with this structure:
{
  "findings": [
    {
      "text": "exact text to redact",
      "category": "category of PII",
      "context": "why this is sensitive",
      "confidence": 0.95
    }
  ]
}`;

                const aiResponse = await base44.integrations.Core.InvokeLLM({
                    prompt: aiPrompt,
                    response_json_schema: {
                        type: 'object',
                        properties: {
                            findings: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        text: { type: 'string' },
                                        category: { type: 'string' },
                                        context: { type: 'string' },
                                        confidence: { type: 'number' }
                                    }
                                }
                            }
                        }
                    }
                });

                // Apply AI-identified redactions (only high confidence)
                if (aiResponse.findings && Array.isArray(aiResponse.findings)) {
                    for (const finding of aiResponse.findings) {
                        if (finding.confidence > 0.8) {
                            const escapedText = finding.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            redactedText = redactedText.replace(
                                new RegExp(escapedText, 'g'),
                                `[REDACTED-${finding.category.toUpperCase()}]`
                            );
                            redactionLog.push({
                                pattern_type: finding.category,
                                matches_found: 1,
                                method: 'ai_detection',
                                confidence: finding.confidence,
                                context: finding.context
                            });
                        }
                    }
                }
            } catch (aiError) {
                console.error('AI redaction failed:', aiError);
                // Continue with regex-based redactions only
            }
        }

        // Calculate redaction statistics
        const originalLength = text.length;
        const redactedLength = redactedText.length;
        const redactionPercentage = ((originalLength - redactedLength) / originalLength * 100).toFixed(2);

        // Create audit log
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'data_redacted',
            severity: 'info',
            description: `Sensitive data redacted (${redactionLevel} level)`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                redaction_level,
                patterns_matched: redactionLog.length,
                redaction_percentage: redactionPercentage
            }
        });

        return Response.json({
            success: true,
            original_text: text,
            redacted_text: redactedText,
            redaction_log: redactionLog,
            statistics: {
                original_length: originalLength,
                redacted_length: redactedLength,
                redaction_percentage: parseFloat(redactionPercentage),
                patterns_found: redactionLog.length
            }
        });

    } catch (error) {
        console.error('Redaction error:', error);
        return Response.json({
            error: 'Redaction failed',
            message: error.message
        }, { status: 500 });
    }
});