/**
 * Button Overlap Detection Utility
 * Detects overlapping interactive elements (buttons, links)
 * Priority: Navigation/Sidebar elements first
 */

/**
 * Check if two rectangles overlap
 */
function doRectsOverlap(rect1, rect2, buffer = 0) {
  return !(
    rect1.right + buffer < rect2.left ||
    rect1.left - buffer > rect2.right ||
    rect1.bottom + buffer < rect2.top ||
    rect1.top - buffer > rect2.bottom
  );
}

/**
 * Get computed spacing around element
 */
function getElementSpacing(element) {
  const styles = window.getComputedStyle(element);
  return {
    marginTop: parseFloat(styles.marginTop) || 0,
    marginBottom: parseFloat(styles.marginBottom) || 0,
    marginLeft: parseFloat(styles.marginLeft) || 0,
    marginRight: parseFloat(styles.marginRight) || 0,
    paddingTop: parseFloat(styles.paddingTop) || 0,
    paddingBottom: parseFloat(styles.paddingBottom) || 0,
  };
}

/**
 * Audit element for overlaps with nearby elements
 */
export function auditElement(element, allElements) {
  const rect = element.getBoundingClientRect();
  const spacing = getElementSpacing(element);
  const overlaps = [];

  // Only check visible elements
  if (rect.width === 0 || rect.height === 0) return null;

  allElements.forEach((other) => {
    if (element === other) return;

    const otherRect = other.getBoundingClientRect();
    if (otherRect.width === 0 || otherRect.height === 0) return;

    // Check with 2px buffer for touch targets
    if (doRectsOverlap(rect, otherRect, 2)) {
      const overlapArea = calculateOverlapArea(rect, otherRect);
      overlaps.push({
        element: getElementIdentifier(other),
        overlapArea,
        position: {
          top: otherRect.top,
          left: otherRect.left,
          width: otherRect.width,
          height: otherRect.height,
        },
      });
    }
  });

  if (overlaps.length === 0) return null;

  return {
    element: getElementIdentifier(element),
    position: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
    spacing,
    overlaps,
    severity: overlaps.length > 2 ? 'high' : overlaps.length > 1 ? 'medium' : 'low',
  };
}

/**
 * Calculate overlap area between two rectangles
 */
function calculateOverlapArea(rect1, rect2) {
  const xOverlap = Math.max(0, Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left));
  const yOverlap = Math.max(0, Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top));
  return xOverlap * yOverlap;
}

/**
 * Get readable element identifier
 */
function getElementIdentifier(element) {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const className = element.className ? `.${element.className.split(' ')[0]}` : '';
  const text = element.textContent?.trim().substring(0, 30) || '';
  return `${tag}${id}${className} "${text}"`;
}

/**
 * Audit entire page for button/link overlaps
 * PRIORITY: Navigation elements first
 */
export function auditPage() {
  const results = {
    navigation: [],
    buttons: [],
    links: [],
    failing: [],
  };

  // Priority 1: Navigation/Sidebar buttons and links
  const navContainers = document.querySelectorAll('nav, aside, [role="navigation"], .sidebar');
  navContainers.forEach((container) => {
    const navElements = Array.from(container.querySelectorAll('button, a[href]'));
    navElements.forEach((el) => {
      if (el.offsetParent !== null) {
        const audit = auditElement(el, navElements);
        if (audit) {
          results.navigation.push(audit);
          if (audit.overlaps.length > 0) results.failing.push(audit);
        }
      }
    });
  });

  // Priority 2: All buttons
  const allButtons = Array.from(document.querySelectorAll('button'));
  allButtons.forEach((btn) => {
    if (btn.offsetParent !== null) {
      const audit = auditElement(btn, allButtons);
      if (audit) {
        results.buttons.push(audit);
        if (audit.overlaps.length > 0 && !results.failing.includes(audit)) {
          results.failing.push(audit);
        }
      }
    }
  });

  // Priority 3: Interactive links
  const allLinks = Array.from(document.querySelectorAll('a[href]'));
  allLinks.forEach((link) => {
    if (link.offsetParent !== null) {
      const audit = auditElement(link, allLinks);
      if (audit) {
        results.links.push(audit);
        if (audit.overlaps.length > 0 && !results.failing.includes(audit)) {
          results.failing.push(audit);
        }
      }
    }
  });

  return results;
}

/**
 * Generate overlap audit report
 */
export function generateReport() {
  const results = auditPage();

  console.group('🔍 Button Overlap Audit Report');
  console.log(`Navigation elements: ${results.navigation.length}`);
  console.log(`Buttons checked: ${results.buttons.length}`);
  console.log(`Links checked: ${results.links.length}`);
  console.log(`Overlapping elements: ${results.failing.length}`);

  if (results.failing.length > 0) {
    console.group('❌ Overlapping Elements');
    results.failing.forEach((item) => {
      console.warn(
        `${item.element} overlaps with ${item.overlaps.length} other element(s)`,
        item.overlaps
      );
    });
    console.groupEnd();
  } else {
    console.log('✅ No overlapping elements detected');
  }

  console.groupEnd();

  return results;
}

/**
 * Dev tool: Add overlap checker to window
 */
if (typeof window !== 'undefined') {
  window.checkOverlaps = generateReport;
}