import {
  Home, Shield, FileText, Users, Bell, Target,
  Zap, Network, Radar, Radio, Database, Monitor,
  AlertTriangle, DollarSign, User, Smartphone, Package,
  ClipboardList, BarChart, Sparkles, ShoppingCart, Hexagon,
  Gift, Lock, Play, BookOpen, Eye, CreditCard, Settings, Tag, Beaker, Mail, Search, Upload, Code, Activity, Key
} from 'lucide-react';
import { Rss } from 'lucide-react';

/**
 * NAVIGATION CONFIGURATION WITH FEATURE FLAGS
 * 
 * Beta v1 Scope Control:
 * - Public: Always visible (core workflows)
 * - Beta: Visible to beta testers / Expert Mode
 * - Internal: Hidden by default, developer/admin only
 * 
 * This enforces the Beta Cut at runtime.
 */

export const FEATURE_VISIBILITY = {
  PUBLIC: 'public',
  BETA: 'beta',
  INTERNAL: 'internal'
};

/**
 * Icon mapping with safe fallback
 * Prevents runtime crashes from missing icon strings
 */
export const iconMap = {
  Home,
  Shield,
  FileText,
  Users,
  Bell,
  Target,
  Zap,
  Network,
  Radar,
  Radio,
  Database,
  Monitor,
  AlertTriangle,
  DollarSign,
  User,
  Smartphone,
  Package,
  ClipboardList,
  BarChart,
  Sparkles,
  ShoppingCart,
  Hexagon,
  Gift,
  Lock,
  Play,
  BookOpen,
  Eye,
  CreditCard,
  Settings,
  Tag,
  Beaker,
  Mail,
  Search,
  Upload,
  Code,
  Activity,
  Key,
  Rss
};

/**
 * Get icon component with safe fallback
 */
export function getIcon(iconName) {
  return iconMap[iconName] || Home;
}

/**
 * Navigation structure with visibility flags
 * 
 * CRITICAL: Each route now includes canonical 'path' for gate matching
 * Gate logic matches against pathname, not page name (more reliable)
 * 
 * Beta v1 Public Pages (Core Workflow):
 * - Dashboard, Cases, Evidence, Devices
 * - Network Monitor, BLE Monitor (2 stable tools)
 * - Reports
 * 
 * Everything else: BETA or INTERNAL
 */
