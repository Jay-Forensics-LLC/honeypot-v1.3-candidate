import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const assessmentId = `SPA-${Date.now()}`;
    const now = new Date().toISOString();

    // Gather data for posture assessment
    const [devices, alerts, complianceChecks, mfaSessions] = await Promise.all([
      base44.asServiceRole.entities.Device.filter({ organization_id: user.organization_id }),
      base44.asServiceRole.entities.Alert.filter({ 
        organization_id: user.organization_id,
        status: 'new'
      }),
      base44.asServiceRole.entities.ComplianceCheck.filter({ organization_id: user.organization_id }),
      base44.asServiceRole.entities.MFASession.filter({ organization_id: user.organization_id })
    ]);

    // Evaluate categories
    const evaluationCategories = {
      configuration_drift: {
        score: 0,
        findings: [],
        evidence_backed: true
      },
      missing_controls: {
        score: 0,
        findings: [],
        evidence_backed: true
      },
      excessive_permissions: {
        score: 0,
        findings: [],
        evidence_backed: false // Best practice check
      },
      weak_authentication: {
        score: 0,
        findings: [],
        evidence_backed: true
      },
      network_exposure: {
        score: 0,
        findings: [],
        evidence_backed: true
      },
      monitoring_blind_spots: {
        score: 0,
        findings: [],
        evidence_backed: true
      }
    };

    // Configuration drift: check compliance
    const nonCompliantDevices = devices.filter(d => d.compliance_status === 'fail');
    evaluationCategories.configuration_drift.score = 
      devices.length > 0 ? ((devices.length - nonCompliantDevices.length) / devices.length) * 100 : 100;
    if (nonCompliantDevices.length > 0) {
      evaluationCategories.configuration_drift.findings.push(
        `${nonCompliantDevices.length} devices are non-compliant with policy`
      );
    }

    // Missing controls: check disk encryption, firewall, EDR
    const devicesWithoutEncryption = devices.filter(d => !d.disk_encryption_enabled);
    const devicesWithoutFirewall = devices.filter(d => !d.firewall_enabled);
    const devicesWithoutEDR = devices.filter(d => !d.edr_present);
    
    const missingControlsCount = devicesWithoutEncryption.length + devicesWithoutFirewall.length + devicesWithoutEDR.length;
    const totalControlChecks = devices.length * 3;
    evaluationCategories.missing_controls.score = 
      totalControlChecks > 0 ? ((totalControlChecks - missingControlsCount) / totalControlChecks) * 100 : 100;
    
    if (devicesWithoutEncryption.length > 0) {
      evaluationCategories.missing_controls.findings.push(
        `${devicesWithoutEncryption.length} devices lack disk encryption`
      );
    }
    if (devicesWithoutFirewall.length > 0) {
      evaluationCategories.missing_controls.findings.push(
        `${devicesWithoutFirewall.length} devices have firewall disabled`
      );
    }

    // Weak authentication: check MFA usage
    const totalUsers = await base44.asServiceRole.entities.User.list();
    const mfaEnabledUsers = mfaSessions.filter(s => s.mfa_enabled).length;
    evaluationCategories.weak_authentication.score = 
      totalUsers.length > 0 ? (mfaEnabledUsers / totalUsers.length) * 100 : 0;
    if (mfaEnabledUsers < totalUsers.length) {
      evaluationCategories.weak_authentication.findings.push(
        `${totalUsers.length - mfaEnabledUsers} users do not have MFA enabled`
      );
    }

    // Network exposure: check critical alerts
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    evaluationCategories.network_exposure.score = criticalAlerts.length === 0 ? 100 : Math.max(0, 100 - (criticalAlerts.length * 10));
    if (criticalAlerts.length > 0) {
      evaluationCategories.network_exposure.findings.push(
        `${criticalAlerts.length} critical network alerts pending resolution`
      );
    }

    // Monitoring blind spots: check agent status
    const offlineDevices = devices.filter(d => d.agent_status === 'offline');
    evaluationCategories.monitoring_blind_spots.score = 
      devices.length > 0 ? ((devices.length - offlineDevices.length) / devices.length) * 100 : 100;
    if (offlineDevices.length > 0) {
      evaluationCategories.monitoring_blind_spots.findings.push(
        `${offlineDevices.length} devices have offline agents (monitoring gap)`
      );
    }

    // Calculate overall posture score (weighted average)
    const weights = {
      configuration_drift: 0.2,
      missing_controls: 0.25,
      excessive_permissions: 0.1,
      weak_authentication: 0.2,
      network_exposure: 0.15,
      monitoring_blind_spots: 0.1
    };

    const postureScore = Math.round(
      Object.entries(evaluationCategories).reduce((sum, [key, val]) => {
        return sum + (val.score * weights[key]);
      }, 0)
    );

    // Generate quick wins (low effort, high impact)
    const quickWins = [];
    
    if (devicesWithoutEncryption.length > 0 && devicesWithoutEncryption.length < 5) {
      quickWins.push({
        recommendation: `Enable disk encryption on ${devicesWithoutEncryption.length} devices`,
        effort_level: 'low',
        impact_level: 'high',
        framework_mapping: ['CIS Control 3.6', 'NIST CSF PR.DS-1'],
        evidence_backed: true
      });
    }

    if (mfaEnabledUsers < totalUsers.length) {
      quickWins.push({
        recommendation: 'Enforce MFA for all user accounts',
        effort_level: 'low',
        impact_level: 'high',
        framework_mapping: ['CIS Control 6.5', 'NIST CSF PR.AC-7'],
        evidence_backed: true
      });
    }

    if (offlineDevices.length > 0) {
      quickWins.push({
        recommendation: 'Investigate and restore offline monitoring agents',
        effort_level: 'medium',
        impact_level: 'high',
        framework_mapping: ['CIS Control 8.1', 'NIST CSF DE.CM-7'],
        evidence_backed: true
      });
    }

    // Create assessment record
    const assessment = await base44.asServiceRole.entities.SecurityPostureAssessment.create({
      organization_id: user.organization_id,
      assessment_id: assessmentId,
      assessment_date: now,
      posture_score: postureScore,
      score_explanation: `Score based on weighted evaluation of 6 security categories. Devices analyzed: ${devices.length}. Critical issues: ${criticalAlerts.length}.`,
      evaluation_categories: evaluationCategories,
      risk_categories_ranked: [
        { category: 'missing_controls', impact_level: 'high', affected_systems_count: devicesWithoutEncryption.length, priority: 1 },
        { category: 'weak_authentication', impact_level: 'high', affected_systems_count: totalUsers.length - mfaEnabledUsers, priority: 2 },
        { category: 'monitoring_blind_spots', impact_level: 'medium', affected_systems_count: offlineDevices.length, priority: 3 }
      ],
      quick_wins: quickWins,
      strategic_improvements: [
        {
          recommendation: 'Implement automated compliance monitoring and remediation workflows',
          effort_level: 'high',
          impact_level: 'high',
          timeframe: '3-6 months',
          framework_mapping: ['CIS Control 4', 'NIST CSF PR.IP-1'],
          evidence_backed: false
        }
      ],
      data_quality_metrics: {
        total_devices_assessed: devices.length,
        total_logs_analyzed: alerts.length,
        coverage_percentage: devices.length > 0 ? ((devices.length - offlineDevices.length) / devices.length) * 100 : 0,
        data_completeness_issues: offlineDevices.length > 0 ? [`${offlineDevices.length} devices offline`] : []
      }
    });

    return Response.json({
      success: true,
      assessment_id: assessmentId,
      assessment
    });

  } catch (error) {
    console.error('Posture assessment error:', error);
    return Response.json({
      error: 'Assessment failed',
      details: error.message
    }, { status: 500 });
  }
});