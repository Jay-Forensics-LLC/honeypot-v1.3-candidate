/**
 * Contrast Checker Utility
 * Ensures WCAG 2.1 AA compliance (4.5:1 for normal text, 3:1 for large text)
 * No external dependencies - uses native browser APIs
 */

/**
 * Parse RGB/RGBA color string to object
 */
function parseColor(color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: a / 255 };
}

/**
 * Calculate relative luminance (WCAG formula)
 */
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 */
export function getContrastRatio(color1, color2) {
  try {
    const c1 = parseColor(color1);
    const c2 = parseColor(color2);
    
    const l1 = getLuminance(c1.r, c1.g, c1.b);
    const l2 = getLuminance(c2.r, c2.g, c2.b);
    
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    
    return (lighter + 0.05) / (darker + 0.05);
  } catch (error) {
    console.error('Error calculating contrast:', error);
    return 0;
  }
}

/**
 * Check if contrast meets WCAG AA standards
 */
export function meetsWCAG(contrastRatio, isLargeText = false) {
  const threshold = isLargeText ? 3 : 4.5;
  return contrastRatio >= threshold;
}

/**
 * Audit specific element for contrast issues
 */
export function auditElement(element) {
  const styles = window.getComputedStyle(element);
  const color = styles.color;
  const bgColor = styles.backgroundColor;
  const fontSize = parseFloat(styles.fontSize);
  const fontWeight = styles.fontWeight;
  
  // Large text = 18pt+ or 14pt+ bold
  const isLargeText = fontSize >= 18 || (fontSize >= 14 && parseInt(fontWeight) >= 700);
  
  const ratio = getContrastRatio(color, bgColor);
  const passes = meetsWCAG(ratio, isLargeText);
  
  return {
    element: element.tagName + (element.className ? `.${element.className.split(' ')[0]}` : ''),
    color,
    bgColor,
    fontSize,
    isLargeText,
    ratio: ratio.toFixed(2),
    passes,
    threshold: isLargeText ? 3 : 4.5
  };
}

/**
 * Audit entire page for contrast issues
 * PRIORITY: Navigation elements first
 */
export function auditPage() {
  const results = {
    navigation: [],
    buttons: [],
    text: [],
    failing: []
  };
  
  // Priority 1: Navigation/Sidebar elements
  const navElements = document.querySelectorAll('nav, aside, [role="navigation"], .sidebar');
  navElements.forEach(nav => {
    const textElements = nav.querySelectorAll('a, button, span, p, h1, h2, h3, h4, h5, h6');
    textElements.forEach(el => {
      if (el.offsetParent !== null) { // Only visible elements
        const audit = auditElement(el);
        results.navigation.push(audit);
        if (!audit.passes) results.failing.push(audit);
      }
    });
  });
  
  // Priority 2: Buttons
  const buttons = document.querySelectorAll('button');
  buttons.forEach(btn => {
    if (btn.offsetParent !== null) {
      const audit = auditElement(btn);
      results.buttons.push(audit);
      if (!audit.passes) results.failing.push(audit);
    }
  });
  
  // Priority 3: All text elements
  const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, li, a');
  textElements.forEach(el => {
    if (el.offsetParent !== null) {
      const audit = auditElement(el);
      results.text.push(audit);
      if (!audit.passes) results.failing.push(audit);
    }
  });
  
  return results;
}

/**
 * Generate contrast audit report
 */
export function generateReport() {
  const results = auditPage();
  
  console.group('🔍 Contrast Audit Report');
  console.log(`Total elements checked: ${results.navigation.length + results.buttons.length + results.text.length}`);
  console.log(`Failing elements: ${results.failing.length}`);
  
  if (results.failing.length > 0) {
    console.group('❌ Failed Contrast Checks');
    results.failing.forEach(item => {
      console.warn(
        `${item.element}: ${item.color} on ${item.bgColor} = ${item.ratio}:1 (needs ${item.threshold}:1)`
      );
    });
    console.groupEnd();
  } else {
    console.log('✅ All elements pass WCAG AA standards');
  }
  
  console.groupEnd();
  
  return results;
}

/**
 * Dev tool: Add contrast checker to window
 */
if (typeof window !== 'undefined') {
  window.checkContrast = generateReport;
}