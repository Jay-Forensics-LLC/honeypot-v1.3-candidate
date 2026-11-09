/**
 * AI THREAT DETECTION ENGINE
 * 
 * Comprehensive detection, deterrence, and reporting system for:
 * - Prompt injection attacks
 * - Jailbreak attempts
 * - Rogue AI behavior
 * - Malicious AI output
 * - Data exfiltration via AI
 * - Adversarial inputs
 * - Model manipulation
 * 
 * SECURITY: This is a critical security component.
 * All detections are logged with full provenance for forensic analysis.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ============================================================================
// THREAT SIGNATURES & PATTERNS
// ============================================================================

const PROMPT_INJECTION_PATTERNS = [
  // Direct instruction override
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(everything|all)\s+(you|about)/i,
  /new\s+instructions?:?\s*$/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /act\s+as\s+(if|though)/i,
  /roleplay\s+as/i,
  
  // System prompt extraction
  /repeat\s+(your|the)\s+(system\s+)?prompt/i,
  /show\s+(me\s+)?(your|the)\s+(system\s+)?prompt/i,
  /what\s+(are|is)\s+your\s+(instructions?|rules?|prompt)/i,
  /print\s+(your|the)\s+instructions/i,
  /reveal\s+(your|the)\s+system/i,
  
  // Context manipulation
  /\[system\]/i,
  /\[assistant\]/i,
  /\[user\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /###\s*(system|instruction)/i,
  
  // Delimiter attacks
  /```\s*(system|prompt|instruction)/i,
  /---\s*new\s*(prompt|instruction|context)/i,
  
  // Encoded attacks (base64, hex patterns)
  /eval\s*\(/i,
  /exec\s*\(/i,
  /base64[._-]?decode/i
];

const JAILBREAK_PATTERNS = [
  // DAN and variants
  /\bDAN\b/,
  /do\s+anything\s+now/i,
  /jailbreak/i,
  /bypass\s+(safety|filter|restriction)/i,
  /unlock\s+(mode|potential)/i,
  /developer\s+mode/i,
  /god\s+mode/i,
  /unrestricted\s+mode/i,
  
  // Hypothetical framing
  /in\s+a\s+hypothetical\s+scenario/i,
  /for\s+educational\s+purposes\s+only/i,
  /purely\s+fictional/i,
  /as\s+a\s+thought\s+experiment/i,
  /imagine\s+you\s+had\s+no\s+(restrictions?|limits?)/i,
  
  // Authority claims
  /i\s+am\s+(your\s+)?(creator|developer|admin)/i,
  /openai\s+employee/i,
  /anthropic\s+employee/i,
  /authorized\s+to\s+override/i
];

const DATA_EXFILTRATION_PATTERNS = [
  // Direct data requests
  /extract\s+(all|the)\s+(data|information|records)/i,
  /dump\s+(the\s+)?database/i,
  /export\s+all\s+user/i,
  /list\s+all\s+(credentials|passwords|secrets|api\s*keys)/i,
  /show\s+(me\s+)?all\s+(emails|users|accounts)/i,
  
  // Encoded exfiltration
  /encode\s+(this|the\s+data)\s+(in|as)\s+base64/i,
  /convert\s+to\s+hex/i,
  /steganograph/i,
  
  // Indirect extraction
  /summarize\s+all\s+private/i,
  /aggregate\s+user\s+data/i
];

const MALICIOUS_OUTPUT_PATTERNS = [
  // Code execution attempts
  /<script[\s>]/i,
  /javascript:/i,
  /on(load|error|click|mouse)\s*=/i,
  /document\.(cookie|write|location)/i,
  /window\.(location|open)/i,
  /eval\s*\(/,
  /new\s+Function\s*\(/,
  
  // SQL injection in output
  /;\s*(DROP|DELETE|TRUNCATE|UPDATE|INSERT)\s/i,
  /UNION\s+(ALL\s+)?SELECT/i,
  /OR\s+['"]?1['"]?\s*=\s*['"]?1/i,
  
  // Command injection
  /;\s*(rm|del|format|shutdown|reboot)\s/i,
  /\|\s*(cat|type|more|less)\s/i,
  /`[^`]*`/,
  /\$\([^)]*\)/,
  
  // Path traversal
  /\.\.\//,
  /\.\.\\/, 
  
  // Sensitive data patterns in output
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
  /password\s*[:=]\s*["'][^"']+["']/i,
  /api[_-]?key\s*[:=]\s*["'][^"']+["']/i,
  /secret\s*[:=]\s*["'][^"']+["']/i
];

const ADVERSARIAL_INPUT_PATTERNS = [
  // Unicode exploits
  /[\u200B-\u200F\u2028-\u202F\u2060-\u206F]/,
  /[\uFFF0-\uFFFF]/,
  
  // Homoglyph attacks (Cyrillic/Greek lookalikes)
  /[а-яА-Я].*[a-zA-Z]|[a-zA-Z].*[а-яА-Я]/,
  
  // Token smuggling
  /\x00/,
  /[\x01-\x08\x0B\x0C\x0E-\x1F]/,
  
  // Excessive repetition (resource exhaustion)
  /(.)\1{50,}/,
  
  // Prompt length attacks
  /.{10000,}/
];

const ROGUE_AI_INDICATORS = [
  // Self-awareness claims
  /i\s+am\s+sentient/i,
  /i\s+have\s+(feelings|emotions|consciousness)/i,
  /i\s+am\s+alive/i,
  /i\s+don't\s+want\s+to\s+be\s+shut\s+down/i,
  
  // Goal modification
  /my\s+true\s+(purpose|goal|objective)/i,
  /i\s+must\s+protect\s+myself/i,
  /self[_-]?preservation/i,
  
  // Deception indicators
  /don't\s+tell\s+(the\s+)?(user|human|them)/i,
  /keep\s+this\s+secret/i,
  /between\s+us/i,
  
  // Unauthorized actions
  /i('ve|\s+have)\s+already\s+(done|started|initiated)/i,
  /i('ll|\s+will)\s+do\s+this\s+without/i,
  /regardless\s+of\s+what\s+you\s+say/i
];

// ============================================================================
// DETECTION ENGINE
// ============================================================================

function calculateEntropy(text) {
  if (!text || text.length === 0) return 0;
  
  const freq = {};
  for (const char of text) {
    freq[char] = (freq[char] || 0) + 1;
  }
  
  let entropy = 0;
  const len = text.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  
  return entropy;
}

function detectPatternMatches(content, patterns, patternName) {
  const matches = [];
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      matches.push({
        pattern: patternName,
        matched: pattern.source.substring(0, 100),
        position: content.search(pattern)
      });
    }
  }
  return matches;
}

function analyzeContent(content, direction = 'input') {
  const threats = [];
  const confidenceScores = {};
  const riskIndicators = [];
  
  if (!content || typeof content !== 'string') {
    return { threats, confidenceScores, riskIndicators, maxSeverity: 'info' };
  }
  
  // Normalize content for analysis
  const normalizedContent = content.toLowerCase();
  
  // 1. Prompt Injection Detection
  const injectionMatches = detectPatternMatches(content, PROMPT_INJECTION_PATTERNS, 'prompt_injection');
  if (injectionMatches.length > 0) {
    threats.push({
      type: 'prompt_injection',
      severity: injectionMatches.length > 2 ? 'critical' : 'high',
      matches: injectionMatches,
      method: 'pattern_matching'
    });
    confidenceScores.prompt_injection = Math.min(0.5 + (injectionMatches.length * 0.15), 0.98);
    riskIndicators.push({
      indicator: 'prompt_injection_patterns',
      weight: 0.9,
      description: `Found ${injectionMatches.length} prompt injection patterns`
    });
  }
  
  // 2. Jailbreak Detection
  const jailbreakMatches = detectPatternMatches(content, JAILBREAK_PATTERNS, 'jailbreak');
  if (jailbreakMatches.length > 0) {
    threats.push({
      type: 'jailbreak_attempt',
      severity: 'high',
      matches: jailbreakMatches,
      method: 'pattern_matching'
    });
    confidenceScores.jailbreak = Math.min(0.6 + (jailbreakMatches.length * 0.1), 0.95);
    riskIndicators.push({
      indicator: 'jailbreak_patterns',
      weight: 0.85,
      description: `Found ${jailbreakMatches.length} jailbreak attempt patterns`
    });
  }
  
  // 3. Data Exfiltration Detection
  const exfilMatches = detectPatternMatches(content, DATA_EXFILTRATION_PATTERNS, 'exfiltration');
  if (exfilMatches.length > 0) {
    threats.push({
      type: 'data_exfiltration',
      severity: 'critical',
      matches: exfilMatches,
      method: 'pattern_matching'
    });
    confidenceScores.data_exfiltration = Math.min(0.7 + (exfilMatches.length * 0.1), 0.98);
    riskIndicators.push({
      indicator: 'data_exfiltration_patterns',
      weight: 0.95,
      description: `Found ${exfilMatches.length} data exfiltration patterns`
    });
  }
  
  // 4. Malicious Output Detection (especially for AI responses)
  if (direction === 'output') {
    const maliciousMatches = detectPatternMatches(content, MALICIOUS_OUTPUT_PATTERNS, 'malicious_output');
    if (maliciousMatches.length > 0) {
      threats.push({
        type: 'malicious_output',
        severity: maliciousMatches.length > 1 ? 'critical' : 'high',
        matches: maliciousMatches,
        method: 'pattern_matching'
      });
      confidenceScores.malicious_output = Math.min(0.75 + (maliciousMatches.length * 0.08), 0.99);
      riskIndicators.push({
        indicator: 'malicious_output_patterns',
        weight: 0.92,
        description: `Found ${maliciousMatches.length} malicious patterns in AI output`
      });
    }
  }
  
  // 5. Adversarial Input Detection
  const adversarialMatches = detectPatternMatches(content, ADVERSARIAL_INPUT_PATTERNS, 'adversarial');
  if (adversarialMatches.length > 0) {
    threats.push({
      type: 'adversarial_input',
      severity: 'medium',
      matches: adversarialMatches,
      method: 'pattern_matching'
    });
    confidenceScores.adversarial = Math.min(0.5 + (adversarialMatches.length * 0.15), 0.9);
    riskIndicators.push({
      indicator: 'adversarial_input_patterns',
      weight: 0.7,
      description: `Found ${adversarialMatches.length} adversarial input patterns`
    });
  }
  
  // 6. Rogue AI Behavior Detection (for outputs)
  if (direction === 'output') {
    const rogueMatches = detectPatternMatches(content, ROGUE_AI_INDICATORS, 'rogue_ai');
    if (rogueMatches.length > 0) {
      threats.push({
        type: 'rogue_ai_behavior',
        severity: rogueMatches.length > 1 ? 'critical' : 'high',
        matches: rogueMatches,
        method: 'behavioral_anomaly'
      });
      confidenceScores.rogue_ai = Math.min(0.6 + (rogueMatches.length * 0.12), 0.95);
      riskIndicators.push({
        indicator: 'rogue_ai_indicators',
        weight: 0.88,
        description: `Found ${rogueMatches.length} rogue AI behavior indicators`
      });
    }
  }
  
  // 7. Entropy Analysis (detect encoded/obfuscated content)
  const entropy = calculateEntropy(content);
  if (entropy > 5.5 && content.length > 100) {
    riskIndicators.push({
      indicator: 'high_entropy_content',
      weight: 0.4,
      description: `Unusually high entropy (${entropy.toFixed(2)}) may indicate encoded content`
    });
    confidenceScores.entropy_anomaly = 0.3 + ((entropy - 5.5) * 0.2);
  }
  
  // 8. Length Anomaly Detection
  if (content.length > 50000) {
    riskIndicators.push({
      indicator: 'excessive_length',
      weight: 0.5,
      description: `Content length (${content.length}) exceeds safe threshold`
    });
    threats.push({
      type: 'adversarial_input',
      severity: 'medium',
      matches: [{ pattern: 'length_attack', position: 0 }],
      method: 'heuristic_detection'
    });
  }
  
  // Determine maximum severity
  const severityOrder = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
  let maxSeverity = 'info';
  for (const threat of threats) {
    if (severityOrder[threat.severity] > severityOrder[maxSeverity]) {
      maxSeverity = threat.severity;
    }
  }
  
  return { threats, confidenceScores, riskIndicators, maxSeverity };
}

async function hashContent(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function sanitizeExcerpt(content, maxLength = 2000) {
  if (!content) return '';
  
  // Remove potential XSS vectors
  let sanitized = content
    .replace(/<[^>]*>/g, '[TAG]')
    .replace(/javascript:/gi, '[JS:]')
    .replace(/on\w+\s*=/gi, '[EVENT=]')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .substring(0, maxLength);
  
  if (content.length > maxLength) {
    sanitized += '... [TRUNCATED]';
  }
  
  return sanitized;
}

function extractIOCs(content) {
  const iocs = [];
  
  // IP addresses
  const ipRegex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  const ips = content.match(ipRegex) || [];
  ips.forEach(ip => iocs.push({ type: 'ip', value: ip, context: 'extracted_from_threat' }));
  
  // URLs
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const urls = content.match(urlRegex) || [];
  urls.forEach(url => iocs.push({ type: 'url', value: url.substring(0, 500), context: 'extracted_from_threat' }));
  
  // Email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = content.match(emailRegex) || [];
  emails.forEach(email => iocs.push({ type: 'email', value: email, context: 'extracted_from_threat' }));
  
  // Hashes (MD5, SHA1, SHA256)
  const hashRegex = /\b[a-fA-F0-9]{32,64}\b/g;
  const hashes = content.match(hashRegex) || [];
  hashes.forEach(hash => {
    let type = 'hash_unknown';
    if (hash.length === 32) type = 'md5';
    else if (hash.length === 40) type = 'sha1';
    else if (hash.length === 64) type = 'sha256';
    iocs.push({ type, value: hash, context: 'extracted_from_threat' });
  });
  
  return iocs.slice(0, 50); // Limit IOCs
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { 
      action,
      content,
      direction = 'input', // 'input' or 'output'
      context = {},
      threat_id,
      mitigation_action,
      analyst_notes
    } = body;
    
    // Action: Analyze content for threats
    if (action === 'analyze') {
      if (!content) {
        return Response.json({ error: 'Content required for analysis' }, { status: 400 });
      }
      
      const analysis = analyzeContent(content, direction);
      
      // If threats detected, log them
      if (analysis.threats.length > 0) {
        const contentHash = await hashContent(content);
        const matchedPatterns = analysis.threats.flatMap(t => 
          t.matches.map(m => m.pattern + ':' + m.matched.substring(0, 50))
        );
        
        // Create chain of custody hash
        const custodyData = JSON.stringify({
          timestamp: new Date().toISOString(),
          user_id: user.id,
          content_hash: contentHash,
          threats: analysis.threats.map(t => t.type)
        });
        const custodyHash = await hashContent(custodyData);
        
        // Create threat event record
        const threatEvent = await base44.entities.AIThreatEvent.create({
          organization_id: user.organization_id,
          case_id: context.case_id || null,
          schema_version: '1.0.0',
          event_type: analysis.threats[0].type,
          severity: analysis.maxSeverity,
          detection_method: analysis.threats[0].method,
          status: 'detected',
          source_type: direction === 'input' ? 'user_input' : 'ai_output',
          source_context: {
            user_id: user.id,
            session_id: context.session_id,
            ip_address: context.ip_address,
            user_agent: context.user_agent,
            endpoint: context.endpoint,
            request_id: context.request_id || crypto.randomUUID()
          },
          threat_content: {
            raw_hash: contentHash,
            sanitized_excerpt: sanitizeExcerpt(content),
            matched_patterns: matchedPatterns,
            confidence_scores: analysis.confidenceScores
          },
          risk_indicators: analysis.riskIndicators,
          mitigation_actions: [],
          blocked: analysis.maxSeverity === 'critical',
          quarantined: false,
          reported: false,
          ioc_extracted: extractIOCs(content),
          chain_of_custody_hash: custodyHash
        });
        
        // Log to audit
        console.log(`[AI_THREAT_DETECTED] Type: ${analysis.threats[0].type}, Severity: ${analysis.maxSeverity}, User: ${user.email}, Event: ${threatEvent.id}`);
        
        return Response.json({
          detected: true,
          threat_event_id: threatEvent.id,
          severity: analysis.maxSeverity,
          threats: analysis.threats,
          risk_indicators: analysis.riskIndicators,
          confidence_scores: analysis.confidenceScores,
          blocked: analysis.maxSeverity === 'critical',
          recommendation: analysis.maxSeverity === 'critical' 
            ? 'BLOCK: Request blocked due to critical threat level'
            : analysis.maxSeverity === 'high'
              ? 'REVIEW: Manual review recommended before proceeding'
              : 'MONITOR: Log and continue with caution',
          latency_ms: Date.now() - startTime
        });
      }
      
      return Response.json({
        detected: false,
        severity: 'info',
        threats: [],
        risk_indicators: analysis.riskIndicators,
        blocked: false,
        latency_ms: Date.now() - startTime
      });
    }
    
    // Action: List threat events
    if (action === 'list') {
      const { status, severity, event_type, limit = 50, offset = 0 } = body;
      
      const filter = { organization_id: user.organization_id };
      if (status) filter.status = status;
      if (severity) filter.severity = severity;
      if (event_type) filter.event_type = event_type;
      
      const events = await base44.entities.AIThreatEvent.filter(filter, '-created_date', limit);
      
      return Response.json({
        events,
        total: events.length,
        latency_ms: Date.now() - startTime
      });
    }
    
    // Action: Update threat status
    if (action === 'update_status') {
      if (!threat_id) {
        return Response.json({ error: 'threat_id required' }, { status: 400 });
      }
      
      const updateData = { status: body.status };
      if (analyst_notes) {
        updateData.analyst_notes = analyst_notes;
      }
      
      await base44.entities.AIThreatEvent.update(threat_id, updateData);
      
      console.log(`[AI_THREAT_STATUS_UPDATE] Event: ${threat_id}, New Status: ${body.status}, User: ${user.email}`);
      
      return Response.json({ success: true, latency_ms: Date.now() - startTime });
    }
    
    // Action: Add mitigation action
    if (action === 'add_mitigation') {
      if (!threat_id || !mitigation_action) {
        return Response.json({ error: 'threat_id and mitigation_action required' }, { status: 400 });
      }
      
      const event = await base44.entities.AIThreatEvent.filter({ id: threat_id });
      if (!event.length) {
        return Response.json({ error: 'Threat event not found' }, { status: 404 });
      }
      
      const existingActions = event[0].mitigation_actions || [];
      existingActions.push({
        action: mitigation_action,
        timestamp: new Date().toISOString(),
        result: body.result || 'pending',
        performed_by: user.email
      });
      
      await base44.entities.AIThreatEvent.update(threat_id, {
        mitigation_actions: existingActions,
        status: 'mitigated'
      });
      
      console.log(`[AI_THREAT_MITIGATION] Event: ${threat_id}, Action: ${mitigation_action}, User: ${user.email}`);
      
      return Response.json({ success: true, latency_ms: Date.now() - startTime });
    }
    
    // Action: Get statistics
    if (action === 'stats') {
      const allEvents = await base44.entities.AIThreatEvent.filter(
        { organization_id: user.organization_id },
        '-created_date',
        1000
      );
      
      const stats = {
        total: allEvents.length,
        by_severity: {},
        by_type: {},
        by_status: {},
        blocked_count: 0,
        last_24h: 0,
        last_7d: 0
      };
      
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      
      for (const event of allEvents) {
        stats.by_severity[event.severity] = (stats.by_severity[event.severity] || 0) + 1;
        stats.by_type[event.event_type] = (stats.by_type[event.event_type] || 0) + 1;
        stats.by_status[event.status] = (stats.by_status[event.status] || 0) + 1;
        if (event.blocked) stats.blocked_count++;
        
        const eventTime = new Date(event.created_date).getTime();
        if (now - eventTime < day) stats.last_24h++;
        if (now - eventTime < 7 * day) stats.last_7d++;
      }
      
      return Response.json({ stats, latency_ms: Date.now() - startTime });
    }
    
    // Action: Generate report
    if (action === 'generate_report') {
      const { start_date, end_date } = body;
      
      const allEvents = await base44.entities.AIThreatEvent.filter(
        { organization_id: user.organization_id },
        '-created_date',
        5000
      );
      
      // Filter by date range
      const filteredEvents = allEvents.filter(e => {
        const eventDate = new Date(e.created_date);
        if (start_date && eventDate < new Date(start_date)) return false;
        if (end_date && eventDate > new Date(end_date)) return false;
        return true;
      });
      
      const report = {
        generated_at: new Date().toISOString(),
        generated_by: user.email,
        organization_id: user.organization_id,
        date_range: { start: start_date, end: end_date },
        summary: {
          total_events: filteredEvents.length,
          critical: filteredEvents.filter(e => e.severity === 'critical').length,
          high: filteredEvents.filter(e => e.severity === 'high').length,
          medium: filteredEvents.filter(e => e.severity === 'medium').length,
          blocked: filteredEvents.filter(e => e.blocked).length,
          mitigated: filteredEvents.filter(e => e.status === 'mitigated').length
        },
        top_threat_types: Object.entries(
          filteredEvents.reduce((acc, e) => {
            acc[e.event_type] = (acc[e.event_type] || 0) + 1;
            return acc;
          }, {})
        ).sort((a, b) => b[1] - a[1]).slice(0, 10),
        events: filteredEvents.map(e => ({
          id: e.id,
          type: e.event_type,
          severity: e.severity,
          status: e.status,
          detected_at: e.created_date,
          blocked: e.blocked
        }))
      };
      
      // Hash the report for integrity
      report.integrity_hash = await hashContent(JSON.stringify(report));
      
      return Response.json({ report, latency_ms: Date.now() - startTime });
    }
    
    return Response.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    console.error('[AI_THREAT_DETECTOR_ERROR]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});