/**
 * NAVIGATION HEALTH CHECK
 * Validates all routes are reachable from navigation
 */

import { navigationConfig } from '../config/navigationConfig';

export function checkNavigationHealth() {
  const issues = [];
  const checkedRoutes = new Set();

  const validateCategory = (category) => {
    if (!category.items || category.items.length === 0) {
      issues.push({
        type: 'empty_category',
        category: category.category,
        message: `Category "${category.category}" has no items`
      });
      return;
    }

    for (const item of category.items) {
      if (!item.page) {
        issues.push({
          type: 'missing_page',
          item: item.name,
          message: `Item "${item.name}" has no page property`
        });
        continue;
      }

      if (!item.icon) {
        issues.push({
          type: 'missing_icon',
          item: item.name,
          message: `Item "${item.name}" has no icon`
        });
      }

      const route = item.path || `/${item.page}`;
      if (checkedRoutes.has(route)) {
        issues.push({
          type: 'duplicate_route',
          item: item.name,
          route,
          message: `Duplicate route: ${route}`
        });
      }
      checkedRoutes.add(route);
    }
  };

  for (const category of navigationConfig) {
    validateCategory(category);
  }

  return {
    healthy: issues.length === 0,
    totalRoutes: checkedRoutes.size,
    issues
  };
}

/**
 * Find dead ends - routes with no back navigation
 */
export function findDeadEnds(routes) {
  const deadEnds = [];
  
  // Routes that should always have back navigation
  const detailRoutes = routes.filter(r => 
    r.includes(':id') || 
    r.includes('Detail') || 
    r.includes('Edit')
  );

  for (const route of detailRoutes) {
    // Check if route is in navigation
    const inNav = navigationConfig.some(cat => 
      cat.items.some(item => 
        (item.path || `/${item.page}`) === route
      )
    );

    if (!inNav) {
      deadEnds.push({
        route,
        message: 'Detail route not in navigation (should have back button)',
        severity: 'warning'
      });
    }
  }

  return deadEnds;
}