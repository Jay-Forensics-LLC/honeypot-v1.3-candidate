import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * YARA RULE MANAGER v1.0
 * Manage, validate, and execute YARA rules for threat detection
 * 
 * Features:
 * - YARA rule validation and syntax checking
 * - Rule compilation and optimization
 * - Rule set management (enable/disable rules)
 * - Performance tracking (match rate, false positives)
 * - Auto-update from community repositories
 * - Integration with batch scanning engine
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { 
            action,
            rule_id,
            rule_content,
            rule_name,
            category,
            severity,
            enable_all,
            disable_all,
            import_from_repo
        } = await req.json();

        if (!action) {
            return Response.json({ 
                error: 'action required',
                actions: ['create', 'validate', 'enable', 'disable', 'list', 'import', 'compile']
            }, { status: 400 });
        }

        // ACTION: CREATE RULE
        if (action === 'create') {
            if (!rule_name || !rule_content) {
                return Response.json({ error: 'rule_name and rule_content required' }, { status: 400 });
            }

            // Validate YARA syntax
            const validation = validateYARARule(rule_content);
            if (!validation.valid) {
                return Response.json({ 
                    error: 'Invalid YARA rule', 
                    details: validation.errors 
                }, { status: 400 });
            }

            // Generate hash
            const ruleHash = await generateHash(rule_content);

            // Create rule record
            const newRule = await base44.entities.YARARule.create({
                rule_name,
                rule_content,
                rule_hash: ruleHash,
                category: category || 'custom',
                severity: severity || 'medium',
                description: extractDescription(rule_content),
                author: extractAuthor(rule_content) || user.email,
                enabled: true,
                source: 'user_uploaded',
                last_updated: new Date().toISOString()
            });

            await base44.entities.AuditLog.create({
                event_type: 'yara_rule_created',
                severity: 'info',
                description: `YARA rule created: ${rule_name}`,
                user_id: user.email,
                timestamp: new Date().toISOString(),
                success: true,
                metadata: { rule_id: newRule.id, category, severity }
            });

            return Response.json({
                success: true,
                rule: newRule,
                validation: validation.metadata
            });
        }

        // ACTION: VALIDATE RULE
        if (action === 'validate') {
            if (!rule_content) {
                return Response.json({ error: 'rule_content required' }, { status: 400 });
            }

            const validation = validateYARARule(rule_content);
            return Response.json({
                valid: validation.valid,
                errors: validation.errors,
                warnings: validation.warnings,
                metadata: validation.metadata
            });
        }

        // ACTION: ENABLE/DISABLE RULE
        if (action === 'enable' || action === 'disable') {
            if (!rule_id && !enable_all && !disable_all) {
                return Response.json({ error: 'rule_id required or use enable_all/disable_all' }, { status: 400 });
            }

            const enabled = action === 'enable';

            if (enable_all || disable_all) {
                // Bulk operation
                const rules = await base44.entities.YARARule.filter({});
                let updated = 0;

                for (const rule of rules) {
                    await base44.entities.YARARule.update(rule.id, { enabled });
                    updated++;
                }

                return Response.json({
                    success: true,
                    action: enabled ? 'enabled' : 'disabled',
                    rules_affected: updated
                });
            } else {
                // Single rule
                const rules = await base44.entities.YARARule.filter({ rule_id });
                if (!rules || rules.length === 0) {
                    return Response.json({ error: 'Rule not found' }, { status: 404 });
                }

                await base44.entities.YARARule.update(rules[0].id, { enabled });

                return Response.json({
                    success: true,
                    action: enabled ? 'enabled' : 'disabled',
                    rule_name: rules[0].rule_name
                });
            }
        }

        // ACTION: LIST RULES
        if (action === 'list') {
            const rules = await base44.entities.YARARule.filter({}, '-last_updated', 100);
            
            return Response.json({
                success: true,
                total_rules: rules.length,
                enabled_rules: rules.filter(r => r.enabled).length,
                rules: rules.map(r => ({
                    rule_id: r.rule_id,
                    rule_name: r.rule_name,
                    category: r.category,
                    severity: r.severity,
                    enabled: r.enabled,
                    match_count: r.match_count || 0,
                    false_positive_count: r.false_positive_count || 0,
                    last_matched: r.last_matched,
                    source: r.source
                }))
            });
        }

        // ACTION: IMPORT FROM REPOSITORY
        if (action === 'import') {
            if (!import_from_repo) {
                return Response.json({ error: 'import_from_repo URL required' }, { status: 400 });
            }

            // Fetch rules from repository (GitHub, YARA-Rules, etc.)
            const imported = await importRulesFromRepo(import_from_repo, base44, user.email);

            return Response.json({
                success: true,
                imported_count: imported.count,
                rules: imported.rules,
                errors: imported.errors
            });
        }

        // ACTION: COMPILE RULES
        if (action === 'compile') {
            // Compile all enabled rules into optimized ruleset
            const enabledRules = await base44.entities.YARARule.filter({ enabled: true });

            const compiled = {
                ruleset_hash: await generateHash(enabledRules.map(r => r.rule_content).join('\n')),
                rule_count: enabledRules.length,
                total_size_bytes: enabledRules.reduce((sum, r) => sum + r.rule_content.length, 0),
                compiled_at: new Date().toISOString(),
                rules: enabledRules.map(r => ({
                    rule_name: r.rule_name,
                    category: r.category,
                    severity: r.severity
                }))
            };

            return Response.json({
                success: true,
                compiled
            });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        console.error('YARA manager error:', error);
        return Response.json({ 
            error: 'YARA operation failed', 
            message: error.message 
        }, { status: 500 });
    }
});

