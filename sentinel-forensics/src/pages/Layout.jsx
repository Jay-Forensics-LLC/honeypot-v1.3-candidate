import React, { useState, useEffect } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "../components/utils";
import { useUser } from "../components/hooks/useUser";
import { getIcon, filterNavigationByVisibility } from "../components/config/navigationConfig";
import { useExpertMode } from "../components/hooks/useExpertMode";
import { logNavigationSuccess, logNavigationFailure, logSidebarToggle } from "../components/navigation/NavigationTelemetry";
import { saveNavigationState, saveNavigationBreadcrumb } from "../components/navigation/NavigationStateManager";
import { useKeyboardNavigation, SkipToMainLink, announceNavigation } from "../components/navigation/NavigationAccessibility";
import { useTouchOptimization, useIOSNavigationFixes, useSwipeGesture } from "../components/navigation/MobileNavigationOptimizer";
import NotificationCenter from "../components/collaboration/NotificationCenter";
import SmartBackButton from "../components/navigation/SmartBackButton";
import QuickNavigation from "../components/navigation/QuickNavigation";
import UnifiedSearch from "../components/search/UnifiedSearch";
import CaseSelectorHeader from "../components/navigation/CaseSelectorHeader";
import LegalBreadcrumbs from "../components/navigation/LegalBreadcrumbs";
import LanguageSelector from "../components/i18n/LanguageSelector";
import SupportChat from "../components/support/SupportChat";
import FeedbackWidget from "../components/beta/FeedbackWidget";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  Shield,
  Menu,
  X,
  ChevronRight,
  LogOut,
  HelpCircle,
  Play,
  Zap,
  BookOpen,
  Code,
  Home,
  Bell,
  Search,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  // CRITICAL: Initialize mobile state immediately to prevent flash
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const [expandedMenus, setExpandedMenus] = useState({});
  const [navSearchQuery, setNavSearchQuery] = useState('');
  const [showUnifiedSearch, setShowUnifiedSearch] = useState(false);
  const sidebarRef = React.useRef(null);

  // CRITICAL: Graceful user loading with fallback to prevent app lockout
  const { data: user, isLoading: userLoading, error: userError } = useUser();
  const { expertMode, toggleExpertMode, maxVisibility, isDeveloper, isReady } = useExpertMode();

  // PHASE 5: Navigation enhancements
  useKeyboardNavigation(sidebarRef, isMobile && sidebarOpen);
  useTouchOptimization();
  useIOSNavigationFixes();
  useSwipeGesture(
    () => isMobile && setSidebarOpen(true),
    () => isMobile && setSidebarOpen(false)
  );

  // Detect mobile with debouncing for smooth resize
  useEffect(() => {
    let resizeTimer;
    const checkMobile = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const mobile = window.innerWidth < 768;
        const wasNotMobile = !isMobile;
        setIsMobile(mobile);
        // Auto-close sidebar when switching to mobile
        if (mobile && wasNotMobile) {
          requestAnimationFrame(() => setSidebarOpen(false));
        }
      }, 100);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => {
      window.removeEventListener("resize", checkMobile);
      clearTimeout(resizeTimer);
    };
  }, [isMobile]);

  // Filter navigation by visibility - MUST BE BEFORE useEffect that uses it
  const navigation = filterNavigationByVisibility(maxVisibility);

  // CRITICAL: Keep sidebar open on desktop, closed on mobile
  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(true);
    }
    // Don't auto-close on mobile - let user control it
  }, [isMobile]);

  // Auto-expand categories on route match with smooth transition
  useEffect(() => {
    const currentPath = location.pathname.replace(/^\//, '');
    const newExpanded = { ...expandedMenus };
    let hasChanges = false;

    navigation.forEach(category => {
      const hasActiveItem = category.submenu?.some(item => 
        currentPath === item.page || currentPath.startsWith(item.page + '/')
      );
      if (hasActiveItem && !newExpanded[category.name]) {
        newExpanded[category.name] = true;
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setExpandedMenus(newExpanded);
    }
  }, [location.pathname, navigation]);

  // Fetch unread alerts
  const { data: alerts = [] } = useQuery({
    queryKey: ["unread-alerts", user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      try {
        return await base44.entities.Alert.filter(
          { status: "new", organization_id: user.organization_id },
          "-detection_timestamp",
          5
        );
      } catch {
        return [];
      }
    },
    enabled: !!user?.organization_id,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const isActivePage = (pageName) => {
    if (!pageName) return false;
    const currentPath = location.pathname.replace(/^\//, "");
    return currentPath === pageName || currentPath.startsWith(pageName + "/");
  };

  const toggleSidebar = () => {
    // Mobile only - desktop sidebar is always visible
    if (isMobile) {
      requestAnimationFrame(() => {
        setSidebarOpen((p) => {
          const newState = !p;
          logSidebarToggle(newState);
          return newState;
        });
      });
    }
  };

  // Listen for sidebar toggle events from other components
  useEffect(() => {
    const handleToggle = () => toggleSidebar();
    window.addEventListener('toggle-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-sidebar', handleToggle);
  }, []);

  const handleNavigation = (page) => {
    try {
      navigate(createPageUrl(page));
      logNavigationSuccess(page, 'sidebar');
      saveNavigationBreadcrumb(createPageUrl(page));
      announceNavigation(page); // PHASE 5: Screen reader
      if (isMobile) {
        setSidebarOpen(false);
      }
    } catch (error) {
      logNavigationFailure(page, error, 'sidebar');
      console.error('Navigation failed:', error);
    }
  };

  // PHASE 4: Save navigation state on changes
  useEffect(() => {
    saveNavigationState({
      currentPath: location.pathname,
      sidebarOpen,
      expandedMenus,
      searchQuery: navSearchQuery
    });
  }, [location.pathname, sidebarOpen, expandedMenus, navSearchQuery]);

  // PHASE 5: Listen for close-sidebar event (accessibility)
  useEffect(() => {
    const handleClose = () => {
      if (isMobile) setSidebarOpen(false);
    };
    window.addEventListener('close-sidebar', handleClose);
    return () => window.removeEventListener('close-sidebar', handleClose);
  }, [isMobile]);

  const handleMobileNavClick = () => {
    if (isMobile) {
      // Smooth close with RAF to prevent jarring transitions
      requestAnimationFrame(() => {
        setSidebarOpen(false);
      });
    }
  };

  return (
    <div className="flex w-full h-screen overflow-hidden bg-[#0B0B0C]" style={{ position: 'relative', zIndex: 0 }}>
      {/* PHASE 5: Skip to main content (accessibility) */}
      <SkipToMainLink />
      
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          style={{ zIndex: 45 }}
        />
      )}

      {/* SIDEBAR - Always visible on desktop, mobile toggleable */}
      <aside
        ref={sidebarRef}
        className={`
          ${isMobile ? 'fixed' : 'sticky'}
          inset-y-0 left-0 h-screen w-72 bg-gradient-to-b from-[#0F0F10] to-[#0A0A0B] border-r border-[#1E1E1E]
          flex flex-col overflow-hidden transition-transform duration-300 ease-in-out shadow-2xl
          ${isMobile && !sidebarOpen ? '-translate-x-full' : 'translate-x-0'}
        `}
        style={{ willChange: 'transform', zIndex: 50 }}
      >
        {/* Header */}
        <div className="p-6 border-b border-[#1E1E1E] shrink-0 bg-gradient-to-r from-red-950/20 to-transparent">
          <div className="flex items-center justify-between">
            <Link to={createPageUrl('App')} className="flex items-center gap-3 hover:opacity-80 transition-opacity no-underline">
              <div className="relative">
                <Shield className="w-10 h-10 text-red-500" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Sentinel</h2>
                <p className="text-xs text-gray-500 font-medium">Forensics Platform</p>
              </div>
            </Link>

            {isMobile && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors min-h-[44px] min-w-[44px]"
                aria-label="Close menu"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Case Context Selector */}
        <CaseSelectorHeader />

        {/* Search */}
        <div className="p-4 border-b border-[#1E1E1E] shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              value={navSearchQuery}
              onChange={(e) => setNavSearchQuery(e.target.value)}
              placeholder="Search navigation..."
              className="pl-9 h-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-gray-500 focus:border-red-500 focus:ring-red-500/20"
            />
          </div>
        </div>

        {/* Mode indicator */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          {/* Expert Mode - Always On Indicator */}
          <div className={`p-2.5 border rounded-lg ${
            isDeveloper 
              ? 'bg-purple-500/10 border-purple-500/30' 
              : 'bg-blue-500/10 border-blue-500/30'
          }`}>
            <p className={`text-xs text-center font-medium ${
              isDeveloper ? 'text-purple-300' : 'text-blue-300'
            }`}>
              {isDeveloper ? '🔧 Developer Mode' : '⚙️ Expert Mode'} Active
            </p>
          </div>

          {navigation.length === 0 && (
            <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-xs text-red-300 text-center font-medium">
                ⚠️ Navigation error - contact support
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}>
          <div className="space-y-1">
            {navigation.map((item) => {
              const IconComponent = getIcon(item.icon);
              
              const filteredSubmenu = navSearchQuery 
                ? item.submenu?.filter(sub => 
                    sub.name.toLowerCase().includes(navSearchQuery.toLowerCase()) ||
                    sub.page.toLowerCase().includes(navSearchQuery.toLowerCase())
                  ) || []
                : item.submenu || [];

              if (navSearchQuery && filteredSubmenu.length === 0) return null;

              const shouldExpand = expandedMenus[item.name] || (navSearchQuery && filteredSubmenu.length > 0);

              return (
                <div key={item.name} className="mb-2">
                  <button
                    onClick={() =>
                      setExpandedMenus((p) => ({ ...p, [item.name]: !p[item.name] }))
                    }
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-transparent text-white hover:bg-slate-800/70 text-sm font-medium transition-all duration-200 ease-in-out min-h-[44px] group"
                    aria-expanded={shouldExpand}
                    aria-label={`${item.name} menu`}
                  >
                    <div className="flex items-center gap-3">
                      <IconComponent className="w-5 h-5 text-gray-400 group-hover:text-red-400 transition-colors" />
                      <span className="group-hover:text-red-400 transition-colors">{item.name}</span>
                      {filteredSubmenu.length > 0 && (
                        <Badge className="bg-slate-700/80 text-white text-xs px-2 py-0.5">
                          {filteredSubmenu.length}
                        </Badge>
                      )}
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 text-gray-500 transition-transform ${
                        shouldExpand ? "rotate-90" : ""
                      }`}
                    />
                  </button>

                  {shouldExpand && (
                    <div className="pl-4 mt-1 space-y-0.5 animate-in fade-in slide-in-from-top-2 duration-200">
                      {filteredSubmenu.map((sub) => {
                        const SubIconComponent = getIcon(sub.icon);
                        const isActive = isActivePage(sub.page);

                        return (
                          <Link
                            key={sub.page}
                            to={createPageUrl(sub.page)}
                            onClick={handleMobileNavClick}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-white no-underline text-sm min-h-[44px] transition-all duration-200 ease-in-out group ${
                              isActive 
                                ? "bg-red-500 font-semibold shadow-lg shadow-red-500/20" 
                                : "hover:bg-slate-800/70 hover:translate-x-1"
                            }`}
                            aria-current={isActive ? 'page' : undefined}
                          >
                            <SubIconComponent className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-red-400'}`} />
                            <span>{sub.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-[#1E1E1E] shrink-0 bg-gradient-to-r from-slate-900/50 to-transparent">
          <Link to={createPageUrl("Profile")} onClick={handleMobileNavClick} className="block mb-3 no-underline">
            <div className={`flex items-center gap-3 p-3 rounded-lg min-h-[44px] transition-all ${
              isActivePage("Profile") 
                ? "bg-red-500 shadow-lg" 
                : "hover:bg-slate-800/70 hover:translate-x-1"
            }`}>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                {(user?.full_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "U")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {user?.full_name || user?.email || "Loading..."}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {user?.email || ""}
                </p>
              </div>
            </div>
          </Link>

          <div className="mb-3">
            <LanguageSelector compact />
          </div>

          <button
            onClick={() => base44.auth.logout()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-transparent border border-red-600 text-red-500 hover:bg-red-950/50 hover:border-red-500 text-sm font-medium min-h-[44px] transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>

        {/* Footer mode indicator - FIXED STATUS */}
        <div className="h-10 bg-[#0A0A0B] border-t border-[#1E1E1E] flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              isDeveloper ? 'bg-purple-400 animate-pulse' : 'bg-blue-400 animate-pulse'
            }`} />
            <span className="text-xs text-slate-400 font-medium">
              {isDeveloper ? "DEV MODE" : "EXPERT MODE"}
            </span>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ position: 'relative', zIndex: 0 }}>
        {/* HEADER - Compact, content-focused */}
        <header className="h-12 bg-[#0F0F10] border-b border-[#1E1E1E] flex items-center justify-between px-4 shrink-0 shadow-lg sticky top-0" style={{ zIndex: 100 }}>
          <div className="flex items-center gap-3">
            {/* Hamburger - mobile only */}
            {isMobile && (
              <button
                onClick={toggleSidebar}
                className="w-10 h-10 flex items-center justify-center bg-red-600 rounded-lg hover:bg-red-700 transition-all min-h-[44px] min-w-[44px]"
                title={sidebarOpen ? "Close menu" : "Open menu"}
                aria-label={sidebarOpen ? "Close menu" : "Open menu"}
              >
                {sidebarOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
              </button>
            )}

            <Link to={createPageUrl('App')} className="flex items-center gap-2 hover:opacity-80 transition-opacity no-underline">
              <Shield className="w-5 h-5 text-red-500" />
              <span className="text-white font-semibold text-base hidden sm:inline">Sentinel</span>
            </Link>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Global Search */}
            <button
              onClick={() => setShowUnifiedSearch(true)}
              className="w-9 h-9 flex items-center justify-center hover:bg-slate-800 rounded-lg transition-colors"
              title="Search (Ctrl+K)"
            >
              <Search className="w-4 h-4 text-white" />
            </button>

            {/* Mode indicator - FIXED STATUS (no toggle) */}
            <div className={`hidden md:flex items-center gap-1.5 px-2.5 h-8 rounded-lg font-medium text-xs ${
              isDeveloper
                ? 'bg-purple-600 text-white'
                : 'bg-blue-600 text-white'
            }`}>
              <Code className="w-3.5 h-3.5" />
              <span>{isDeveloper ? 'DEV' : 'EXPERT'}</span>
            </div>

            {/* Help menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-9 h-9 flex items-center justify-center hover:bg-slate-800 rounded-lg transition-colors">
                  <HelpCircle className="w-4 h-4 text-white" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-slate-900 border-slate-800" align="end">
                <DropdownMenuItem
                  onClick={() => navigate(createPageUrl("WelcomeOnboarding"))}
                  className="text-white hover:bg-slate-800 cursor-pointer"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Watch Intro
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate(createPageUrl("QuickStartWizard"))}
                  className="text-white hover:bg-slate-800 cursor-pointer"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Quick Start
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate(createPageUrl("Documentation"))}
                  className="text-white hover:bg-slate-800 cursor-pointer"
                >
                  <BookOpen className="w-4 h-4 mr-2" />
                  Documentation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <NotificationCenter />

            <Link to={createPageUrl("AlertManagement")}>
              <button className="w-9 h-9 flex items-center justify-center hover:bg-slate-800 rounded-lg relative transition-colors">
                <Bell className="w-4 h-4 text-white" />
                {alerts.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
              </button>
            </Link>
          </div>
        </header>

        {/* Legal Breadcrumbs */}
        <LegalBreadcrumbs />

        {/* MAIN CONTENT - Always renders via Outlet with smooth transitions */}
        <main id="main-content" className="flex-1 overflow-y-auto bg-[#0B0B0C] relative transition-opacity duration-200 ease-in-out">
          {userLoading ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="text-white text-lg">Loading application...</div>
                <div className="text-slate-400 text-sm">Authenticating user</div>
              </div>
            </div>
          ) : userError ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-md text-center space-y-4 bg-slate-900/80 p-8 rounded-xl border border-red-500/30">
                <AlertTriangle className="w-16 h-16 text-red-400 mx-auto" />
                <h2 className="text-2xl font-bold text-white">Authentication Error</h2>
                <p className="text-red-300">Unable to load user session.</p>
                <div className="text-sm text-slate-400 bg-slate-950/50 p-4 rounded font-mono">
                  {userError?.message || 'Network or authentication failure'}
                </div>
                <div className="space-y-2">
                  <Button 
                    onClick={() => window.location.reload()} 
                    className="w-full bg-red-600 hover:bg-red-700"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reload Application
                  </Button>
                  <Button 
                    onClick={() => {
                      localStorage.clear();
                      sessionStorage.clear();
                      window.location.href = '/';
                    }}
                    variant="outline"
                    className="w-full border-slate-700"
                  >
                    Clear Cache & Retry
                  </Button>
                  <Button 
                    onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
                    variant="outline"
                    className="w-full border-blue-500/50 text-blue-400"
                  >
                    Login Again
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
          
          {/* SMART BACK BUTTON - Always available, context-aware */}
          <SmartBackButton />
          
          {/* QUICK NAVIGATION - Cmd+K shortcut */}
          <QuickNavigation />
        </main>
      </div>

      {/* UNIFIED SEARCH MODAL */}
      <UnifiedSearch isOpen={showUnifiedSearch} onClose={() => setShowUnifiedSearch(false)} />
      
      {/* SUPPORT CHAT - Floating button */}
      <SupportChat />
      
      {/* BETA FEEDBACK WIDGET - Global floating button */}
      <FeedbackWidget />
    </div>
  );
}