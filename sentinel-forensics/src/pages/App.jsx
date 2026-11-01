/**
 * ROUTER COMPONENT (pages/App.js)
 * 
 * This is the main routing configuration for the application.
 * NOT to be confused with the root App shell (index.js).
 * 
 * All routes use PascalCase paths: /Dashboard, /Tools, /Pricing, etc.
 * Use createPageUrl() from @/components/utils for navigation.
 */

import React, { Suspense, lazy, useEffect, useTransition } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import LoadingFallback from '../components/demo/LoadingFallback';
import GlobalErrorBoundary from '../components/errors/GlobalErrorBoundary';
import StartupErrorBoundary from '../components/errors/StartupErrorBoundary';
import { RouteErrorBoundary } from '../components/errors/RouteErrorBoundary';
import CodeSplitBoundary from '../components/performance/CodeSplitBoundary';
import { EnhancedRBACProvider } from '../components/security/EnhancedRBACProvider';
import { OnboardingGuard } from '../components/onboarding/OnboardingGuard';
import { Toaster } from 'sonner';
import { BackgroundProcessProvider } from '../components/background/BackgroundProcessProvider';
import BackgroundProcessIndicator from '../components/background/BackgroundProcessIndicator';
import Layout from './Layout';
import { performanceMonitor } from '../components/performance/PerformanceMonitor';
import { DataPreloader } from '../components/performance/DataPreloader';
import { OfflineIndicator } from '../components/common/OfflineIndicator';
import { memoryManager } from '../components/performance/MemoryManager';
import { deviceIntegrityChecker } from '../components/security/DeviceIntegrityChecker';
import { setupContainer } from '../components/lib/Container';
import { initNavigationValidator } from '../components/validation/NavigationValidator';
import NavigationPanicButton from '../components/navigation/NavigationPanicButton';
import { useNavigationPreloader, useIdlePreloader } from '../components/navigation/NavigationPreloader';
import { useNavigationRecovery, useNavigationTimeout, useNetworkRecovery } from '../components/navigation/NavigationRecoverySystem';

// PHASE 5: Ultra-optimized query client - aggressive caching + SECURITY
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0, // No retries on initial load
      retryDelay: 1000,
      staleTime: 10 * 60 * 1000, // 10 min - longer cache
      cacheTime: 15 * 60 * 1000, // 15 min
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false, // Disable auto-refetch
      useErrorBoundary: false,
      suspense: false, // CRITICAL: Must be false to avoid suspense errors
      networkMode: 'online',
      structuralSharing: false, // Disable for performance
      timeout: 10000 // SECURITY: 10s global timeout prevents hanging requests
    },
    mutations: {
      retry: 0, // PHASE 6: No auto-retry on mutations
      retryDelay: 1000,
      useErrorBoundary: false,
      timeout: 15000 // SECURITY: 15s timeout for mutations
    }
  }
});

// PHASE 2: Global error suppression REMOVED
// Error handling now delegated to ErrorBoundaries and centralized error handler
// Framework-level DOM errors are handled in GlobalErrorBoundary only

