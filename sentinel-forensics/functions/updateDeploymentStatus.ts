import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Update Deployment Status
 * 
 * Updates deployment job progress based on agent check-ins
 * Called periodically to sync deployment status
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { job_id } = await req.json();

        if (!job_id) {
            return Response.json({ error: 'job_id required' }, { status: 400 });
        }

        // Get deployment job
        const jobs = await base44.asServiceRole.entities.DeploymentJob.filter({ job_id });
        
        if (!jobs || jobs.length === 0) {
            return Response.json({ error: 'Job not found' }, { status: 404 });
        }

        const job = jobs[0];

        // Get all agents enrolled with this deployment's token
        const enrolledAgents = await base44.asServiceRole.entities.EndpointAgent.filter({});

        // Update endpoint statuses based on agent check-ins
        const updatedStatuses = job.endpoint_statuses.map(endpoint => {
            // Check if agent enrolled for this hostname
            const agent = enrolledAgents.find(a => 
                a.hostname?.toLowerCase() === endpoint.hostname?.toLowerCase() &&
                a.enrolled_at >= job.started_at
            );

            if (agent) {
                return {
                    ...endpoint,
                    status: 'completed',
                    agent_id: agent.agent_id,
                    installed_version: agent.agent_version,
                    completed_at: agent.enrolled_at,
                    last_heartbeat: agent.last_heartbeat
                };
            }

            // Check if still pending too long (timeout after 30 min)
            const startTime = new Date(endpoint.started_at).getTime();
            const now = new Date().getTime();
            const elapsedMinutes = (now - startTime) / 1000 / 60;

            if (elapsedMinutes > 30 && endpoint.status === 'pending') {
                return {
                    ...endpoint,
                    status: 'failed',
                    error_message: 'Installation timeout - agent did not check in within 30 minutes'
                };
            }

            return endpoint;
        });

        // Calculate progress
        const succeeded = updatedStatuses.filter(e => e.status === 'completed').length;
        const failed = updatedStatuses.filter(e => e.status === 'failed').length;
        const inProgress = updatedStatuses.filter(e => 
            ['downloading', 'installing', 'configuring', 'verifying'].includes(e.status)
        ).length;
        const pending = updatedStatuses.filter(e => e.status === 'pending').length;

        const percentage = job.total_targets > 0 ? 
            Math.round(((succeeded + failed) / job.total_targets) * 100) : 0;

        // Determine overall status
        let overallStatus = job.status;
        
        if (succeeded + failed === job.total_targets) {
            overallStatus = failed === 0 ? 'completed' : 
                           succeeded === 0 ? 'failed' : 'partial';
        } else if (succeeded > 0 || failed > 0 || inProgress > 0) {
            overallStatus = 'deploying';
        }

        // Calculate duration if completed
        let duration = null;
        if (overallStatus === 'completed' || overallStatus === 'partial' || overallStatus === 'failed') {
            const start = new Date(job.started_at).getTime();
            const end = new Date().getTime();
            duration = Math.round((end - start) / 1000 / 60);
        }

        // Update job
        const updateData = {
            status: overallStatus,
            progress: {
                total: job.total_targets,
                pending,
                in_progress: inProgress,
                succeeded,
                failed,
                percentage
            },
            endpoint_statuses: updatedStatuses
        };

        if (duration !== null) {
            updateData.completed_at = new Date().toISOString();
            updateData.duration_minutes = duration;
        }

        await base44.asServiceRole.entities.DeploymentJob.update(job.id, updateData);

        // Send notification if completed
        if (overallStatus === 'completed' && job.status !== 'completed') {
            await base44.asServiceRole.entities.Notification.create({
                notification_type: 'system',
                recipient_email: job.initiated_by,
                title: 'Deployment Completed',
                message: `Deployment "${job.deployment_name}" completed successfully. ${succeeded}/${job.total_targets} agents deployed.`,
                link_url: '/AgentDeployment',
                metadata: { job_id: job.job_id }
            });
        }

        return Response.json({
            success: true,
            job_id: job.job_id,
            status: overallStatus,
            progress: updateData.progress,
            succeeded,
            failed,
            pending,
            in_progress: inProgress,
            percentage
        });

    } catch (error) {
        console.error('Deployment status update error:', error);
        return Response.json({
            error: 'Status update failed',
            message: error.message
        }, { status: 500 });
    }
});