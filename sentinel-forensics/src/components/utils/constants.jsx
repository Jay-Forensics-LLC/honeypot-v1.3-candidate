/**
 * Application-wide constants
 */

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Query stale times (in milliseconds)
export const STALE_TIME = {
  SHORT: 30000,    // 30 seconds
  MEDIUM: 60000,   // 1 minute
  LONG: 300000,    // 5 minutes
  VERY_LONG: 600000 // 10 minutes
};

// Cache times (in milliseconds)
export const CACHE_TIME = {
  SHORT: 60000,    // 1 minute
  MEDIUM: 300000,  // 5 minutes
  LONG: 600000,    // 10 minutes
  VERY_LONG: 1800000 // 30 minutes
};

// Severity levels
export const SEVERITY_LEVELS = {
  INFO: 'info',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Severity colors (Tailwind classes)
export const SEVERITY_COLORS = {
  [SEVERITY_LEVELS.INFO]: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  [SEVERITY_LEVELS.LOW]: 'bg-green-500/20 text-green-400 border-green-500/50',
  [SEVERITY_LEVELS.MEDIUM]: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  [SEVERITY_LEVELS.HIGH]: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  [SEVERITY_LEVELS.CRITICAL]: 'bg-red-500/20 text-red-400 border-red-500/50'
};

// Status types
export const STATUS_TYPES = {
  NEW: 'new',
  INVESTIGATING: 'investigating',
  CONFIRMED: 'confirmed',
  RESOLVED: 'resolved',
  FALSE_POSITIVE: 'false_positive'
};

// Status colors
export const STATUS_COLORS = {
  [STATUS_TYPES.NEW]: 'bg-blue-500/20 text-blue-400',
  [STATUS_TYPES.INVESTIGATING]: 'bg-yellow-500/20 text-yellow-400',
  [STATUS_TYPES.CONFIRMED]: 'bg-red-500/20 text-red-400',
  [STATUS_TYPES.RESOLVED]: 'bg-green-500/20 text-green-400',
  [STATUS_TYPES.FALSE_POSITIVE]: 'bg-slate-500/20 text-slate-400'
};

// Evidence types
export const EVIDENCE_TYPES = {
  FILE: 'file',
  NETWORK_CAPTURE: 'network_capture',
  DEVICE_LOG: 'device_log',
  SCREENSHOT: 'screenshot',
  METADATA: 'metadata',
  FORENSIC_IMAGE: 'forensic_image',
  MEMORY_DUMP: 'memory_dump',
  OTHER: 'other'
};

// Case types
export const CASE_TYPES = {
  NETWORK_INTRUSION: 'network_intrusion',
  DEVICE_COMPROMISE: 'device_compromise',
  DATA_BREACH: 'data_breach',
  MALWARE_ANALYSIS: 'malware_analysis',
  SURVEILLANCE_DETECTION: 'surveillance_detection',
  OTHER: 'other'
};

// Subscription tiers
export const SUBSCRIPTION_TIERS = {
  FREE: 'free',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
  FORENSIC_SUITE: 'forensic_suite'
};

// User roles
export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer'
};

// Toast durations (in milliseconds)
export const TOAST_DURATION = {
  SHORT: 2000,
  MEDIUM: 4000,
  LONG: 6000
};

// File size limits (in MB)
export const FILE_SIZE_LIMITS = {
  EVIDENCE: 500,
  AVATAR: 5,
  DOCUMENT: 100
};

// Allowed file types
export const ALLOWED_FILE_TYPES = {
  IMAGES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  DOCUMENTS: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  EVIDENCE: [] // Allow all types
};

// Animation durations (in seconds)
export const ANIMATION_DURATION = {
  FAST: 0.2,
  NORMAL: 0.3,
  SLOW: 0.5
};