const Home = lazy(() => import('./Home'));
const Dashboard = lazy(() => import('./Dashboard'));
const WelcomeOnboarding = lazy(() => import('./WelcomeOnboarding'));
const QuickStartWizard = lazy(() => import('./QuickStartWizard'));
const CaseDetail = lazy(() => import('./CaseDetail'));
const EvidenceDetail = lazy(() => import('./EvidenceDetail'));
const Credentials = lazy(() => import('./Credentials'));
const Cases = lazy(() => import('./Cases'));
const Evidence = lazy(() => import('./Evidence'));
const Devices = lazy(() => import('./Devices'));
const NetworkMonitor = lazy(() => import('./NetworkMonitor'));
const Reports = lazy(() => import('./Reports'));
const Tools = lazy(() => import('./Tools'));
const Profile = lazy(() => import('./Profile'));
const IOSDiagnostics = lazy(() => import('./IOSDiagnostics'));
const SecurityAgent = lazy(() => import('./SecurityAgent'));
const BLEMonitor = lazy(() => import('./BLEMonitor'));
const NetworkSecurity = lazy(() => import('./NetworkSecurity'));
const Pricing = lazy(() => import('./Pricing'));
const Subscription = lazy(() => import('./Subscription'));
const PaymentSuccess = lazy(() => import('./PaymentSuccess'));
const PaymentCancelled = lazy(() => import('./PaymentCancelled'));
const AssetInventory = lazy(() => import('./AssetInventory'));
const AuditTrail = lazy(() => import('./AuditTrail'));
const ComplianceReporting = lazy(() => import('./ComplianceReporting'));
const ComplianceDashboard = lazy(() => import('./ComplianceDashboard'));
const ForensicAutomation = lazy(() => import('./ForensicAutomation'));
const ProcurementAutomation = lazy(() => import('./ProcurementAutomation'));
const SecurityOrchestration = lazy(() => import('./SecurityOrchestration'));
const RoleManagement = lazy(() => import('./RoleManagement'));
const ForensicsPlayback = lazy(() => import('./ForensicsPlayback'));
const Referrals = lazy(() => import('./Referrals'));
const PayoutLedger = lazy(() => import('./PayoutLedger'));
const OnboardingWalkthrough = lazy(() => import('../components/onboarding/OnboardingWalkthrough'));
const HoneypotDashboard = lazy(() => import('./HoneypotDashboard'));
const SentinelScanner = lazy(() => import('./SentinelScanner'));
const ActiveDefense = lazy(() => import('./ActiveDefense'));
const OperationalSecurity = lazy(() => import('./OperationalSecurity'));
const CorrelationEngine = lazy(() => import('./CorrelationEngine'));
const AdvancedSecurity = lazy(() => import('./AdvancedSecurity'));
const SocialMediaSecurity = lazy(() => import('./SocialMediaSecurity'));
const SidebarSettings = lazy(() => import('./SidebarSettings'));
const PegasusDefense = lazy(() => import('./PegasusDefense'));
const AdvancedMalwareDefense = lazy(() => import('./AdvancedMalwareDefense'));
const CovertOperations = lazy(() => import('./CovertOperations'));
const AutonomousSecurity = lazy(() => import('./AutonomousSecurity'));
const UserBehaviorAnalytics = lazy(() => import('./UserBehaviorAnalytics'));
const MalwareDefense = lazy(() => import('./MalwareDefense'));
const SecurityValidator = lazy(() => import('./SecurityValidator'));
const Sessions = lazy(() => import('./Sessions'));
const SessionDetail = lazy(() => import('./SessionDetail'));
const NewScanSession = lazy(() => import('./NewScanSession'));
const Watchlist = lazy(() => import('./Watchlist'));
const Onboarding = lazy(() => import('./Onboarding'));
const AnalyticsDashboard = lazy(() => import('./AnalyticsDashboard'));
const IntegrationsDashboard = lazy(() => import('./IntegrationsDashboard'));
const AgentDocumentation = lazy(() => import('./AgentDocumentation'));
const AuditLog = lazy(() => import('./AuditLog'));
const SubscriptionSuccess = lazy(() => import('./SubscriptionSuccess'));
const AdminProviders = lazy(() => import('./AdminProviders'));
const RecycleBin = lazy(() => import('./RecycleBin'));
const AgentTokenManagement = lazy(() => import('./AgentTokenManagement'));
const SystemHealthDashboard = lazy(() => import('./SystemHealthDashboard'));
const AutomationDashboard = lazy(() => import('./AutomationDashboard'));
const MFAManagement = lazy(() => import('./MFAManagement'));
const SecurityAudit = lazy(() => import('./SecurityAudit'));
const Downloads = lazy(() => import('./Downloads'));
const Documentation = lazy(() => import('./Documentation'));
const APIStatus = lazy(() => import('./APIStatus'));
const IntegrationsStatus = lazy(() => import('./IntegrationsStatus'));
const SessionManagement = lazy(() => import('./SessionManagement'));
const SecuritySettings = lazy(() => import('./SecuritySettings'));
const EvidenceLocker = lazy(() => import('./EvidenceLocker'));
const SecurityDashboard = lazy(() => import('./SecurityDashboard'));
const IntegrationsHealth = lazy(() => import('./IntegrationsHealth'));
const OnboardingChecklist = lazy(() => import('./OnboardingChecklist'));
const NetworkUploader = lazy(() => import('./NetworkUploader'));
const DeviceCompliance = lazy(() => import('./DeviceCompliance'));
const DeviceDetail = lazy(() => import('./DeviceDetail'));
const DeviceActionsHistory = lazy(() => import('./DeviceActionsHistory'));
const DeviceInventory = lazy(() => import('./DeviceInventory'));
const GeoTimeline = lazy(() => import('./GeoTimeline'));
const IncidentTickets = lazy(() => import('./IncidentTickets'));
const PIIRedactor = lazy(() => import('./PIIRedactor'));
const AnomalyHeatmap = lazy(() => import('./AnomalyHeatmap'));
const OfflineBundle = lazy(() => import('./OfflineBundle'));
const EncryptedNotes = lazy(() => import('./EncryptedNotes'));
const EvidencePinning = lazy(() => import('./EvidencePinning'));
const ReportBuilder = lazy(() => import('./ReportBuilder'));
const AutoCorrelation = lazy(() => import('./AutoCorrelation'));
const ExhibitGenerator = lazy(() => import('./ExhibitGenerator'));
const AffidavitComposer = lazy(() => import('./AffidavitComposer'));
const FieldIntake = lazy(() => import('./FieldIntake'));
const GuardianReview = lazy(() => import('./GuardianReview'));
const ChainOfCustody = lazy(() => import('./ChainOfCustody'));
const ThreatResolution = lazy(() => import('./ThreatResolution'));
const MobileEnrollment = lazy(() => import('./MobileEnrollment'));
const MDMRemoval = lazy(() => import('./MDMRemoval'));
const Analytics = lazy(() => import('./Analytics'));
const ContrastAudit = lazy(() => import('./ContrastAudit'));
const OverlapAudit = lazy(() => import('./OverlapAudit'));
const TagManagement = lazy(() => import('./TagManagement'));
const ReviewerInbox = lazy(() => import('./ReviewerInbox'));
const ExpertNetwork = lazy(() => import('./ExpertNetwork'));
const SecurityPostureMonitor = lazy(() => import('./SecurityPostureMonitor'));
const AIAnalytics = lazy(() => import('./AIAnalytics'));
const EnrichmentDashboard = lazy(() => import('./EnrichmentDashboard'));
const PolicyCenter = lazy(() => import('./PolicyCenter'));
const EmailIntel = lazy(() => import('./EmailIntel'));
const CompositeRisk = lazy(() => import('./CompositeRisk'));
const IntelExplorer = lazy(() => import('./IntelExplorer'));
const BatchEnrichment = lazy(() => import('./BatchEnrichment'));
const DeviceIntel = lazy(() => import('./DeviceIntel'));
const ApiKeyManagement = lazy(() => import('./ApiKeyManagement'));
const ScheduledWeeklyAudit = lazy(() => import('./ScheduledWeeklyAudit'));
const FeedManagement = lazy(() => import('./FeedManagement'));
const ThreatActorManagement = lazy(() => import('./ThreatActorManagement'));
const NavigationHealthCheck = lazy(() => import('./NavigationHealthCheck'));
const NavigationAnalyticsDashboard = lazy(() => import('./NavigationAnalyticsDashboard'));
const AdminSettings = lazy(() => import('./AdminSettings'));
const ComplianceAudit = lazy(() => import('./ComplianceAudit'));
const AgentsDashboard = lazy(() => import('./AgentsDashboard'));
const SystemAuditReport = lazy(() => import('./SystemAuditReport'));
const AdminConfigurationChecklist = lazy(() => import('./AdminConfigurationChecklist'));
const PenTestManagement = lazy(() => import('./PenTestManagement'));
const AutomationCycleDashboard = lazy(() => import('./AutomationCycleDashboard'));
const ForensicWorkflows = lazy(() => import('./ForensicWorkflows'));
const ThreatIntelAggregator = lazy(() => import('./ThreatIntelAggregator'));
const ThreatActorProfiling = lazy(() => import('./ThreatActorProfiling'));
const ThreatHuntingPlaybooks = lazy(() => import('./ThreatHuntingPlaybooks'));
const IncidentResponse = lazy(() => import('./IncidentResponse'));
const EndpointAgents = lazy(() => import('./EndpointAgents'));
const MobileDeviceManagement = lazy(() => import('./MobileDeviceManagement'));
const ThreatIntelDashboard = lazy(() => import('./ThreatIntelDashboard'));
const VPNRotator = lazy(() => import('./VPNRotator'));
const RemediationSuite = lazy(() => import('./RemediationSuite'));
const AgentDevelopmentGuide = lazy(() => import('./AgentDevelopmentGuide'));
const SIEMAnalytics = lazy(() => import('./SIEMAnalytics'));
const AiThreatHunting = lazy(() => import('./AiThreatHunting'));
const APTDefenseCenter = lazy(() => import('./APTDefenseCenter'));
const VulnerabilityManagement = lazy(() => import('./VulnerabilityManagement'));
const NotificationSettings = lazy(() => import('./NotificationSettings'));
const EvidenceVault = lazy(() => import('./EvidenceVault'));
const AgentDeployment = lazy(() => import('./AgentDeployment'));
const PlaybookManager = lazy(() => import('./PlaybookManager'));
const SecurityPolicyManagement = lazy(() => import('./SecurityPolicyManagement'));
const EndpointSecurityCenter = lazy(() => import('./EndpointSecurityCenter'));
const ForensicModule = lazy(() => import('./ForensicModule'));
const DeviceManagement = lazy(() => import('./DeviceManagement'));
const PolicyManagement = lazy(() => import('./PolicyManagement'));
const ControlPlaneDefense = lazy(() => import('./ControlPlaneDefense'));
const ControlPlaneSession = lazy(() => import('./ControlPlaneSession'));
const PolicyList = lazy(() => import('./PolicyList'));
const PolicyEditor = lazy(() => import('./PolicyEditor'));
const PolicyAssignmentsPage = lazy(() => import('./PolicyAssignmentsPage'));
const DeviceEffectivePolicy = lazy(() => import('./DeviceEffectivePolicy'));
const PolicyComplianceDashboard = lazy(() => import('./PolicyComplianceDashboard'));
const PolicyActionsQueue = lazy(() => import('./PolicyActionsQueue'));

