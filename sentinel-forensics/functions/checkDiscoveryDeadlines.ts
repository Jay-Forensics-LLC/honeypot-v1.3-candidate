import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { legal_case_id } = await req.json();

    const legalCase = await base44.entities.LegalCase.filter({ id: legal_case_id });
    if (!legalCase || legalCase.length === 0) {
      return Response.json({ error: 'Legal case not found' }, { status: 404 });
    }

    const caseData = legalCase[0];
    const deadlines = caseData.discovery_deadlines || {};
    const now = new Date();
    const alerts = [];

    const checkDeadline = (deadlineName, deadlineDate) => {
      if (!deadlineDate) return;
      
      const deadline = new Date(deadlineDate);
      const daysUntil = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
      
      if (daysUntil < 0) {
        alerts.push({
          type: 'overdue',
          severity: 'critical',
          deadline: deadlineName,
          date: deadlineDate,
          message: `${deadlineName} deadline has passed (${Math.abs(daysUntil)} days overdue)`
        });
      } else if (daysUntil <= 7) {
        alerts.push({
          type: 'urgent',
          severity: 'high',
          deadline: deadlineName,
          date: deadlineDate,
          message: `${deadlineName} deadline in ${daysUntil} days`
        });
      } else if (daysUntil <= 30) {
        alerts.push({
          type: 'upcoming',
          severity: 'medium',
          deadline: deadlineName,
          date: deadlineDate,
          message: `${deadlineName} deadline in ${daysUntil} days`
        });
      }
    };

    checkDeadline('Initial Disclosure', deadlines.initial_disclosure);
    checkDeadline('Expert Reports', deadlines.expert_reports);
    checkDeadline('Pretrial Motions', deadlines.pretrial_motions);
    checkDeadline('Trial Date', deadlines.trial_date);

    for (const alert of alerts.filter(a => a.severity === 'critical' || a.severity === 'high')) {
      await base44.entities.Notification.create({
        organization_id: user.organization_id,
        user_email: user.email,
        type: 'deadline_alert',
        title: `Discovery Deadline Alert: ${alert.deadline}`,
        message: alert.message,
        severity: alert.severity,
        read: false
      });
    }

    return Response.json({
      success: true,
      total_alerts: alerts.length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      urgent: alerts.filter(a => a.severity === 'high').length,
      alerts
    });

  } catch (error) {
    console.error('Deadline check error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});