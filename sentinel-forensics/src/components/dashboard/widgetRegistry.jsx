/**
 * PHASE 6: Widget Registry
 * Central registry for all dashboard widgets
 */

import { Activity, AlertTriangle, Shield, FileCheck, Database, TrendingUp, BarChart3, PieChart } from 'lucide-react';

export const widgetRegistry = {
  alertTrend: {
    key: 'alertTrend',
    name: 'Alert Trend',
    description: 'Alert volume over time',
    icon: TrendingUp,
    category: 'Alerts',
    defaultSize: { w: 6, h: 3 },
    supportsDrilldown: true,
    drilldownType: 'Alert',
    supportsLocalFilters: true,
    isRealtime: true,
    component: 'AlertTrendWidget'
  },
  
  criticalAlerts: {
    key: 'criticalAlerts',
    name: 'Critical Alerts',
    description: 'Active critical alerts count',
    icon: AlertTriangle,
    category: 'Alerts',
    defaultSize: { w: 3, h: 2 },
    supportsDrilldown: true,
    drilldownType: 'Alert',
    supportsLocalFilters: false,
    isRealtime: true,
    component: 'CriticalAlertsWidget'
  },
  
  threatOverview: {
    key: 'threatOverview',
    name: 'Threat Overview',
    description: 'Active threats by severity',
    icon: Shield,
    category: 'Threats',
    defaultSize: { w: 4, h: 3 },
    supportsDrilldown: true,
    drilldownType: 'ThreatDetection',
    supportsLocalFilters: true,
    isRealtime: true,
    component: 'ThreatOverviewWidget'
  },
  
  policyCompliance: {
    key: 'policyCompliance',
    name: 'Policy Compliance',
    description: 'Device compliance summary',
    icon: FileCheck,
    category: 'Compliance',
    defaultSize: { w: 4, h: 3 },
    supportsDrilldown: true,
    drilldownType: 'MobileDevice',
    supportsLocalFilters: false,
    isRealtime: false,
    component: 'PolicyComplianceWidget'
  },
  
  evidenceIntegrity: {
    key: 'evidenceIntegrity',
    name: 'Evidence Integrity',
    description: 'Evidence verification status',
    icon: Database,
    category: 'Forensics',
    defaultSize: { w: 3, h: 2 },
    supportsDrilldown: true,
    drilldownType: 'EvidenceV2',
    supportsLocalFilters: false,
    isRealtime: false,
    component: 'EvidenceIntegrityWidget'
  },
  
  activityFeed: {
    key: 'activityFeed',
    name: 'Recent Activity',
    description: 'Latest security events',
    icon: Activity,
    category: 'Activity',
    defaultSize: { w: 4, h: 4 },
    supportsDrilldown: true,
    drilldownType: 'SecurityAuditLog',
    supportsLocalFilters: true,
    isRealtime: true,
    component: 'ActivityFeedWidget'
  },
  
  alertsBySeverity: {
    key: 'alertsBySeverity',
    name: 'Alerts by Severity',
    description: 'Alert distribution pie chart',
    icon: PieChart,
    category: 'Alerts',
    defaultSize: { w: 3, h: 3 },
    supportsDrilldown: true,
    drilldownType: 'Alert',
    supportsLocalFilters: false,
    isRealtime: true,
    component: 'AlertsBySeverityWidget'
  },
  
  devicePosture: {
    key: 'devicePosture',
    name: 'Device Posture',
    description: 'Device health metrics',
    icon: BarChart3,
    category: 'Devices',
    defaultSize: { w: 5, h: 3 },
    supportsDrilldown: true,
    drilldownType: 'MobileDevice',
    supportsLocalFilters: true,
    isRealtime: false,
    component: 'DevicePostureWidget'
  }
};

export const widgetCategories = [
  { key: 'all', label: 'All Widgets' },
  { key: 'Alerts', label: 'Alerts' },
  { key: 'Threats', label: 'Threats' },
  { key: 'Compliance', label: 'Compliance' },
  { key: 'Forensics', label: 'Forensics' },
  { key: 'Activity', label: 'Activity' },
  { key: 'Devices', label: 'Devices' }
];

export function getWidget(key) {
  return widgetRegistry[key];
}

export function getWidgetsByCategory(category) {
  if (category === 'all') return Object.values(widgetRegistry);
  return Object.values(widgetRegistry).filter(w => w.category === category);
}