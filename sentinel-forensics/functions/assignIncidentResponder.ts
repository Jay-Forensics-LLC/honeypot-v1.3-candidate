import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Auto-assign incident to available responder based on role and workload
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { incidentId } = await req.json();

    // Get incident
    const incidents = await base44.asServiceRole.entities.IncidentResponse.filter({ 
      incident_id: incidentId 
    });
    
    if (!incidents || incidents.length === 0) {
      return Response.json({ error: 'Incident not found' }, { status: 404 });
    }
    const incident = incidents[0];

    // Get all users with incident response capabilities
    const allUsers = await base44.asServiceRole.entities.User.list();
    
    // Filter for users with incident response role or admin
    const eligibleUsers = [];
    
    for (const u of allUsers) {
      if (u.role === 'admin') {
        eligibleUsers.push(u);
        continue;
      }
      
      // Check custom role permissions
      if (u.custom_role_id) {
        const roles = await base44.asServiceRole.entities.Role.filter({ id: u.custom_role_id });
        if (roles.length > 0) {
          const role = roles[0];
          if (role.permissions?.incidents?.respond || role.permissions?.incidents?.create) {
            eligibleUsers.push(u);
          }
        }
      }
    }

    if (eligibleUsers.length === 0) {
      return Response.json({ 
        error: 'No eligible responders found',
        message: 'No users with incident response permissions'
      }, { status: 404 });
    }

    // Get current workload for each user
    const userWorkloads = await Promise.all(
      eligibleUsers.map(async (u) => {
        const assignedIncidents = await base44.asServiceRole.entities.IncidentResponse.filter({
          assigned_to: u.email,
          status: { $in: ['detected', 'investigating', 'contained'] }
        });
        
        return {
          email: u.email,
          name: u.full_name,
          workload: assignedIncidents.length,
          specialization: u.specialization || 'general'
        };
      })
    );

    // Score each user for this incident
    const scoredUsers = userWorkloads.map(u => {
      let score = 100;
      
      // Prefer users with lower workload
      score -= u.workload * 10;
      
      // Bonus for matching specialization
      if (incident.incident_type === 'malware_outbreak' && u.specialization === 'malware_analysis') score += 20;
      if (incident.incident_type === 'data_breach' && u.specialization === 'digital_forensics') score += 20;
      if (incident.incident_type === 'unauthorized_access' && u.specialization === 'incident_response') score += 20;
      
      // Bonus for critical incidents to most experienced
      if (incident.severity === 'critical' && u.workload > 0) score += 10; // Experience matters
      
      return { ...u, score };
    });

    // Select best match
    scoredUsers.sort((a, b) => b.score - a.score);
    const selectedUser = scoredUsers[0];

    // Assign incident
    await base44.asServiceRole.entities.IncidentResponse.update(incident.id, {
      assigned_to: selectedUser.email,
      timeline: [
        ...(incident.timeline || []),
        {
          timestamp: new Date().toISOString(),
          event: 'Incident auto-assigned',
          actor: 'Automation Engine',
          details: `Assigned to ${selectedUser.name} (workload: ${selectedUser.workload})`,
          automated: true
        }
      ]
    });

    // Send notification
    await base44.asServiceRole.entities.Notification.create({
      notification_type: 'task_assigned',
      recipient_email: selectedUser.email,
      title: `New Incident Assigned: ${incident.incident_number}`,
      message: `You have been assigned to incident "${incident.title}" (${incident.severity} severity)`,
      link_url: `/IncidentResponse/${incident.id}`,
      metadata: {
        incident_id: incidentId,
        severity: incident.severity
      }
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: 'incident_auto_assigned',
      severity: 'info',
      description: `Incident ${incident.incident_number} auto-assigned to ${selectedUser.email}`,
      user_id: 'system',
      timestamp: new Date().toISOString(),
      success: true,
      metadata: {
        incident_id: incidentId,
        assigned_to: selectedUser.email,
        assignment_score: selectedUser.score,
        current_workload: selectedUser.workload
      }
    });

    return Response.json({
      success: true,
      assigned_to: selectedUser.email,
      assigned_name: selectedUser.name,
      current_workload: selectedUser.workload,
      assignment_reason: `Best match based on specialization and availability (score: ${selectedUser.score})`
    });
  } catch (error) {
    console.error('Assignment error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});