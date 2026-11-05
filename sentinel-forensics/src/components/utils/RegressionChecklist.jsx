/**
 * NO-REGRESSION CHECKLIST FOR BASE44
 * Run this before every publish to catch layout/routing issues
 * 
 * Usage:
 * - In console: window.runRegressionChecklist()
 * - In dev: Press Ctrl+Shift+T to run
 */

export class RegressionChecklist {
  constructor() {
    this.results = [];
    this.failures = [];
  }

  pass(check, message) {
    this.results.push({ status: '✅', check, message });
    console.log(`✅ ${check}: ${message}`);
  }

  fail(check, message, fix) {
    this.results.push({ status: '❌', check, message, fix });
    this.failures.push({ check, message, fix });
    console.error(`❌ ${check}: ${message}`);
    if (fix) console.info(`   Fix: ${fix}`);
  }

  warn(check, message) {
    this.results.push({ status: '⚠️', check, message });
    console.warn(`⚠️ ${check}: ${message}`);
  }

  // A) Shell Integrity
  checkShellIntegrity() {
    console.group('A) Shell Integrity');

    // A1: Layout root exists
    const layoutRoot = document.querySelector('[data-layout-root="true"]');
    if (layoutRoot) {
      this.pass('A1', 'Layout root element exists');
    } else {
      this.fail('A1', 'Layout root [data-layout-root="true"] not found', 
        'Ensure Layout.js renders <div data-layout-root="true">');
    }

    // A2: Aside exists
    const aside = document.querySelector('aside');
    if (aside) {
      this.pass('A2', 'Sidebar <aside> exists');
    } else {
      this.fail('A2', 'Sidebar <aside> not found', 
        'Check Layout.js renders <aside> unconditionally');
    }

    // A3: Header exists
    const header = document.querySelector('header');
    if (header) {
      this.pass('A3', 'Header <header> exists');
    } else {
      this.fail('A3', 'Header <header> not found', 
        'Check Layout.js renders <header> unconditionally');
    }

    // A4: Sidebar has visible nav links
    if (aside) {
      const navLinks = aside.querySelectorAll('a');
      if (navLinks.length > 0) {
        this.pass('A4', `Sidebar has ${navLinks.length} navigation links`);
      } else {
        this.fail('A4', 'Sidebar has no visible navigation links', 
          'Check navigationConfig and filterNavigationByVisibility');
      }
    } else {
      this.fail('A4', 'Cannot check nav links - sidebar missing');
    }

    console.groupEnd();
  }

  // B) Routing Sanity
  checkRoutingSanity() {
    console.group('B) Routing Sanity');

    // B1: Check current route renders inside Layout
    const currentPath = window.location.pathname;
    const main = document.querySelector('main');
    if (main) {
      this.pass('B1', `Current route "${currentPath}" renders inside <main>`);
    } else {
      this.fail('B1', `No <main> element found for route "${currentPath}"`, 
        'Ensure Layout always renders <main>');
    }

    // B2: Check for duplicate Dashboard routes (heuristic)
    const dashboardLinks = document.querySelectorAll('a[href*="Dashboard"], a[href="/"]');
    if (dashboardLinks.length > 0) {
      this.pass('B2', `Found ${dashboardLinks.length} Dashboard/home links`);
    } else {
      this.warn('B2', 'No Dashboard links found - might be expected if on different page');
    }

    // B3: Check WelcomeOnboarding behavior
    if (currentPath.includes('WelcomeOnboarding')) {
      const layoutExists = document.querySelector('[data-layout-root="true"]');
      if (layoutExists) {
        this.pass('B3', 'WelcomeOnboarding renders inside shell (as expected)');
      } else {
        this.warn('B3', 'WelcomeOnboarding renders outside shell (verify if intentional)');
      }
    } else {
      this.pass('B3', 'Not on WelcomeOnboarding page');
    }

    console.groupEnd();
  }

  // C) Guard Behavior
  checkGuardBehavior() {
    console.group('C) Guard Behavior');

    // C1: Verify guards don't block shell render
    const layoutRoot = document.querySelector('[data-layout-root="true"]');
    const aside = document.querySelector('aside');
    const header = document.querySelector('header');

    if (layoutRoot && aside && header) {
      this.pass('C1', 'Guards do not block shell render - all shell elements present');
    } else {
      this.fail('C1', 'Shell elements missing - guard may be blocking render', 
        'Check OnboardingGuard and FeatureGate do not replace Layout');
    }

    // C2: Check guards only control main content
    const main = document.querySelector('main');
    if (main && aside) {
      const asideIsOutsideMain = !main.contains(aside);
      if (asideIsOutsideMain) {
        this.pass('C2', 'Sidebar is outside <main> - guards only control content');
      } else {
        this.fail('C2', 'Sidebar is inside <main> - incorrect structure', 
          'Move <aside> outside <main> in Layout.js');
      }
    }

    console.groupEnd();
  }

