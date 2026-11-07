import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { report_type, start_date, end_date } = await req.json();

    if (!report_type || !start_date || !end_date) {
      return Response.json({ error: 'report_type, start_date, and end_date required' }, { status: 400 });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    // Fetch all playbook executions in the period
    const executions = await base44.asServiceRole.entities.PlaybookExecution.filter(
      { 
        organization_id: user.organization_id,
        started_at: { $gte: startDate.toISOString(), $lte: endDate.toISOString() }
      },
      '-started_at',
      1000
    );

    const playbooks = await base44.asServiceRole.entities.AutomatedPlaybook.filter(
      { organization_id: user.organization_id },
      '-created_date',
      100
    );

    // Calculate basic metrics
    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(e => e.status === 'completed').length;
    const failedExecutions = executions.filter(e => e.status === 'failed').length;
    const partialExecutions = executions.filter(e => e.status === 'partial').length;
    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    // Calculate MTTR (Mean Time To Respond)
    const mttrValues = executions
      .filter(e => e.started_at && e.completed_at)
      .map(e => {
        const start = new Date(e.started_at).getTime();
        const end = new Date(e.completed_at).getTime();
        return (end - start) / 1000; // seconds
      });

    const averageMttr = mttrValues.length > 0 
      ? mttrValues.reduce((a, b) => a + b, 0) / mttrValues.length 
      : 0;

    const sortedMttr = [...mttrValues].sort((a, b) => a - b);
    const medianMttr = sortedMttr.length > 0 
      ? sortedMttr[Math.floor(sortedMttr.length / 2)] 
      : 0;

    // Top playbooks by execution count
    const playbookStats = {};
    executions.forEach(exec => {
      if (!playbookStats[exec.playbook_id]) {
        playbookStats[exec.playbook_id] = {
          playbook_id: exec.playbook_id,
          playbook_name: exec.playbook_name,
          execution_count: 0,
          success_count: 0
        };
      }
      playbookStats[exec.playbook_id].execution_count++;
      if (exec.status === 'completed') {
        playbookStats[exec.playbook_id].success_count++;
      }
    });

    const topPlaybooks = Object.values(playbookStats)
      .map(stat => ({
        ...stat,
        success_rate: stat.execution_count > 0 
          ? (stat.success_count / stat.execution_count) * 100 
          : 0
      }))
      .sort((a, b) => b.execution_count - a.execution_count)
      .slice(0, 10);

    // Failure analysis
    const failuresByAction = {};
    executions.forEach(exec => {
      if (exec.actions_executed) {
        exec.actions_executed.forEach(action => {
          if (action.status === 'failed') {
            if (!failuresByAction[action.action_type]) {
              failuresByAction[action.action_type] = {
                action_type: action.action_type,
                failure_count: 0,
                common_errors: {}
              };
            }
            failuresByAction[action.action_type].failure_count++;
            if (action.error) {
              failuresByAction[action.action_type].common_errors[action.error] = 
                (failuresByAction[action.action_type].common_errors[action.error] || 0) + 1;
            }
          }
        });
      }
    });

    const failureAnalysis = Object.values(failuresByAction).map(fa => ({
      action_type: fa.action_type,
      failure_count: fa.failure_count,
      common_errors: Object.entries(fa.common_errors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([error]) => error)
    }));

    // Trigger analysis
    const triggerCounts = {};
    const severityCounts = {};

    executions.forEach(exec => {
      const trigger = exec.context?.trigger_type || 'unknown';
      triggerCounts[trigger] = (triggerCounts[trigger] || 0) + 1;

      const severity = exec.context?.severity || 'unknown';
      severityCounts[severity] = (severityCounts[severity] || 0) + 1;
    });

    const mostCommonTriggers = Object.entries(triggerCounts)
      .map(([trigger_type, count]) => ({ trigger_type, count }))
      .sort((a, b) => b.count - a.count);

    // Generate recommendations
    const recommendations = [];

    // Low success rate playbooks
    topPlaybooks.forEach(pb => {
      if (pb.success_rate < 70 && pb.execution_count > 5) {
        recommendations.push({
          type: 'action_required',
          title: `Low Success Rate: ${pb.playbook_name}`,
          description: `This playbook has a ${pb.success_rate.toFixed(1)}% success rate. Review failed actions and update configuration.`,
          playbook_id: pb.playbook_id
        });
      }
    });

    // High MTTR warning
    if (averageMttr > 300) { // 5 minutes
      recommendations.push({
        type: 'warning',
        title: 'High Response Time',
        description: `Average MTTR is ${Math.round(averageMttr)}s. Consider optimizing action sequences or reducing dependencies.`,
        playbook_id: null
      });
    }

    // Unused playbooks
    playbooks.forEach(pb => {
      const stats = playbookStats[pb.id];
      if (!stats && pb.enabled) {
        recommendations.push({
          type: 'optimization',
          title: `Unused Playbook: ${pb.name}`,
          description: 'This enabled playbook has no executions in the report period. Consider reviewing trigger conditions or disabling.',
          playbook_id: pb.id
        });
      }
    });

    // High failure action types
    failureAnalysis.forEach(fa => {
      if (fa.failure_count > 10) {
        recommendations.push({
          type: 'action_required',
          title: `High Failure Rate: ${fa.action_type}`,
          description: `This action type has failed ${fa.failure_count} times. Review error patterns: ${fa.common_errors.join(', ')}`,
          playbook_id: null
        });
      }
    });

    const report = await base44.asServiceRole.entities.PlaybookReport.create({
      report_type,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      metrics: {
        total_executions: totalExecutions,
        successful_executions: successfulExecutions,
        failed_executions: failedExecutions,
        partial_executions: partialExecutions,
        success_rate: Math.round(successRate * 10) / 10,
        average_mttr_seconds: Math.round(averageMttr * 10) / 10,
        median_mttr_seconds: Math.round(medianMttr * 10) / 10
      },
      top_playbooks: topPlaybooks,
      failure_analysis: failureAnalysis,
      trigger_analysis: {
        most_common_triggers: mostCommonTriggers,
        alert_severity_distribution: severityCounts
      },
      recommendations: recommendations,
      organization_id: user.organization_id
    });

    return Response.json({
      success: true,
      report_id: report.id,
      report
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});