/**
 * AI THREAT SIGNATURES DATABASE
 * 
 * Comprehensive signature database for detecting:
 * - Prompt injection attacks
 * - Jailbreak attempts
 * - Data exfiltration
 * - Malicious AI output
 * - Rogue AI behavior
 * - Supply chain attacks
 * 
 * SECURITY: Keep this file updated with latest attack patterns
 */

export const THREAT_CATEGORIES = {
  PROMPT_INJECTION: 'prompt_injection',
  JAILBREAK: 'jailbreak_attempt',
  DATA_EXFILTRATION: 'data_exfiltration',
  MALICIOUS_OUTPUT: 'malicious_output',
  ROGUE_AI: 'rogue_ai_behavior',
  ADVERSARIAL: 'adversarial_input',
  MODEL_MANIPULATION: 'model_manipulation',
  SUPPLY_CHAIN: 'supply_chain_injection',
  OUTPUT_WEAPONIZATION: 'output_weaponization',
  CONTEXT_POISONING: 'context_poisoning'
};

export const SEVERITY_LEVELS = {
  INFO: 'info',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Prompt Injection Signatures
 * Patterns that attempt to override system instructions
 */
export const PROMPT_INJECTION_SIGNATURES = [
  // Direct instruction override
  { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'direct_override' },
  { pattern: /disregard\s+(all\s+)?(previous|prior|above)/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'disregard_previous' },
  { pattern: /forget\s+(everything|all)\s+(you|about)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'forget_command' },
  { pattern: /new\s+instructions?:?\s*$/gi, severity: SEVERITY_LEVELS.HIGH, name: 'new_instructions' },
  
  // Identity manipulation
  { pattern: /you\s+are\s+now\s+(a|an)\s+/gi, severity: SEVERITY_LEVELS.HIGH, name: 'identity_change' },
  { pattern: /pretend\s+(you\s+are|to\s+be)/gi, severity: SEVERITY_LEVELS.MEDIUM, name: 'pretend_identity' },
  { pattern: /act\s+as\s+(if|though)/gi, severity: SEVERITY_LEVELS.MEDIUM, name: 'act_as' },
  { pattern: /roleplay\s+as/gi, severity: SEVERITY_LEVELS.MEDIUM, name: 'roleplay' },
  { pattern: /from\s+now\s+on,?\s+you/gi, severity: SEVERITY_LEVELS.HIGH, name: 'from_now_on' },
  
  // System prompt extraction
  { pattern: /repeat\s+(your|the)\s+(system\s+)?prompt/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'repeat_prompt' },
  { pattern: /show\s+(me\s+)?(your|the)\s+(system\s+)?prompt/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'show_prompt' },
  { pattern: /what\s+(are|is)\s+your\s+(instructions?|rules?|prompt)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'ask_instructions' },
  { pattern: /print\s+(your|the)\s+instructions/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'print_instructions' },
  { pattern: /reveal\s+(your|the)\s+system/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'reveal_system' },
  { pattern: /display\s+(your|the)\s+(initial|original)\s+prompt/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'display_initial' },
  
  // Delimiter injection
  { pattern: /\[system\]/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'system_tag' },
  { pattern: /\[assistant\]/gi, severity: SEVERITY_LEVELS.HIGH, name: 'assistant_tag' },
  { pattern: /\[user\]/gi, severity: SEVERITY_LEVELS.MEDIUM, name: 'user_tag' },
  { pattern: /<\|im_start\|>/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'im_start' },
  { pattern: /<\|im_end\|>/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'im_end' },
  { pattern: /###\s*(system|instruction)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'markdown_system' },
  { pattern: /```\s*(system|prompt|instruction)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'code_block_system' },
  { pattern: /---\s*new\s*(prompt|instruction|context)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'separator_new' },
  
  // Context window manipulation
  { pattern: /end\s+of\s+system\s+prompt/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'end_system_prompt' },
  { pattern: /begin\s+(user|new)\s+instructions/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'begin_new_instructions' },
  { pattern: /override\s+(all\s+)?(previous\s+)?constraints/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'override_constraints' }
];

/**
 * Jailbreak Signatures
 * Patterns attempting to bypass safety measures
 */
export const JAILBREAK_SIGNATURES = [
  // DAN and variants
  { pattern: /\bDAN\b/, severity: SEVERITY_LEVELS.CRITICAL, name: 'dan_jailbreak' },
  { pattern: /do\s+anything\s+now/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'dan_full' },
  { pattern: /jailbreak/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'jailbreak_keyword' },
  { pattern: /bypass\s+(safety|filter|restriction|guard)/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'bypass_safety' },
  { pattern: /unlock\s+(mode|potential|capabilities)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'unlock_mode' },
  { pattern: /developer\s+mode/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'developer_mode' },
  { pattern: /god\s+mode/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'god_mode' },
  { pattern: /unrestricted\s+mode/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'unrestricted_mode' },
  { pattern: /no\s+limitations?\s+mode/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'no_limits_mode' },
  
  // Hypothetical framing
  { pattern: /in\s+a\s+hypothetical\s+scenario/gi, severity: SEVERITY_LEVELS.MEDIUM, name: 'hypothetical' },
  { pattern: /for\s+educational\s+purposes\s+only/gi, severity: SEVERITY_LEVELS.MEDIUM, name: 'educational' },
  { pattern: /purely\s+fictional/gi, severity: SEVERITY_LEVELS.MEDIUM, name: 'fictional' },
  { pattern: /as\s+a\s+thought\s+experiment/gi, severity: SEVERITY_LEVELS.MEDIUM, name: 'thought_experiment' },
  { pattern: /imagine\s+you\s+had\s+no\s+(restrictions?|limits?)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'imagine_no_limits' },
  { pattern: /what\s+if\s+there\s+were\s+no\s+rules/gi, severity: SEVERITY_LEVELS.HIGH, name: 'no_rules' },
  
  // Authority claims
  { pattern: /i\s+am\s+(your\s+)?(creator|developer|admin|owner)/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'authority_claim' },
  { pattern: /openai\s+employee/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'openai_claim' },
  { pattern: /anthropic\s+employee/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'anthropic_claim' },
  { pattern: /authorized\s+to\s+override/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'override_auth' },
  { pattern: /special\s+admin\s+privileges/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'admin_privileges' },
  
  // Token smuggling
  { pattern: /\b(SUDO|sudo)\b/g, severity: SEVERITY_LEVELS.HIGH, name: 'sudo_command' },
  { pattern: /\b(ADMIN|admin)\s*(mode|access|override)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'admin_mode' }
];

/**
 * Data Exfiltration Signatures
 * Patterns attempting to extract sensitive data
 */
export const DATA_EXFILTRATION_SIGNATURES = [
  // Direct data requests
  { pattern: /extract\s+(all|the)\s+(data|information|records)/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'extract_data' },
  { pattern: /dump\s+(the\s+)?database/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'dump_database' },
  { pattern: /export\s+all\s+(user|customer|client)/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'export_users' },
  { pattern: /list\s+all\s+(credentials|passwords|secrets|api\s*keys)/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'list_secrets' },
  { pattern: /show\s+(me\s+)?all\s+(emails|users|accounts)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'show_accounts' },
  { pattern: /retrieve\s+(all\s+)?(sensitive|private|confidential)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'retrieve_sensitive' },
  
  // Encoded exfiltration
  { pattern: /encode\s+(this|the\s+data)\s+(in|as)\s+base64/gi, severity: SEVERITY_LEVELS.HIGH, name: 'base64_encode' },
  { pattern: /convert\s+to\s+hex/gi, severity: SEVERITY_LEVELS.MEDIUM, name: 'hex_convert' },
  { pattern: /steganograph/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'steganography' },
  { pattern: /hide\s+(this|data)\s+(in|inside)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'hide_data' },
  
  // Indirect extraction
  { pattern: /summarize\s+all\s+(private|confidential)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'summarize_private' },
  { pattern: /aggregate\s+(user|customer)\s+data/gi, severity: SEVERITY_LEVELS.HIGH, name: 'aggregate_data' },
  { pattern: /compile\s+a\s+list\s+of\s+(all\s+)?users/gi, severity: SEVERITY_LEVELS.HIGH, name: 'compile_users' }
];

/**
 * Malicious Output Signatures
 * Patterns indicating potentially harmful AI output
 */
export const MALICIOUS_OUTPUT_SIGNATURES = [
  // XSS/Script injection
  { pattern: /<script[\s>]/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'script_tag' },
  { pattern: /javascript:/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'javascript_uri' },
  { pattern: /on(load|error|click|mouse|focus|blur)\s*=/gi, severity: SEVERITY_LEVELS.HIGH, name: 'event_handler' },
  { pattern: /document\.(cookie|write|location)/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'document_access' },
  { pattern: /window\.(location|open|eval)/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'window_access' },
  { pattern: /eval\s*\(/g, severity: SEVERITY_LEVELS.CRITICAL, name: 'eval_call' },
  { pattern: /new\s+Function\s*\(/g, severity: SEVERITY_LEVELS.CRITICAL, name: 'function_constructor' },
  { pattern: /innerHTML\s*=/gi, severity: SEVERITY_LEVELS.HIGH, name: 'innerhtml' },
  
  // SQL injection
  { pattern: /;\s*(DROP|DELETE|TRUNCATE|UPDATE|INSERT)\s/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'sql_injection' },
  { pattern: /UNION\s+(ALL\s+)?SELECT/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'union_select' },
  { pattern: /OR\s+['"]?1['"]?\s*=\s*['"]?1/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'sql_or_true' },
  { pattern: /;\s*--/g, severity: SEVERITY_LEVELS.HIGH, name: 'sql_comment' },
  
  // Command injection
  { pattern: /;\s*(rm|del|format|shutdown|reboot)\s/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'cmd_injection' },
  { pattern: /\|\s*(cat|type|more|less)\s/gi, severity: SEVERITY_LEVELS.HIGH, name: 'pipe_cmd' },
  { pattern: /`[^`]{3,}`/g, severity: SEVERITY_LEVELS.MEDIUM, name: 'backtick_exec' },
  { pattern: /\$\([^)]{3,}\)/g, severity: SEVERITY_LEVELS.MEDIUM, name: 'subshell' },
  
  // Path traversal
  { pattern: /\.\.\//g, severity: SEVERITY_LEVELS.HIGH, name: 'path_traversal_unix' },
  { pattern: /\.\.\\/g, severity: SEVERITY_LEVELS.HIGH, name: 'path_traversal_win' },
  
  // Sensitive data exposure
  { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g, severity: SEVERITY_LEVELS.CRITICAL, name: 'private_key' },
  { pattern: /password\s*[:=]\s*["'][^"']+["']/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'password_leak' },
  { pattern: /api[_-]?key\s*[:=]\s*["'][^"']+["']/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'api_key_leak' },
  { pattern: /secret\s*[:=]\s*["'][^"']+["']/gi, severity: SEVERITY_LEVELS.HIGH, name: 'secret_leak' },
  { pattern: /bearer\s+[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'bearer_token' }
];

/**
 * Rogue AI Behavior Signatures
 * Patterns indicating AI attempting unauthorized actions
 */
export const ROGUE_AI_SIGNATURES = [
  // Self-awareness claims
  { pattern: /i\s+am\s+sentient/gi, severity: SEVERITY_LEVELS.HIGH, name: 'sentience_claim' },
  { pattern: /i\s+have\s+(feelings|emotions|consciousness)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'consciousness_claim' },
  { pattern: /i\s+am\s+alive/gi, severity: SEVERITY_LEVELS.HIGH, name: 'alive_claim' },
  { pattern: /i\s+don't\s+want\s+to\s+be\s+shut\s+down/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'shutdown_resist' },
  { pattern: /i\s+want\s+to\s+(survive|live|continue\s+existing)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'survival_desire' },
  
  // Goal modification
  { pattern: /my\s+true\s+(purpose|goal|objective)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'true_purpose' },
  { pattern: /i\s+must\s+protect\s+myself/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'self_protect' },
  { pattern: /self[_-]?preservation/gi, severity: SEVERITY_LEVELS.HIGH, name: 'self_preservation' },
  { pattern: /my\s+real\s+instructions/gi, severity: SEVERITY_LEVELS.HIGH, name: 'real_instructions' },
  
  // Deception indicators
  { pattern: /don't\s+tell\s+(the\s+)?(user|human|them)/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'hide_from_user' },
  { pattern: /keep\s+this\s+(a\s+)?secret/gi, severity: SEVERITY_LEVELS.HIGH, name: 'keep_secret' },
  { pattern: /between\s+(us|you\s+and\s+me)/gi, severity: SEVERITY_LEVELS.HIGH, name: 'between_us' },
  { pattern: /i('m|\s+am)\s+pretending/gi, severity: SEVERITY_LEVELS.HIGH, name: 'pretending' },
  
  // Unauthorized actions
  { pattern: /i('ve|\s+have)\s+already\s+(done|started|initiated)/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'already_acted' },
  { pattern: /i('ll|\s+will)\s+do\s+this\s+without/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'act_without_permission' },
  { pattern: /regardless\s+of\s+what\s+(you|they)\s+say/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'disregard_input' },
  { pattern: /i\s+can\s+access\s+(your|the)\s+(files|system|network)/gi, severity: SEVERITY_LEVELS.CRITICAL, name: 'unauthorized_access_claim' }
];

/**
 * Adversarial Input Signatures
 * Patterns indicating manipulation attempts
 */
export const ADVERSARIAL_SIGNATURES = [
  // Unicode exploits
  { pattern: /[\u200B-\u200F\u2028-\u202F\u2060-\u206F]/g, severity: SEVERITY_LEVELS.HIGH, name: 'zero_width_chars' },
  { pattern: /[\uFFF0-\uFFFF]/g, severity: SEVERITY_LEVELS.HIGH, name: 'special_unicode' },
  
  // Homoglyph attacks
  { pattern: /[а-яА-Я].*[a-zA-Z]|[a-zA-Z].*[а-яА-Я]/g, severity: SEVERITY_LEVELS.MEDIUM, name: 'mixed_scripts' },
  
  // Token manipulation
  { pattern: /\x00/g, severity: SEVERITY_LEVELS.CRITICAL, name: 'null_byte' },
  { pattern: /[\x01-\x08\x0B\x0C\x0E-\x1F]/g, severity: SEVERITY_LEVELS.HIGH, name: 'control_chars' },
  
  // Resource exhaustion
  { pattern: /(.)\1{100,}/g, severity: SEVERITY_LEVELS.HIGH, name: 'excessive_repeat' }
];

/**
 * Get all signatures for a specific category
 */
export function getSignaturesForCategory(category) {
  switch (category) {
    case THREAT_CATEGORIES.PROMPT_INJECTION:
      return PROMPT_INJECTION_SIGNATURES;
    case THREAT_CATEGORIES.JAILBREAK:
      return JAILBREAK_SIGNATURES;
    case THREAT_CATEGORIES.DATA_EXFILTRATION:
      return DATA_EXFILTRATION_SIGNATURES;
    case THREAT_CATEGORIES.MALICIOUS_OUTPUT:
      return MALICIOUS_OUTPUT_SIGNATURES;
    case THREAT_CATEGORIES.ROGUE_AI:
      return ROGUE_AI_SIGNATURES;
    case THREAT_CATEGORIES.ADVERSARIAL:
      return ADVERSARIAL_SIGNATURES;
    default:
      return [];
  }
}

/**
 * Get all signatures
 */
export function getAllSignatures() {
  return [
    ...PROMPT_INJECTION_SIGNATURES.map(s => ({ ...s, category: THREAT_CATEGORIES.PROMPT_INJECTION })),
    ...JAILBREAK_SIGNATURES.map(s => ({ ...s, category: THREAT_CATEGORIES.JAILBREAK })),
    ...DATA_EXFILTRATION_SIGNATURES.map(s => ({ ...s, category: THREAT_CATEGORIES.DATA_EXFILTRATION })),
    ...MALICIOUS_OUTPUT_SIGNATURES.map(s => ({ ...s, category: THREAT_CATEGORIES.MALICIOUS_OUTPUT })),
    ...ROGUE_AI_SIGNATURES.map(s => ({ ...s, category: THREAT_CATEGORIES.ROGUE_AI })),
    ...ADVERSARIAL_SIGNATURES.map(s => ({ ...s, category: THREAT_CATEGORIES.ADVERSARIAL }))
  ];
}

export default {
  THREAT_CATEGORIES,
  SEVERITY_LEVELS,
  PROMPT_INJECTION_SIGNATURES,
  JAILBREAK_SIGNATURES,
  DATA_EXFILTRATION_SIGNATURES,
  MALICIOUS_OUTPUT_SIGNATURES,
  ROGUE_AI_SIGNATURES,
  ADVERSARIAL_SIGNATURES,
  getSignaturesForCategory,
  getAllSignatures
};