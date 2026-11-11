/**
 * THREAT ACTOR CRUD API
 * 
 * Production-grade operations with audit logging and immutability.
 * Operations: create, update, list, get, link-to-campaign
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { operation, actor_id, data } = await req.json();
    
    if (!operation) {
      return Response.json({ error: 'Missing operation' }, { status: 400 });
    }
    
    let result;
    
    switch (operation) {
      case 'create': {
        if (!data?.actor_name || !data?.threat_level) {
          return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }
        
        result = await base44.asServiceRole.entities.ThreatActor.create({
          organization_id: user.organization_id || 'default',
          ...data,
          aliases: data.aliases || [],
          ttps: data.ttps || [],
          associated_iocs: data.associated_iocs || [],
          campaigns: data.campaigns || [],
          confidence_score: data.confidence_score || 50
        });
        
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id || 'default',
          event_type: 'threat_actor_created',
          severity: 'info',
          description: `Threat actor created: ${data.actor_name}`,
          user_id: user.email,
          resource_type: 'ThreatActor',
          resource_id: result.id,
          action_performed: 'create',
          metadata: { actor_name: data.actor_name },
          success: true,
          blockchain_hash: '',
          timestamp: new Date().toISOString()
        });
        
        break;
      }
      
      case 'update': {
        if (!actor_id) {
          return Response.json({ error: 'Missing actor_id' }, { status: 400 });
        }
        
        result = await base44.entities.ThreatActor.update(actor_id, data);
        
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id || 'default',
          event_type: 'threat_actor_updated',
          severity: 'info',
          description: `Threat actor updated`,
          user_id: user.email,
          resource_type: 'ThreatActor',
          resource_id: actor_id,
          action_performed: 'update',
          metadata: { changes: Object.keys(data) },
          success: true,
          blockchain_hash: '',
          timestamp: new Date().toISOString()
        });
        
        break;
      }
      
      case 'list': {
        result = await base44.entities.ThreatActor.list();
        break;
      }
      
      case 'get': {
        if (!actor_id) {
          return Response.json({ error: 'Missing actor_id' }, { status: 400 });
        }
        result = await base44.entities.ThreatActor.get(actor_id);
        break;
      }
      
      case 'link-campaign': {
        if (!actor_id || !data?.campaign) {
          return Response.json({ error: 'Missing actor_id or campaign data' }, { status: 400 });
        }
        
        const actor = await base44.entities.ThreatActor.get(actor_id);
        const campaigns = actor.campaigns || [];
        campaigns.push({
          name: data.campaign.name,
          start_date: data.campaign.start_date,
          end_date: data.campaign.end_date,
          targets: data.campaign.targets || [],
          campaign_id: `camp-${Date.now()}`
        });
        
        result = await base44.entities.ThreatActor.update(actor_id, { campaigns });
        
        await base44.asServiceRole.entities.AuditLog.create({
          organization_id: user.organization_id || 'default',
          event_type: 'campaign_linked',
          severity: 'info',
          description: `Campaign linked to threat actor: ${data.campaign.name}`,
          user_id: user.email,
          resource_type: 'ThreatActor',
          resource_id: actor_id,
          action_performed: 'link-campaign',
          metadata: { campaign_name: data.campaign.name },
          success: true,
          blockchain_hash: '',
          timestamp: new Date().toISOString()
        });
        
        break;
      }
      
      default:
        return Response.json({ error: 'Invalid operation' }, { status: 400 });
    }
    
    return Response.json({ success: true, data: result });
    
  } catch (error) {
    console.error('Threat actor operation failed:', error);
    return Response.json({ 
      error: error.message || 'Operation failed' 
    }, { status: 500 });
  }
});