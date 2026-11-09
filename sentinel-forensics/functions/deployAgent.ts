import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { device_ids, agent_version, auto_update } = await req.json();

    const deployments = [];

    for (const device_id of device_ids) {
      const deployment = await base44.entities.DeploymentJob.create({
        organization_id: user.organization_id,
        device_id,
        job_type: 'agent_deployment',
        status: 'queued',
        parameters: {
          agent_version: agent_version || 'latest',
          auto_update: auto_update !== false
        }
      });
      deployments.push(deployment);
    }

    return Response.json({
      success: true,
      deployment_count: deployments.length,
      deployments: deployments.map(d => d.id)
    });

  } catch (error) {
    console.error('Agent deployment error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});