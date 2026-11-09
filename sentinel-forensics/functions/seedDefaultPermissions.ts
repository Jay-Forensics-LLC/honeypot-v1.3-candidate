/**
 * PHASE 6: Seed Default Permissions
 * One-time setup to create global permission registry
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireAuth, requireAdmin, sanitizeError } from './helpers/security.js';

const DEFAULT_PERMISSIONS = [
  { key: 'users.view', description: 'View organization users', category: 'users' },
  { key: 'users.manage', description: 'Manage users and roles', category: 'users' },
  { key: 'dashboards.view', description: 'View dashboards', category: 'dashboards' },
  { key: 'dashboards.edit', description: 'Create and edit dashboards', category: 'dashboards' },
  { key: 'dashboards.share', description: 'Share dashboards with team', category: 'dashboards' },
  { key: 'review.alerts.view', description: 'View alerts', category: 'review' },
  { key: 'review.alerts.manage', description: 'Triage and manage alerts', category: 'review' },
  { key: 'evidence.view', description: 'View evidence', category: 'evidence' },
  { key: 'evidence.upload', description: 'Upload evidence', category: 'evidence' },
  { key: 'evidence.analyze', description: 'Run AI analysis on evidence', category: 'evidence' },
  { key: 'evidence.curate', description: 'Add timeline events and findings', category: 'evidence' },
  { key: 'cases.view', description: 'View cases', category: 'cases' },
  { key: 'cases.manage', description: 'Create and manage cases', category: 'cases' },
  { key: 'devices.view', description: 'View devices', category: 'devices' },
  { key: 'devices.manage', description: 'Manage device configurations', category: 'devices' },
  { key: 'devices.isolate', description: 'Isolate compromised devices', category: 'devices' },
  { key: 'compliance.view', description: 'View compliance status', category: 'compliance' },
  { key: 'compliance.manage', description: 'Manage policies and compliance', category: 'compliance' },
  { key: 'system.health.view', description: 'View system health metrics', category: 'system' }
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await requireAuth(base44);
    requireAdmin(user);
    
    // Check if permissions already exist
    const existing = await base44.asServiceRole.entities.Permission.list();
    
    if (existing.length > 0) {
      return Response.json({ 
        message: 'Permissions already seeded',
        count: existing.length 
      });
    }
    
    // Create permissions
    const created = [];
    for (const perm of DEFAULT_PERMISSIONS) {
      const p = await base44.asServiceRole.entities.Permission.create(perm);
      created.push(p);
    }
    
    return Response.json({
      message: 'Default permissions created',
      count: created.length,
      permissions: created.map(p => p.key)
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[SEED-PERMISSIONS] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});