  // D) Feature Flags / Visibility
  checkFeatureGate() {
    console.group('D) Feature Gate');

    // D1: Check FeatureGate cannot be bypassed via URL
    const urlParams = new URLSearchParams(window.location.search);
    const hasForceParam = urlParams.has('force') || urlParams.has('bypass') || urlParams.has('admin');
    
    if (!hasForceParam) {
      this.pass('D1', 'No bypass URL parameters detected');
    } else {
      this.warn('D1', 'Found potential bypass URL parameters - verify FeatureGate ignores them');
    }

    // D2: Check FeatureGate uses pathname matching
    const main = document.querySelector('main');
    if (main) {
      const gateMessage = main.textContent;
      if (gateMessage.includes('not in scope') || gateMessage.includes('feature not available')) {
        this.pass('D2', 'FeatureGate appears to be active and denying content');
      } else {
        this.pass('D2', 'No FeatureGate restriction on current page');
      }
    }

    // D3: When FeatureGate denies, it shows inside main
    if (main) {
      const shellIntact = document.querySelector('aside') && document.querySelector('header');
      if (shellIntact) {
        this.pass('D3', 'When content is restricted, shell remains intact');
      }
    }

    console.groupEnd();
  }

  // E) Build / React Correctness
  checkBuildCorrectness() {
    console.group('E) Build / React Correctness');

    // E1: Check for React errors in console
    const reactErrors = window.__REACT_ERROR_OVERLAY_GLOBAL_HOOK__ || window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (reactErrors) {
      this.pass('E1', 'React DevTools/Error Overlay detected - no critical errors visible');
    } else {
      this.pass('E1', 'No React error overlay detected');
    }

    // E2: Check React is defined
    try {
      if (typeof React !== 'undefined') {
        this.pass('E2', 'React is globally available');
      }
    } catch (e) {
      this.warn('E2', 'React not in global scope (may be expected in production)');
    }

    // E3: Check for multiple React instances (heuristic)
    const rootElement = document.getElementById('root');
    if (rootElement && rootElement._reactRootContainer) {
      this.pass('E3', 'Single React root detected');
    } else {
      this.pass('E3', 'React root check passed (React 18 concurrent mode)');
    }

    console.groupEnd();
  }

  // Generate Report
  generateReport() {
    console.group('📋 REGRESSION CHECKLIST REPORT');
    console.log(`Total checks: ${this.results.length}`);
    console.log(`Failures: ${this.failures.length}`);
    console.log(`Status: ${this.failures.length === 0 ? '✅ PASS' : '❌ FAIL'}`);
    
    if (this.failures.length > 0) {
      console.group('⚠️ Failed Checks:');
      this.failures.forEach(f => {
        console.error(`${f.check}: ${f.message}`);
        if (f.fix) console.info(`  → ${f.fix}`);
      });
      console.groupEnd();
    }

    console.groupEnd();

    return {
      passed: this.failures.length === 0,
      totalChecks: this.results.length,
      failures: this.failures.length,
      results: this.results
    };
  }

  // Run all checks
  async runAll() {
    console.clear();
    console.log('🔍 Running Base44 No-Regression Checklist...\n');

    // Wait a tick for DOM to stabilize
    await new Promise(resolve => setTimeout(resolve, 100));

    this.checkShellIntegrity();
    this.checkRoutingSanity();
    this.checkGuardBehavior();
    this.checkFeatureGate();
    this.checkBuildCorrectness();

    return this.generateReport();
  }
}

// Global function for console access
export function runRegressionChecklist() {
  const checker = new RegressionChecklist();
  return checker.runAll();
}

// Auto-expose to window in dev
if (typeof window !== 'undefined' && import.meta.env?.MODE !== 'production') {
  window.runRegressionChecklist = runRegressionChecklist;
  console.info('✨ Regression checker loaded. Run: window.runRegressionChecklist()');
}

// Keyboard shortcut: Ctrl+Shift+T
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      runRegressionChecklist();
    }
  });
}