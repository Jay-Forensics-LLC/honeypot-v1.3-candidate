/**
 * PHASE 2: Runtime Navigation Validation
 * 
 * Validates that all navigation items have corresponding routes
 * and that all routes are properly configured.
 * 
 * Only runs in development/internal mode to avoid performance impact.
 */

import { navigationConfig } from '../config/navigationConfig';

/**
 * Extract all page names from navigation config
 */
function extractNavigationPages() {
  const pages = new Set();
  
  navigationConfig.forEach(category => {
    category.submenu?.forEach(item => {
      pages.add(item.page);
    });
  });
  
  return Array.from(pages);
}

/**
 * Validate navigation integrity
 * Returns array of validation issues
 */
export function validateNavigation(routeManifest = []) {
  const issues = [];
  const navPages = extractNavigationPages();
  const routeSet = new Set(routeManifest);
  
  // Check for missing routes
  navPages.forEach(page => {
    if (!routeSet.has(page)) {
      issues.push({
        type: 'MISSING_ROUTE',
        severity: 'CRITICAL',
        page,
        message: `Navigation item "${page}" has no corresponding route definition`
      });
    }
  });
  
  // Check for duplicate nav entries
  const pageCounts = {};
  navigationConfig.forEach(category => {
    category.submenu?.forEach(item => {
      pageCounts[item.page] = (pageCounts[item.page] || 0) + 1;
    });
  });
  
  Object.entries(pageCounts).forEach(([page, count]) => {
    if (count > 1) {
      issues.push({
        type: 'DUPLICATE_NAV_ITEM',
        severity: 'MEDIUM',
        page,
        count,
        message: `Page "${page}" appears ${count} times in navigation`
      });
    }
  });
  
  return issues;
}

/**
 * Generate route manifest from App.js routes
 * (This would need to be manually maintained or generated at build time)
 */
export const ROUTE_MANIFEST = [
  'App', 'Home', 'Dashboard', 'Cases', 'CaseDetail',
  'Evidence', 'EvidenceDetail', 'Credentials',
  'Devices', 'DeviceInventory', 'DeviceCompliance', 'DeviceDetail',
  'DeviceActionsHistory', 'ComplianceReporting',
  'NetworkMonitor', 'BLEMonitor', 'NetworkSecurity',
  'Reports', 'ReportBuilder', 'Tools', 'Profile',
  'IOSDiagnostics', 'NetworkUploader',
  'Pricing', 'Subscription', 'Referrals', 'Downloads',
  'AssetInventory', 'AuditTrail', 'ComplianceDashboard',
  'SecurityAgent', 'ActiveDefense', 'CovertOperations',
  'AnalyticsDashboard', 'IntegrationsDashboard',
  'Sessions', 'SessionDetail', 'NewScanSession',
  'AdminSettings', 'SecurityAudit', 'ContrastAudit',
  'OverlapAudit', 'RecycleBin', 'Documentation',
  'AgentTokenManagement', 'SystemHealthDashboard',
  'AutomationDashboard', 'AutomationCycleDashboard',
  'MFAManagement', 'NotificationSettings',
  'EvidenceVault', 'TagManagement', 'ReviewerInbox',
  'EndpointAgents', 'AgentDeployment', 'EndpointSecurityCenter',
  'MobileDeviceManagement', 'MobileEnrollment', 'MDMRemoval',
  'ForensicModule', 'ChainOfCustody',
  'VPNRotator', 'PlaybookManager', 'SecurityPolicyManagement',
  'ThreatIntelDashboard', 'SecurityDashboard',
  'ExpertNetwork', 'SecurityPostureMonitor',
  'IntelExplorer', 'FeedManagement', 'ThreatActorManagement',
  'SensorStubGenerator', 'ApiKeyManagement', 'ScheduledWeeklyAudit',
  'AIAnalytics', 'EnrichmentDashboard', 'PolicyCenter',
  'EmailIntel', 'CompositeRisk', 'BatchEnrichment', 'DeviceIntel',
  'NavigationHealthCheck', 'NavigationAnalyticsDashboard'
];

/**
 * Run full navigation audit
 */
export function runNavigationAudit() {
  console.group('🔍 Navigation Integrity Audit');
  
  const issues = validateNavigation(ROUTE_MANIFEST);
  
  if (issues.length === 0) {
    console.log('✅ Navigation audit passed - all items have routes');
  } else {
    console.warn(`⚠️ Found ${issues.length} navigation issues:`);
    
    issues.forEach(issue => {
      const emoji = issue.severity === 'CRITICAL' ? '🚨' : 
                    issue.severity === 'MEDIUM' ? '⚠️' : 'ℹ️';
      console.warn(`${emoji} [${issue.type}] ${issue.message}`);
    });
  }
  
  console.groupEnd();
  
  return issues;
}

/**
 * Initialize navigation validator (dev mode only)
 */
export function initNavigationValidator() {
  // Only run in development or for internal users
  if (process.env.NODE_ENV === 'development') {
    // Defer to avoid blocking app startup
    setTimeout(() => {
      runNavigationAudit();
    }, 2000);
  }
}