import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, session_id, session_data, message } = await req.json();

    // REQUEST CONSULTATION
    if (action === 'request') {
      if (!session_data) {
        return Response.json({ error: 'session_data required' }, { status: 400 });
      }

      const session = await base44.asServiceRole.entities.ConsultationSession.create({
        organization_id: user.organization_id,
        requester_email: user.email,
        status: 'pending',
        transcript: [],
        ...session_data
      });

      // Notify expert (in production, send email/notification)
      await base44.integrations.Core.SendEmail({
        to: session_data.expert_email,
        subject: 'New Consultation Request',
        body: `${user.email} has requested a consultation on: ${session_data.topic}`
      });

      return Response.json({ success: true, session });
    }

    // ACCEPT/DECLINE CONSULTATION
    if (action === 'respond') {
      if (!session_id) {
        return Response.json({ error: 'session_id required' }, { status: 400 });
      }

      const sessions = await base44.entities.ConsultationSession.filter({ id: session_id });
      if (!sessions.length) {
        return Response.json({ error: 'Session not found' }, { status: 404 });
      }

      const session = sessions[0];
      
      // Only expert can respond
      if (session.expert_email !== user.email) {
        return Response.json({ error: 'Only expert can respond' }, { status: 403 });
      }

      const updates = {
        status: session_data.accept ? 'accepted' : 'declined'
      };

      if (session_data.accept) {
        updates.started_at = new Date().toISOString();
        updates.status = 'in_progress';
      }

      await base44.asServiceRole.entities.ConsultationSession.update(session_id, updates);

      return Response.json({ success: true });
    }

    // ADD MESSAGE TO TRANSCRIPT
    if (action === 'message') {
      if (!session_id || !message) {
        return Response.json({ error: 'session_id and message required' }, { status: 400 });
      }

      const sessions = await base44.entities.ConsultationSession.filter({ id: session_id });
      if (!sessions.length) {
        return Response.json({ error: 'Session not found' }, { status: 404 });
      }

      const session = sessions[0];
      const transcript = session.transcript || [];
      
      transcript.push({
        timestamp: new Date().toISOString(),
        sender: user.email,
        message
      });

      await base44.asServiceRole.entities.ConsultationSession.update(session_id, {
        transcript
      });

      return Response.json({ success: true });
    }

    // COMPLETE SESSION
    if (action === 'complete') {
      if (!session_id) {
        return Response.json({ error: 'session_id required' }, { status: 400 });
      }

      const sessions = await base44.entities.ConsultationSession.filter({ id: session_id });
      const session = sessions[0];

      const started = new Date(session.started_at);
      const now = new Date();
      const durationMinutes = Math.round((now - started) / 60000);

      await base44.asServiceRole.entities.ConsultationSession.update(session_id, {
        status: 'completed',
        completed_at: now.toISOString(),
        duration_minutes: durationMinutes,
        cost: session_data?.cost || null,
        rating: session_data?.rating || null,
        feedback: session_data?.feedback || null
      });

      // Update expert stats
      const profiles = await base44.entities.ExpertProfile.filter({ user_email: session.expert_email });
      if (profiles.length > 0) {
        const profile = profiles[0];
        await base44.asServiceRole.entities.ExpertProfile.update(profile.id, {
          total_consultations: (profile.total_consultations || 0) + 1,
          rating: session_data?.rating 
            ? ((profile.rating || 0) * (profile.total_consultations || 0) + session_data.rating) / ((profile.total_consultations || 0) + 1)
            : profile.rating
        });
      }

      return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Consultation management error:', error);
    return Response.json({
      error: 'Operation failed',
      details: error.message
    }, { status: 500 });
  }
});