// Wrapper to handle transitions
function TransitionWrapper({ children }) {
  return <>{children}</>;
}

export default function App() {
  // PHASE 5: Start memory monitoring
  useEffect(() => {
    memoryManager.startMonitoring();
    return () => memoryManager.stopMonitoring();
  }, []);

  // PHASE 6: Defer performance monitoring
  useEffect(() => {
    const timer = setTimeout(() => {
      performanceMonitor.reportWebVitals();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // SECURITY: Run device integrity checks on app activation
  useEffect(() => {
    const runSecurityChecks = async () => {
      try {
        // Setup DI container
        setupContainer();
        
        // Run device integrity checks
        const results = await deviceIntegrityChecker.runIntegrityChecks();
        
        // Store results for alert component
        localStorage.setItem('device_integrity_results', JSON.stringify(results));
        
        if (results.alerts.length > 0) {
          console.warn('🚨 Security alerts detected:', results.alerts);
        } else {
          console.log('✅ Device integrity checks passed');
        }
      } catch (error) {
        console.error('Device integrity checks failed:', error);
      }
    };

    runSecurityChecks();
  }, []);

  // PHASE 2: Navigation validation in dev mode
  useEffect(() => {
    initNavigationValidator();
  }, []);

  // PHASE 4: Intelligent route preloading
  useNavigationPreloader();
  useIdlePreloader(['Dashboard', 'Cases', 'Evidence', 'DeviceInventory', 'Reports']);

  // PHASE 5: Navigation recovery and resilience
  useNavigationRecovery();
  useNavigationTimeout(10000);
  useNetworkRecovery();

  return (
    <StartupErrorBoundary>
      <GlobalErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <EnhancedRBACProvider>
            <BackgroundProcessProvider>
              <DataPreloader />
              <OfflineIndicator />
              <BackgroundProcessIndicator />
              <CodeSplitBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                    <Route path="/" element={<Layout />}>
                      <Route index element={
                        <RouteErrorBoundary route="Home">
                          <Home />
                        </RouteErrorBoundary>
                      } />
                      <Route path="App" element={
                        <RouteErrorBoundary route="Home">
                          <Home />
                        </RouteErrorBoundary>
                      } />
                      <Route path="Dashboard" element={
                        <RouteErrorBoundary route="Dashboard">
                          <Dashboard />
                        </RouteErrorBoundary>
                      } />
                      <Route path="Credentials" element={
                        <RouteErrorBoundary route="Credentials">
                          <Credentials />
                        </RouteErrorBoundary>
                      } />
                      <Route path="Cases" element={
                        <RouteErrorBoundary route="Cases">
                          <Cases />
                        </RouteErrorBoundary>
                      } />
                      <Route path="CaseDetail/:id" element={
                        <RouteErrorBoundary route="CaseDetail">
                          <CaseDetail />
                        </RouteErrorBoundary>
                      } />
                      <Route path="Evidence" element={
                        <RouteErrorBoundary route="Evidence">
                          <Evidence />
                        </RouteErrorBoundary>
                      } />
                      <Route path="EvidenceDetail/:id" element={
                        <RouteErrorBoundary route="EvidenceDetail">
                          <EvidenceDetail />
                        </RouteErrorBoundary>
                      } />
                      <Route path="Devices" element={<RouteErrorBoundary route="Devices"><Devices /></RouteErrorBoundary>} />
                      <Route path="NetworkMonitor" element={<RouteErrorBoundary route="NetworkMonitor"><NetworkMonitor /></RouteErrorBoundary>} />
                      <Route path="Reports" element={<RouteErrorBoundary route="Reports"><Reports /></RouteErrorBoundary>} />
                      <Route path="Tools" element={<RouteErrorBoundary route="Tools"><Tools /></RouteErrorBoundary>} />
                      <Route path="Profile" element={<RouteErrorBoundary route="Profile"><Profile /></RouteErrorBoundary>} />
                      <Route path="IOSDiagnostics" element={<RouteErrorBoundary route="IOSDiagnostics"><IOSDiagnostics /></RouteErrorBoundary>} />
                      <Route path="SecurityAgent" element={<RouteErrorBoundary route="SecurityAgent"><SecurityAgent /></RouteErrorBoundary>} />
                      <Route path="BLEMonitor" element={<RouteErrorBoundary route="BLEMonitor"><BLEMonitor /></RouteErrorBoundary>} />
                      <Route path="NetworkSecurity" element={<RouteErrorBoundary route="NetworkSecurity"><NetworkSecurity /></RouteErrorBoundary>} />
                      <Route path="Pricing" element={<RouteErrorBoundary route="Pricing"><Pricing /></RouteErrorBoundary>} />
                      <Route path="Subscription" element={<RouteErrorBoundary route="Subscription"><Subscription /></RouteErrorBoundary>} />
                      <Route path="payment-success" element={<RouteErrorBoundary route="PaymentSuccess"><PaymentSuccess /></RouteErrorBoundary>} />
                      <Route path="payment-cancelled" element={<RouteErrorBoundary route="PaymentCancelled"><PaymentCancelled /></RouteErrorBoundary>} />
                      <Route path="AssetInventory" element={<RouteErrorBoundary route="AssetInventory"><AssetInventory /></RouteErrorBoundary>} />
                      <Route path="AuditTrail" element={<RouteErrorBoundary route="AuditTrail"><AuditTrail /></RouteErrorBoundary>} />
                      <Route path="ComplianceReporting" element={<RouteErrorBoundary route="ComplianceReporting"><ComplianceReporting /></RouteErrorBoundary>} />
                      <Route path="ComplianceDashboard" element={<RouteErrorBoundary route="ComplianceDashboard"><ComplianceDashboard /></RouteErrorBoundary>} />
                      <Route path="ForensicAutomation" element={<RouteErrorBoundary route="ForensicAutomation"><ForensicAutomation /></RouteErrorBoundary>} />
                      <Route path="ProcurementAutomation" element={<RouteErrorBoundary route="ProcurementAutomation"><ProcurementAutomation /></RouteErrorBoundary>} />
                      <Route path="SecurityOrchestration" element={<RouteErrorBoundary route="SecurityOrchestration"><SecurityOrchestration /></RouteErrorBoundary>} />
                      <Route path="RoleManagement" element={<RouteErrorBoundary route="RoleManagement"><RoleManagement /></RouteErrorBoundary>} />
                      <Route path="ForensicsPlayback" element={<RouteErrorBoundary route="ForensicsPlayback"><ForensicsPlayback /></RouteErrorBoundary>} />
                      <Route path="Referrals" element={<RouteErrorBoundary route="Referrals"><Referrals /></RouteErrorBoundary>} />
                      <Route path="PayoutLedger" element={<RouteErrorBoundary route="PayoutLedger"><PayoutLedger /></RouteErrorBoundary>} />
                      <Route path="HoneypotDashboard" element={<RouteErrorBoundary route="HoneypotDashboard"><HoneypotDashboard /></RouteErrorBoundary>} />
                      <Route path="SentinelScanner" element={<RouteErrorBoundary route="SentinelScanner"><SentinelScanner /></RouteErrorBoundary>} />
                      <Route path="ActiveDefense" element={<RouteErrorBoundary route="ActiveDefense"><ActiveDefense /></RouteErrorBoundary>} />
                      <Route path="OperationalSecurity" element={<RouteErrorBoundary route="OperationalSecurity"><OperationalSecurity /></RouteErrorBoundary>} />
                      <Route path="CorrelationEngine" element={<RouteErrorBoundary route="CorrelationEngine"><CorrelationEngine /></RouteErrorBoundary>} />
                      <Route path="AdvancedSecurity" element={<RouteErrorBoundary route="AdvancedSecurity"><AdvancedSecurity /></RouteErrorBoundary>} />
                      <Route path="SocialMediaSecurity" element={<RouteErrorBoundary route="SocialMediaSecurity"><SocialMediaSecurity /></RouteErrorBoundary>} />
                      <Route path="SidebarSettings" element={<RouteErrorBoundary route="SidebarSettings"><SidebarSettings /></RouteErrorBoundary>} />
                      <Route path="PegasusDefense" element={<RouteErrorBoundary route="PegasusDefense"><PegasusDefense /></RouteErrorBoundary>} />
                      <Route path="AdvancedMalwareDefense" element={<RouteErrorBoundary route="AdvancedMalwareDefense"><AdvancedMalwareDefense /></RouteErrorBoundary>} />
                      <Route path="CovertOperations" element={<RouteErrorBoundary route="CovertOperations"><CovertOperations /></RouteErrorBoundary>} />
                      <Route path="AutonomousSecurity" element={<RouteErrorBoundary route="AutonomousSecurity"><AutonomousSecurity /></RouteErrorBoundary>} />
                      <Route path="UserBehaviorAnalytics" element={<RouteErrorBoundary route="UserBehaviorAnalytics"><UserBehaviorAnalytics /></RouteErrorBoundary>} />
                      <Route path="MalwareDefense" element={<RouteErrorBoundary route="MalwareDefense"><MalwareDefense /></RouteErrorBoundary>} />
                      <Route path="SecurityValidator" element={<RouteErrorBoundary route="SecurityValidator"><SecurityValidator /></RouteErrorBoundary>} />

                      <Route path="Sessions" element={<RouteErrorBoundary route="Sessions"><Sessions /></RouteErrorBoundary>} />
                      <Route path="SessionDetail/:id" element={<RouteErrorBoundary route="SessionDetail"><SessionDetail /></RouteErrorBoundary>} />
                      <Route path="NewScanSession" element={<RouteErrorBoundary route="NewScanSession"><NewScanSession /></RouteErrorBoundary>} />
                      <Route path="Watchlist" element={<RouteErrorBoundary route="Watchlist"><Watchlist /></RouteErrorBoundary>} />
                      <Route path="Onboarding" element={<RouteErrorBoundary route="Onboarding"><Onboarding /></RouteErrorBoundary>} />
                      <Route path="AnalyticsDashboard" element={<RouteErrorBoundary route="AnalyticsDashboard"><AnalyticsDashboard /></RouteErrorBoundary>} />
                      <Route path="IntegrationsDashboard" element={<RouteErrorBoundary route="IntegrationsDashboard"><IntegrationsDashboard /></RouteErrorBoundary>} />
                      <Route path="AgentDocumentation" element={<RouteErrorBoundary route="AgentDocumentation"><AgentDocumentation /></RouteErrorBoundary>} />
                      <Route path="AuditLog" element={<RouteErrorBoundary route="AuditLog"><AuditLog /></RouteErrorBoundary>} />
                      <Route path="SubscriptionSuccess" element={<RouteErrorBoundary route="SubscriptionSuccess"><SubscriptionSuccess /></RouteErrorBoundary>} />
                      <Route path="AdminProviders" element={<RouteErrorBoundary route="AdminProviders"><AdminProviders /></RouteErrorBoundary>} />
                      <Route path="RecycleBin" element={<RouteErrorBoundary route="RecycleBin"><RecycleBin /></RouteErrorBoundary>} />
                      <Route path="AgentTokenManagement" element={<RouteErrorBoundary route="AgentTokenManagement"><AgentTokenManagement /></RouteErrorBoundary>} />
                      <Route path="SystemHealthDashboard" element={<RouteErrorBoundary route="SystemHealthDashboard"><SystemHealthDashboard /></RouteErrorBoundary>} />
                      <Route path="AutomationDashboard" element={<RouteErrorBoundary route="AutomationDashboard"><AutomationDashboard /></RouteErrorBoundary>} />
                      <Route path="MFAManagement" element={<RouteErrorBoundary route="MFAManagement"><MFAManagement /></RouteErrorBoundary>} />
                      <Route path="SecurityAudit" element={<RouteErrorBoundary route="SecurityAudit"><SecurityAudit /></RouteErrorBoundary>} />
                      <Route path="Downloads" element={<RouteErrorBoundary route="Downloads"><Downloads /></RouteErrorBoundary>} />
                      <Route path="Documentation" element={<RouteErrorBoundary route="Documentation"><Documentation /></RouteErrorBoundary>} />
                      <Route path="APIStatus" element={<RouteErrorBoundary route="APIStatus"><APIStatus /></RouteErrorBoundary>} />
                      <Route path="IntegrationsStatus" element={<RouteErrorBoundary route="IntegrationsStatus"><IntegrationsStatus /></RouteErrorBoundary>} />
                      <Route path="SessionManagement" element={<RouteErrorBoundary route="SessionManagement"><SessionManagement /></RouteErrorBoundary>} />
                      <Route path="SecuritySettings" element={<RouteErrorBoundary route="SecuritySettings"><SecuritySettings /></RouteErrorBoundary>} />
                      <Route path="EvidenceLocker" element={<RouteErrorBoundary route="EvidenceLocker"><EvidenceLocker /></RouteErrorBoundary>} />
                      <Route path="SecurityDashboard" element={<RouteErrorBoundary route="SecurityDashboard"><SecurityDashboard /></RouteErrorBoundary>} />
                      <Route path="IntegrationsHealth" element={<RouteErrorBoundary route="IntegrationsHealth"><IntegrationsHealth /></RouteErrorBoundary>} />
                      <Route path="OnboardingChecklist" element={<RouteErrorBoundary route="OnboardingChecklist"><OnboardingChecklist /></RouteErrorBoundary>} />
                      <Route path="NetworkUploader" element={<RouteErrorBoundary route="NetworkUploader"><NetworkUploader /></RouteErrorBoundary>} />
                      <Route path="DeviceInventory" element={<RouteErrorBoundary route="DeviceInventory"><DeviceInventory /></RouteErrorBoundary>} />
                      <Route path="PolicyManagement" element={<RouteErrorBoundary route="PolicyManagement"><PolicyManagement /></RouteErrorBoundary>} />
                      <Route path="ControlPlaneDefense" element={<RouteErrorBoundary route="ControlPlaneDefense"><ControlPlaneDefense /></RouteErrorBoundary>} />
                      <Route path="ControlPlaneSession/:sessionId" element={<RouteErrorBoundary route="ControlPlaneSession"><ControlPlaneSession /></RouteErrorBoundary>} />
                      <Route path="PolicyList" element={<RouteErrorBoundary route="PolicyList"><PolicyList /></RouteErrorBoundary>} />
                      <Route path="PolicyEditor/:policyId" element={<RouteErrorBoundary route="PolicyEditor"><PolicyEditor /></RouteErrorBoundary>} />
                      <Route path="PolicyAssignments" element={<RouteErrorBoundary route="PolicyAssignments"><PolicyAssignmentsPage /></RouteErrorBoundary>} />
                      <Route path="DeviceEffectivePolicy/:deviceId" element={<RouteErrorBoundary route="DeviceEffectivePolicy"><DeviceEffectivePolicy /></RouteErrorBoundary>} />
                      <Route path="PolicyComplianceDashboard" element={<RouteErrorBoundary route="PolicyComplianceDashboard"><PolicyComplianceDashboard /></RouteErrorBoundary>} />
                      <Route path="PolicyActionsQueue" element={<RouteErrorBoundary route="PolicyActionsQueue"><PolicyActionsQueue /></RouteErrorBoundary>} />
                      <Route path="GeoTimeline" element={<RouteErrorBoundary route="GeoTimeline"><GeoTimeline /></RouteErrorBoundary>} />
                      <Route path="IncidentTickets" element={<RouteErrorBoundary route="IncidentTickets"><IncidentTickets /></RouteErrorBoundary>} />
                      <Route path="PIIRedactor" element={<RouteErrorBoundary route="PIIRedactor"><PIIRedactor /></RouteErrorBoundary>} />
                      <Route path="AnomalyHeatmap" element={<RouteErrorBoundary route="AnomalyHeatmap"><AnomalyHeatmap /></RouteErrorBoundary>} />
                      <Route path="OfflineBundle" element={<RouteErrorBoundary route="OfflineBundle"><OfflineBundle /></RouteErrorBoundary>} />
                      <Route path="EncryptedNotes" element={<RouteErrorBoundary route="EncryptedNotes"><EncryptedNotes /></RouteErrorBoundary>} />
                      <Route path="EvidencePinning" element={<RouteErrorBoundary route="EvidencePinning"><EvidencePinning /></RouteErrorBoundary>} />
                      <Route path="ReportBuilder" element={<RouteErrorBoundary route="ReportBuilder"><ReportBuilder /></RouteErrorBoundary>} />
                      <Route path="AutoCorrelation" element={<RouteErrorBoundary route="AutoCorrelation"><AutoCorrelation /></RouteErrorBoundary>} />
                      <Route path="ExhibitGenerator" element={<RouteErrorBoundary route="ExhibitGenerator"><ExhibitGenerator /></RouteErrorBoundary>} />
                      <Route path="AffidavitComposer" element={<RouteErrorBoundary route="AffidavitComposer"><AffidavitComposer /></RouteErrorBoundary>} />
                      <Route path="FieldIntake" element={<RouteErrorBoundary route="FieldIntake"><FieldIntake /></RouteErrorBoundary>} />
                      <Route path="GuardianReview" element={<RouteErrorBoundary route="GuardianReview"><GuardianReview /></RouteErrorBoundary>} />
                      <Route path="ChainOfCustody" element={<RouteErrorBoundary route="ChainOfCustody"><ChainOfCustody /></RouteErrorBoundary>} />
                      <Route path="ThreatResolution" element={<RouteErrorBoundary route="ThreatResolution"><ThreatResolution /></RouteErrorBoundary>} />
                      <Route path="MobileEnrollment" element={<RouteErrorBoundary route="MobileEnrollment"><MobileEnrollment /></RouteErrorBoundary>} />
                      <Route path="MDMRemoval" element={<RouteErrorBoundary route="MDMRemoval"><MDMRemoval /></RouteErrorBoundary>} />
                      <Route path="AdminSettings" element={<RouteErrorBoundary route="AdminSettings"><AdminSettings /></RouteErrorBoundary>} />
                      <Route path="Analytics" element={<RouteErrorBoundary route="Analytics"><Analytics /></RouteErrorBoundary>} />
                      <Route path="ComplianceAudit" element={<RouteErrorBoundary route="ComplianceAudit"><ComplianceAudit /></RouteErrorBoundary>} />
                      <Route path="AgentsDashboard" element={<RouteErrorBoundary route="AgentsDashboard"><AgentsDashboard /></RouteErrorBoundary>} />
                      <Route path="SystemAuditReport" element={<RouteErrorBoundary route="SystemAuditReport"><SystemAuditReport /></RouteErrorBoundary>} />
                      <Route path="AdminConfigurationChecklist" element={<RouteErrorBoundary route="AdminConfigurationChecklist"><AdminConfigurationChecklist /></RouteErrorBoundary>} />
                      <Route path="PenTestManagement" element={<RouteErrorBoundary route="PenTestManagement"><PenTestManagement /></RouteErrorBoundary>} />
                      <Route path="AutomationCycleDashboard" element={<RouteErrorBoundary route="AutomationCycleDashboard"><AutomationCycleDashboard /></RouteErrorBoundary>} />
                      <Route path="ForensicWorkflows" element={<RouteErrorBoundary route="ForensicWorkflows"><ForensicWorkflows /></RouteErrorBoundary>} />
                      <Route path="ThreatIntelAggregator" element={<RouteErrorBoundary route="ThreatIntelAggregator"><ThreatIntelAggregator /></RouteErrorBoundary>} />
                      <Route path="ThreatActorProfiling" element={<RouteErrorBoundary route="ThreatActorProfiling"><ThreatActorProfiling /></RouteErrorBoundary>} />
                      <Route path="ThreatHuntingPlaybooks" element={<RouteErrorBoundary route="ThreatHuntingPlaybooks"><ThreatHuntingPlaybooks /></RouteErrorBoundary>} />
                      <Route path="IncidentResponse" element={<RouteErrorBoundary route="IncidentResponse"><IncidentResponse /></RouteErrorBoundary>} />
                      <Route path="EndpointAgents" element={<RouteErrorBoundary route="EndpointAgents"><EndpointAgents /></RouteErrorBoundary>} />
                      <Route path="MobileDeviceManagement" element={<RouteErrorBoundary route="MobileDeviceManagement"><MobileDeviceManagement /></RouteErrorBoundary>} />
                      <Route path="ThreatIntelDashboard" element={<RouteErrorBoundary route="ThreatIntelDashboard"><ThreatIntelDashboard /></RouteErrorBoundary>} />
                      <Route path="VPNRotator" element={<RouteErrorBoundary route="VPNRotator"><VPNRotator /></RouteErrorBoundary>} />
                      <Route path="RemediationSuite" element={<RouteErrorBoundary route="RemediationSuite"><RemediationSuite /></RouteErrorBoundary>} />
                      <Route path="AgentDevelopmentGuide" element={<RouteErrorBoundary route="AgentDevelopmentGuide"><AgentDevelopmentGuide /></RouteErrorBoundary>} />
                      <Route path="SIEMAnalytics" element={<RouteErrorBoundary route="SIEMAnalytics"><SIEMAnalytics /></RouteErrorBoundary>} />
                      <Route path="APTDefenseCenter" element={<RouteErrorBoundary route="APTDefenseCenter"><APTDefenseCenter /></RouteErrorBoundary>} />
                      <Route path="VulnerabilityManagement" element={<RouteErrorBoundary route="VulnerabilityManagement"><VulnerabilityManagement /></RouteErrorBoundary>} />
                      <Route path="AiThreatHunting" element={<RouteErrorBoundary route="AiThreatHunting"><AiThreatHunting /></RouteErrorBoundary>} />
                      <Route path="NotificationSettings" element={<RouteErrorBoundary route="NotificationSettings"><NotificationSettings /></RouteErrorBoundary>} />
                      <Route path="EvidenceVault" element={<RouteErrorBoundary route="EvidenceVault"><EvidenceVault /></RouteErrorBoundary>} />
                      <Route path="AgentDeployment" element={<RouteErrorBoundary route="AgentDeployment"><AgentDeployment /></RouteErrorBoundary>} />
                      <Route path="PlaybookManager" element={<RouteErrorBoundary route="PlaybookManager"><PlaybookManager /></RouteErrorBoundary>} />
                      <Route path="SecurityPolicyManagement" element={<RouteErrorBoundary route="SecurityPolicyManagement"><SecurityPolicyManagement /></RouteErrorBoundary>} />
                      <Route path="EndpointSecurityCenter" element={<RouteErrorBoundary route="EndpointSecurityCenter"><EndpointSecurityCenter /></RouteErrorBoundary>} />
                      <Route path="ForensicModule" element={<RouteErrorBoundary route="ForensicModule"><ForensicModule /></RouteErrorBoundary>} />
                      <Route path="DeviceManagement" element={<RouteErrorBoundary route="DeviceManagement"><DeviceManagement /></RouteErrorBoundary>} />
                      <Route path="ContrastAudit" element={
                        <RouteErrorBoundary route="ContrastAudit">
                          <ContrastAudit />
                        </RouteErrorBoundary>
                      } />
                      <Route path="OverlapAudit" element={
                        <RouteErrorBoundary route="OverlapAudit">
                          <OverlapAudit />
                        </RouteErrorBoundary>
                      } />
                      <Route path="TagManagement" element={
                        <RouteErrorBoundary route="TagManagement">
                          <TagManagement />
                        </RouteErrorBoundary>
                      } />
                      <Route path="ReviewerInbox" element={
                        <RouteErrorBoundary route="ReviewerInbox">
                          <ReviewerInbox />
                        </RouteErrorBoundary>
                      } />
                      <Route path="DeviceCompliance" element={
                        <RouteErrorBoundary route="DeviceCompliance">
                          <DeviceCompliance />
                        </RouteErrorBoundary>
                      } />
                      <Route path="DeviceDetail/:id" element={
                        <RouteErrorBoundary route="DeviceDetail">
                          <DeviceDetail />
                        </RouteErrorBoundary>
                      } />
                      <Route path="DeviceActionsHistory" element={
                        <RouteErrorBoundary route="DeviceActionsHistory">
                          <DeviceActionsHistory />
                        </RouteErrorBoundary>
                      } />
                      <Route path="ExpertNetwork" element={
                        <RouteErrorBoundary route="ExpertNetwork">
                          <ExpertNetwork />
                        </RouteErrorBoundary>
                      } />
                      <Route path="SecurityPostureMonitor" element={
                        <RouteErrorBoundary route="SecurityPostureMonitor">
                          <SecurityPostureMonitor />
                        </RouteErrorBoundary>
                      } />
                      <Route path="CaseDetail/:id/AIAnalytics" element={
                        <RouteErrorBoundary route="AIAnalytics">
                          <AIAnalytics />
                        </RouteErrorBoundary>
                      } />
                      <Route path="CaseDetail/:id/Enrichment" element={
                        <RouteErrorBoundary route="EnrichmentDashboard">
                          <EnrichmentDashboard />
                        </RouteErrorBoundary>
                      } />
                      <Route path="CaseDetail/:id/PolicyCenter" element={
                        <RouteErrorBoundary route="PolicyCenter">
                          <PolicyCenter />
                        </RouteErrorBoundary>
                      } />
                      <Route path="CaseDetail/:id/EmailIntel" element={
                        <RouteErrorBoundary route="EmailIntel">
                          <EmailIntel />
                        </RouteErrorBoundary>
                      } />
                      <Route path="CaseDetail/:id/CompositeRisk" element={
                        <RouteErrorBoundary route="CompositeRisk">
                          <CompositeRisk />
                        </RouteErrorBoundary>
                      } />
                      <Route path="IntelExplorer" element={
                        <RouteErrorBoundary route="IntelExplorer">
                          <IntelExplorer />
                        </RouteErrorBoundary>
                      } />
                      <Route path="CaseDetail/:id/BatchEnrichment" element={
                        <RouteErrorBoundary route="BatchEnrichment">
                          <BatchEnrichment />
                        </RouteErrorBoundary>
                      } />
                      <Route path="CaseDetail/:id/DeviceIntel" element={
                        <RouteErrorBoundary route="DeviceIntel">
                          <DeviceIntel />
                        </RouteErrorBoundary>
                      } />

                      <Route path="SystemHealthDashboard" element={
                        <RouteErrorBoundary route="SystemHealthDashboard">
                          <SystemHealthDashboard />
                        </RouteErrorBoundary>
                      } />
                      <Route path="ApiKeyManagement" element={
                        <RouteErrorBoundary route="ApiKeyManagement">
                          <ApiKeyManagement />
                        </RouteErrorBoundary>
                      } />
                      <Route path="ScheduledWeeklyAudit" element={
                        <RouteErrorBoundary route="ScheduledWeeklyAudit">
                          <ScheduledWeeklyAudit />
                        </RouteErrorBoundary>
                      } />
                      <Route path="FeedManagement" element={
                        <RouteErrorBoundary route="FeedManagement">
                          <FeedManagement />
                        </RouteErrorBoundary>
                      } />
                      <Route path="ThreatActorManagement" element={
                       <RouteErrorBoundary route="ThreatActorManagement">
                         <ThreatActorManagement />
                       </RouteErrorBoundary>
                      } />
                      <Route path="NavigationHealthCheck" element={
                        <RouteErrorBoundary route="NavigationHealthCheck">
                          <NavigationHealthCheck />
                        </RouteErrorBoundary>
                      } />
                      <Route path="NavigationAnalyticsDashboard" element={
                        <RouteErrorBoundary route="NavigationAnalyticsDashboard">
                          <NavigationAnalyticsDashboard />
                        </RouteErrorBoundary>
                      } />

                      {/* Wildcard catch-all - must be last */}
                      <Route path="*" element={
                        <RouteErrorBoundary route="NotFound">
                          <Home />
                        </RouteErrorBoundary>
                      } />
                    </Route>
                    {/* Onboarding routes (outside Layout) */}
                    <Route path="WelcomeOnboarding" element={<WelcomeOnboarding />} />
                    <Route path="QuickStartWizard" element={<QuickStartWizard />} />
                </Routes>
              </Suspense>
            </CodeSplitBoundary>

            <NavigationPanicButton />
            <Toaster position="top-center" duration={2000} />
            </BackgroundProcessProvider>
            </EnhancedRBACProvider>
            </QueryClientProvider>
      </GlobalErrorBoundary>
    </StartupErrorBoundary>
  );
}