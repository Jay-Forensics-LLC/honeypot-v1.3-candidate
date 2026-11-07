/**
 * Update Software Inventory (Internal Job)
 * Builds latest software inventory snapshots from agent events
 * 
 * Triggered by: Scheduled automation (every 1 hour)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireInternalJobSecret, sanitizeError } from './helpers/security.js';

Deno.serve(async (req) => {
  try {
    requireInternalJobSecret(req);
    
    const base44 = createClientFromRequest(req);
    
    // Get all organizations (system-level operation)
    const orgs = await base44.asServiceRole.entities.User.list();
    const uniqueOrgs = [...new Set(orgs.map(u => u.organization_id).filter(Boolean))];
    
    let totalProcessed = 0;
    let totalUpdated = 0;
    
    for (const orgId of uniqueOrgs) {
      // Get latest software_inventory events per device
      const inventoryEvents = await base44.asServiceRole.entities.AgentEvent.filter({
        organization_id: orgId,
        event_type: 'software_inventory'
      });
      
      // Group by device, keep most recent
      const latestByDevice = new Map<string, any>();
      for (const event of inventoryEvents) {
        const existing = latestByDevice.get(event.device_id);
        if (!existing || new Date(event.event_time) > new Date(existing.event_time)) {
          latestByDevice.set(event.device_id, event);
        }
      }
      
      // Update or create inventory records
      for (const [deviceId, event] of latestByDevice) {
        const existing = await base44.asServiceRole.entities.SoftwareInventory.filter({
          organization_id: orgId,
          device_id: deviceId
        });
        
        const inventoryData = {
          organization_id: orgId,
          device_id: deviceId,
          collected_at: event.event_time,
          items_json: event.payload_json.items || {},
          item_count: event.payload_json.items?.length || 0,
          os_info: event.payload_json.os_info || {},
          source_event_id: event.id
        };
        
        if (existing.length > 0) {
          await base44.asServiceRole.entities.SoftwareInventory.update(existing[0].id, inventoryData);
        } else {
          await base44.asServiceRole.entities.SoftwareInventory.create(inventoryData);
        }
        
        totalUpdated++;
      }
      
      totalProcessed += latestByDevice.size;
    }
    
    return Response.json({
      success: true,
      organizations_processed: uniqueOrgs.length,
      devices_processed: totalProcessed,
      inventories_updated: totalUpdated,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    if (error instanceof Response) return error;
    
    console.error('[UPDATE-INVENTORY] Error:', error);
    return Response.json(sanitizeError(error), { status: 500 });
  }
});