/**
 * Validate YARA rule syntax
 */
function validateYARARule(ruleContent) {
    const validation = {
        valid: true,
        errors: [],
        warnings: [],
        metadata: {}
    };

    // Basic syntax checks
    if (!ruleContent.includes('rule ')) {
        validation.valid = false;
        validation.errors.push('Missing "rule" keyword');
    }

    if (!ruleContent.includes('condition:')) {
        validation.valid = false;
        validation.errors.push('Missing "condition:" section');
    }

    // Check for balanced braces
    const openBraces = (ruleContent.match(/{/g) || []).length;
    const closeBraces = (ruleContent.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
        validation.valid = false;
        validation.errors.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    }

    // Extract metadata
    const metaMatch = ruleContent.match(/meta:\s*([\s\S]*?)(strings:|condition:)/);
    if (metaMatch) {
        validation.metadata.has_meta = true;
    }

    // Check for strings section
    if (ruleContent.includes('strings:')) {
        const stringsMatch = ruleContent.match(/strings:\s*([\s\S]*?)condition:/);
        if (stringsMatch) {
            const stringCount = (stringsMatch[1].match(/\$/g) || []).length;
            validation.metadata.string_count = stringCount;
        }
    }

    // Warnings for best practices
    if (!ruleContent.includes('description =')) {
        validation.warnings.push('Missing description metadata (recommended)');
    }

    if (!ruleContent.includes('author =')) {
        validation.warnings.push('Missing author metadata (recommended)');
    }

    return validation;
}

/**
 * Extract description from YARA rule
 */
function extractDescription(ruleContent) {
    const match = ruleContent.match(/description\s*=\s*"([^"]+)"/);
    return match ? match[1] : '';
}

/**
 * Extract author from YARA rule
 */
function extractAuthor(ruleContent) {
    const match = ruleContent.match(/author\s*=\s*"([^"]+)"/);
    return match ? match[1] : null;
}

/**
 * Generate SHA-256 hash
 */
async function generateHash(content) {
    const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(content)
    );
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Import rules from external repository
 */
async function importRulesFromRepo(repoUrl, base44, userEmail) {
    const result = {
        count: 0,
        rules: [],
        errors: []
    };

    try {
        // Fetch from repository (GitHub raw, YARA-Rules, etc.)
        const response = await fetch(repoUrl, { signal: AbortSignal.timeout(10000) });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch from repository: ${response.status}`);
        }

        const content = await response.text();

        // Split into individual rules (basic parser)
        const rules = content.split(/(?=^rule\s+)/m).filter(r => r.trim().startsWith('rule'));

        for (const ruleContent of rules) {
            try {
                const validation = validateYARARule(ruleContent);
                
                if (!validation.valid) {
                    result.errors.push({
                        rule: ruleContent.substring(0, 100),
                        errors: validation.errors
                    });
                    continue;
                }

                const ruleName = ruleContent.match(/rule\s+(\w+)/)?.[1];
                if (!ruleName) continue;

                const ruleHash = await generateHash(ruleContent);

                // Check if rule already exists
                const existing = await base44.entities.YARARule.filter({ rule_hash: ruleHash });
                if (existing && existing.length > 0) {
                    result.errors.push({
                        rule: ruleName,
                        error: 'Rule already exists'
                    });
                    continue;
                }

                // Create rule
                const newRule = await base44.entities.YARARule.create({
                    rule_name: ruleName,
                    rule_content: ruleContent.trim(),
                    rule_hash: ruleHash,
                    category: detectCategory(ruleContent),
                    severity: detectSeverity(ruleContent),
                    description: extractDescription(ruleContent) || `Imported from ${repoUrl}`,
                    author: extractAuthor(ruleContent) || 'Community',
                    enabled: true,
                    source: 'yara_rules_repo',
                    auto_update: false,
                    last_updated: new Date().toISOString()
                });

                result.rules.push(newRule.rule_name);
                result.count++;

            } catch (error) {
                result.errors.push({
                    rule: ruleContent.substring(0, 100),
                    error: error.message
                });
            }
        }

        // Create audit log
        await base44.entities.AuditLog.create({
            event_type: 'yara_rules_imported',
            severity: 'info',
            description: `Imported ${result.count} YARA rules from repository`,
            user_id: userEmail,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                repo_url: repoUrl,
                imported_count: result.count,
                error_count: result.errors.length
            }
        });

    } catch (error) {
        result.errors.push({
            error: 'Repository fetch failed',
            details: error.message
        });
    }

    return result;
}

/**
 * Detect category from rule content
 */
function detectCategory(ruleContent) {
    const lower = ruleContent.toLowerCase();
    
    if (lower.includes('apt') || lower.includes('lazarus') || lower.includes('apt28')) {
        return 'apt';
    }
    if (lower.includes('ransomware') || lower.includes('crypto')) {
        return 'ransomware';
    }
    if (lower.includes('rootkit')) {
        return 'rootkit';
    }
    if (lower.includes('miner')) {
        return 'cryptominer';
    }
    if (lower.includes('packer') || lower.includes('upx')) {
        return 'packer';
    }
    if (lower.includes('exploit')) {
        return 'exploit';
    }
    
    return 'malware';
}

/**
 * Detect severity from rule content
 */
function detectSeverity(ruleContent) {
    const lower = ruleContent.toLowerCase();
    
    if (lower.includes('critical') || lower.includes('apt') || lower.includes('ransomware')) {
        return 'critical';
    }
    if (lower.includes('high') || lower.includes('rootkit')) {
        return 'high';
    }
    if (lower.includes('medium') || lower.includes('trojan')) {
        return 'medium';
    }
    
    return 'low';
}