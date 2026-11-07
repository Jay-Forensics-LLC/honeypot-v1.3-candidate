/**
 * PHASE 5: Navigation Accessibility Enhancements
 * 
 * WCAG 2.1 AA compliance for navigation system.
 */

import { useEffect } from 'react';

/**
 * Keyboard navigation enhancement
 * Ensures all navigation is keyboard-accessible
 */
export function useKeyboardNavigation(sidebarRef, focusTrapEnabled = true) {
  useEffect(() => {
    if (!sidebarRef?.current || !focusTrapEnabled) return;

    const sidebar = sidebarRef.current;
    const focusableElements = sidebar.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e) => {
      // Escape to close sidebar on mobile
      if (e.key === 'Escape') {
        const event = new CustomEvent('close-sidebar');
        window.dispatchEvent(event);
        return;
      }

      // Tab key focus trap
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    sidebar.addEventListener('keydown', handleKeyDown);
    return () => sidebar.removeEventListener('keydown', handleKeyDown);
  }, [sidebarRef, focusTrapEnabled]);
}

/**
 * Screen reader announcements for navigation
 */
export function announceNavigation(pageName) {
  const announcement = `Navigated to ${pageName} page`;
  
  // Create live region if it doesn't exist
  let liveRegion = document.getElementById('nav-announcer');
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'nav-announcer';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'sr-only';
    document.body.appendChild(liveRegion);
  }
  
  // Announce navigation
  liveRegion.textContent = announcement;
  
  // Clear after announcement
  setTimeout(() => {
    liveRegion.textContent = '';
  }, 1000);
}

/**
 * Focus management for navigation
 */
export function focusMainContent() {
  const main = document.querySelector('main');
  if (main) {
    main.setAttribute('tabindex', '-1');
    main.focus();
    setTimeout(() => main.removeAttribute('tabindex'), 100);
  }
}

/**
 * Skip to main content link (accessibility)
 */
export function SkipToMainLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-red-600 focus:text-white focus:rounded-lg focus:shadow-lg"
      onClick={(e) => {
        e.preventDefault();
        focusMainContent();
      }}
    >
      Skip to main content
    </a>
  );
}