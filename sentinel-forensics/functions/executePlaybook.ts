import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { playbook_id, case_id, is_drill = false } = await req.json();

    if (!playbook_id) {
      return Response.json({ error: 'playbook_id required' }, { status: 400 });
    }

    // Fetch playbook
    const playbooks = await base44.entities.IncidentPlaybook.filter({ id: playbook_id });
    if (!playbooks.length) {
      return Response.json({ error: 'Playbook not found' }, { status: 404 });
    }
    const playbook = playbooks[0];

    // Create execution record
    const execution = {
      playbook_name: playbook.name,
      started_at: new Date().toISOString(),
      started_by: user.email,
      is_drill,
      steps: []
    };

    // Execute automated steps
    const automatedSteps = playbook.steps.filter(s => s.action_type === 'automated');
    
    for (const step of automatedSteps) {
      const stepStart = Date.now();
      
      try {
        // Simulate automated action (in production, call actual integrations)
        await new Promise(resolve => setTimeout(resolve, 100));

        execution.steps.push({
          step_number: step.step_number,
          title: step.title,
          status: 'completed',
          completed_at: new Date().toISOString(),
          time_taken_ms: Date.now() - stepStart,
          automated: true
        });

      } catch (error) {
        execution.steps.push({
          step_number: step.step_number,
          title: step.title,
          status: 'failed',
          error: error.message,
          automated: true
        });
      }
    }

    // Create tasks for manual steps
    const manualSteps = playbook.steps.filter(s => s.action_type === 'manual');
    const tasks = [];

    for (const step of manualSteps) {
      if (case_id) {
        const task = await base44.asServiceRole.entities.CaseTask.create({
          organization_id: user.organization_id,
          case_id,
          title: step.title,
          description: step.description,
          assigned_to: step.assigned_role,
          priority: 'high',
          status: 'open',
          metadata: {
            playbook_id,
            step_number: step.step_number,
            estimated_duration_minutes: step.estimated_duration_minutes
          }
        });
        tasks.push(task);
      }
    }

    // Log execution
    await base44.asServiceRole.entities.CaseActivity.create({
      organization_id: user.organization_id,
      case_id: case_id || null,
      activity_type: 'evidence_added',
      actor_email: user.email,
      description: `${is_drill ? 'DRILL: ' : ''}Executed playbook: ${playbook.name}`,
      metadata: {
        playbook_id,
        automated_steps: execution.steps.length,
        manual_tasks_created: tasks.length
      },
      timestamp: new Date().toISOString()
    });

    // Update playbook last used
    await base44.asServiceRole.entities.IncidentPlaybook.update(playbook_id, {
      last_used: new Date().toISOString()
    });

    return Response.json({
      success: true,
      execution,
      tasks_created: tasks.length,
      automated_steps_completed: execution.steps.filter(s => s.status === 'completed').length
    });

  } catch (error) {
    console.error('Playbook execution error:', error);
    return Response.json({
      error: 'Execution failed',
      details: error.message
    }, { status: 500 });
  }
});