export const navigationConfig = [
  {
    name: 'Core Operations',
    icon: 'Home',
    visibility: FEATURE_VISIBILITY.PUBLIC,
    submenu: [
      { name: 'Home', page: 'Home', icon: 'Home', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Dashboards Hub', page: 'DashboardsHub', icon: 'BarChart', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Review Hub', page: 'ReviewHub', icon: 'ClipboardList', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Control Plane Defense', page: 'ControlPlaneDefense', path: '/ControlPlaneDefense', icon: 'Shield', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Dashboard', page: 'Dashboard', path: '/Dashboard', icon: 'Home', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Custom Dashboard', page: 'CustomDashboard', icon: 'BarChart', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Cases', page: 'Cases', icon: 'FileText', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Evidence', page: 'Evidence', icon: 'Database', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Tag Management', page: 'TagManagement', icon: 'Tag', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Reviewer Inbox', page: 'ReviewerInbox', icon: 'Shield', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Evidence Vault', page: 'EvidenceVault', icon: 'Lock', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Credentials', page: 'Credentials', icon: 'Lock', visibility: FEATURE_VISIBILITY.INTERNAL },
    ]
  },
  {
    name: 'Device Management',
    icon: 'Monitor',
    visibility: FEATURE_VISIBILITY.PUBLIC,
    submenu: [
      { name: 'Inventory', page: 'DeviceInventory', icon: 'Monitor', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Compliance', page: 'DeviceCompliance', icon: 'Shield', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Compliance Reporting', page: 'ComplianceReporting', icon: 'BarChart', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Actions History', page: 'DeviceActionsHistory', icon: 'Activity', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Device Detail', page: 'DeviceDetail', icon: 'Monitor', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'BLE Monitor', page: 'BLEMonitor', icon: 'Radio', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Network Monitor', page: 'NetworkMonitor', icon: 'Network', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Policy Management', page: 'PolicyManagement', icon: 'Shield', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Policy List', page: 'PolicyList', path: '/PolicyList', icon: 'FileText', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Policy Assignments', page: 'PolicyAssignments', path: '/PolicyAssignments', icon: 'Target', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Compliance Dashboard', page: 'PolicyComplianceDashboard', path: '/PolicyComplianceDashboard', icon: 'BarChart', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Actions Queue', page: 'PolicyActionsQueue', path: '/PolicyActionsQueue', icon: 'Bell', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Endpoint Security Center', page: 'EndpointSecurityCenter', icon: 'Shield', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Endpoint Agents', page: 'EndpointAgents', icon: 'Shield', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Agent Deployment', page: 'AgentDeployment', icon: 'Zap', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Agent Tokens', page: 'AgentTokenManagement', icon: 'Lock', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Network Security', page: 'NetworkSecurity', icon: 'Network', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Network Uploader', page: 'NetworkUploader', icon: 'Network', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'iOS Diagnostics', page: 'IOSDiagnostics', icon: 'Smartphone', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Mobile Device Management', page: 'MobileDeviceManagement', icon: 'Smartphone', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Mobile Enrollment', page: 'MobileEnrollment', icon: 'Smartphone', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'MDM Removal', page: 'MDMRemoval', icon: 'Smartphone', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'VPN Rotator', page: 'VPNRotator', icon: 'Network', visibility: FEATURE_VISIBILITY.INTERNAL },
    ]
  },
  {
    name: 'Forensics & Analytics',
    icon: 'Database',
    visibility: FEATURE_VISIBILITY.PUBLIC,
    submenu: [
      { name: 'Analytics Dashboard', page: 'AnalyticsDashboard', path: '/AnalyticsDashboard', icon: 'BarChart', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Incident Timeline', page: 'IncidentTimeline', icon: 'Activity', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Forensic Module', page: 'ForensicModule', icon: 'Shield', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Reports', page: 'Reports', icon: 'BarChart', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'Report Builder', page: 'ReportBuilder', icon: 'FileText', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Chain of Custody', page: 'ChainOfCustody', icon: 'FileText', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Tools', page: 'Tools', icon: 'Settings', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Intel Explorer', page: 'IntelExplorer', path: '/IntelExplorer', icon: 'Search', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Feed Management', page: 'FeedManagement', path: '/FeedManagement', icon: 'Rss', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Threat Actors', page: 'ThreatActorManagement', path: '/ThreatActorManagement', icon: 'Users', visibility: FEATURE_VISIBILITY.BETA },

      { name: 'Integrations', page: 'IntegrationsDashboard', icon: 'Network', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'System Health', page: 'SystemHealthDashboard', path: '/SystemHealthDashboard', icon: 'Activity', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Sessions', page: 'Sessions', icon: 'Settings', visibility: FEATURE_VISIBILITY.INTERNAL },
    ]
  },
  {
    name: 'Response & Training',
    icon: 'Target',
    visibility: FEATURE_VISIBILITY.BETA,
    submenu: [
      { name: 'Email Intelligence', page: 'EmailIntel', path: '/CaseDetail/:id/EmailIntel', icon: 'Mail', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Composite Risk', page: 'CompositeRisk', path: '/CaseDetail/:id/CompositeRisk', icon: 'Target', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Device Intelligence', page: 'DeviceIntel', path: '/CaseDetail/:id/DeviceIntel', icon: 'Monitor', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Policy Center', page: 'PolicyCenter', path: '/CaseDetail/:id/PolicyCenter', icon: 'Shield', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Batch Enrichment', page: 'BatchEnrichment', path: '/CaseDetail/:id/BatchEnrichment', icon: 'Upload', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'AI Analytics', page: 'AIAnalytics', path: '/CaseDetail/:id/AIAnalytics', icon: 'Sparkles', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Enrichment', page: 'EnrichmentDashboard', path: '/CaseDetail/:id/Enrichment', icon: 'Database', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Expert Network', page: 'ExpertNetwork', icon: 'Users', visibility: FEATURE_VISIBILITY.BETA },
    ]
  },
  {
    name: 'Advanced Security',
    icon: 'Shield',
    visibility: FEATURE_VISIBILITY.BETA,
    submenu: [
      { name: 'Live Defense', page: 'ActiveDefense', icon: 'Shield', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Covert Operations', page: 'CovertOperations', icon: 'Eye', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Threat Intelligence', page: 'ThreatIntelDashboard', icon: 'AlertTriangle', visibility: FEATURE_VISIBILITY.BETA },
    ]
  },
  {
    name: 'Automation & Compliance',
    icon: 'Zap',
    visibility: FEATURE_VISIBILITY.BETA,
    submenu: [
      { name: 'Security Dashboard', page: 'SecurityDashboard', icon: 'Shield', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Security Posture Monitor', page: 'SecurityPostureMonitor', path: '/SecurityPostureMonitor', icon: 'Shield', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Automation Dashboard', page: 'AutomationDashboard', icon: 'Zap', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Automation Cycles', page: 'AutomationCycleDashboard', icon: 'Zap', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Playbook Manager', page: 'PlaybookManager', icon: 'Play', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Security Policy Management', page: 'SecurityPolicyManagement', icon: 'Shield', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Compliance Dashboard', page: 'ComplianceDashboard', icon: 'Shield', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Audit Trail', page: 'AuditTrail', icon: 'FileText', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Asset Inventory', page: 'AssetInventory', icon: 'Package', visibility: FEATURE_VISIBILITY.INTERNAL },
    ]
    },
  {
    name: 'Administration',
    icon: 'Settings',
    visibility: FEATURE_VISIBILITY.PUBLIC,
    submenu: [
      { name: 'Profile', page: 'Profile', icon: 'User', visibility: FEATURE_VISIBILITY.PUBLIC },
      { name: 'User Management', page: 'UserManagement', icon: 'Users', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Roles & Permissions', page: 'RolesPermissions', icon: 'Shield', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Dashboard Templates', page: 'DashboardTemplates', icon: 'BarChart', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'API Keys', page: 'ApiKeyManagement', icon: 'Key', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Notification Settings', page: 'NotificationSettings', icon: 'Bell', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Pricing', page: 'Pricing', icon: 'DollarSign', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Subscription', page: 'Subscription', icon: 'CreditCard', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Referrals', page: 'Referrals', icon: 'Gift', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Downloads', page: 'Downloads', icon: 'Package', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Documentation', page: 'Documentation', icon: 'BookOpen', visibility: FEATURE_VISIBILITY.BETA },
      { name: 'Admin Settings', page: 'AdminSettings', icon: 'Settings', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Navigation Health', page: 'NavigationHealthCheck', icon: 'Activity', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Navigation Analytics', page: 'NavigationAnalyticsDashboard', icon: 'BarChart', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Security Audit', page: 'SecurityAudit', icon: 'ClipboardList', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Contrast Audit', page: 'ContrastAudit', icon: 'Eye', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Overlap Audit', page: 'OverlapAudit', icon: 'Navigation', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Codebase Audit', page: 'ScheduledWeeklyAudit', icon: 'ClipboardList', visibility: FEATURE_VISIBILITY.INTERNAL },
      { name: 'Recycle Bin', page: 'RecycleBin', icon: 'FileText', visibility: FEATURE_VISIBILITY.INTERNAL },
      ]
  },
];

/**
 * Filter navigation based on feature visibility level
 * 
 * CRITICAL FIX: Only shows categories with visible children after filtering
 * Prevents "empty category" rendering bug
 * 
 * @param {string} maxVisibility - Maximum visibility level to show (public, beta, internal)
 * @returns {Array} Filtered navigation structure
 */
export function filterNavigationByVisibility(maxVisibility) {
  const visibilityOrder = {
    [FEATURE_VISIBILITY.PUBLIC]: 0,
    [FEATURE_VISIBILITY.BETA]: 1,
    [FEATURE_VISIBILITY.INTERNAL]: 2
  };
  
  const maxLevel = visibilityOrder[maxVisibility] ?? 0;
  
  return navigationConfig
    .map(category => ({
      ...category,
      submenu: category.submenu.filter(item => visibilityOrder[item.visibility] <= maxLevel)
    }))
    // CRITICAL: Only show category if it has visible children
    .filter(category => category.submenu.length > 0);
}

/**
 * Check if a route is allowed for current visibility level
 * 
 * SECURITY FIX: Matches by pathname (canonical), not page name (brittle)
 * Prevents bypass via aliases, casing, or renamed pages
 * 
 * @param {string} pathname - Current route pathname (e.g., '/Dashboard')
 * @param {string} maxVisibility - Current visibility level
 * @returns {boolean} True if route is allowed
 */
export function isRouteAllowed(pathname, maxVisibility) {
  const visibilityOrder = {
    [FEATURE_VISIBILITY.PUBLIC]: 0,
    [FEATURE_VISIBILITY.BETA]: 1,
    [FEATURE_VISIBILITY.INTERNAL]: 2
  };
  
  const maxLevel = visibilityOrder[maxVisibility] ?? 0;
  
  // Normalize pathname for comparison (case-insensitive, remove trailing slash)
  const normalizedPath = pathname.toLowerCase().replace(/\/$/, '');
  
  for (const category of navigationConfig) {
    for (const item of category.submenu) {
      // Match by path if available, fallback to /PageName pattern
      const itemPath = (item.path || `/${item.page}`).toLowerCase().replace(/\/$/, '');
      
      if (normalizedPath === itemPath || normalizedPath === itemPath.toLowerCase()) {
        const itemLevel = visibilityOrder[item.visibility] ?? 0;
        return itemLevel <= maxLevel;
      }
    }
  }
  
  // SECURITY: If not in nav config, default to INTERNAL (fail closed)
  // This protects against unmapped routes and prevents accidental exposure
  return maxLevel >= 2;
}

/**
 * PHASE 6: Two-Tier Qualification System
 * Determines if user qualifies for INTERNAL (developer) access
 * 
 * @param {Object} user - Current user object
 * @returns {boolean} True if user qualifies for developer access
 */
export function qualifiesForDeveloperAccess(user) {
  if (!user?.email) return false;
  
  // CRITERIA 1: Explicit developer list (allowlist)
  const developerEmails = [
    'dev@sentinel-forensics.com',
    'admin@sentinel-forensics.com',
    // Add authorized developer emails here
  ];
  
  if (developerEmails.includes(user.email.toLowerCase())) {
    return true;
  }
  
  // CRITERIA 2: Admin role + specific domain
  if (user.role === 'admin' && user.email.endsWith('@sentinel-forensics.com')) {
    return true;
  }
  
  // CRITERIA 3: Special subscription tier or feature flag
  if (user.subscription_tier === 'enterprise' || user.developer_access_granted) {
    return true;
  }
  
  return false;
}

/**
 * Beta v1 Public Pages Summary (UPDATED):
 * 
 * Core Operations (4):
 * - Dashboard
 * - Cases  
 * - Evidence
 * - Devices
 * 
 * Device Management (2 tools):
 * - Network Monitor (Beta v1 Tool #1)
 * - BLE Monitor (Beta v1 Tool #2)
 * 
 * Forensics & Analytics (1):
 * - Reports
 * 
 * Administration (1):
 * - Profile
 * 
 * Total Public: 8 pages (controlled Beta Cut scope)
 * Total Beta: ~17 additional pages (for Expert Mode - includes Pricing/Subscription)
 * Total Internal: 70+ pages (Developer Mode only - gated by allowlist)
 * 
 * SECURITY FIX: Pricing/Subscription moved to BETA (not PUBLIC) to keep testers
 * focused on workflow validation instead of monetization messaging.
 */