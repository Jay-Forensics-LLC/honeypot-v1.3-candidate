import { base44 } from '@/api/base44Client';
import { logForensicEvent, ForensicEventTypes } from '../forensics/ForensicLogger';
import { securityEventStorage } from '../storage/AppendOnlyStorage';

/**
 * AI-POWERED THREAT TRIAGE SYSTEM
 * Automatic threat analysis, scoring, and prioritization
 */
class AIThreatTriageSystem {
  constructor() {
    this.triageQueue = [];
    this.processing = false;
  }

  /**
   * Triage incoming threat
   */
  async triageThreat(threat) {
    const startTime = Date.now();

    try {
      // AI-powered analysis
      const analysis = await this.analyzeThreat(threat);
      
      // Calculate priority score
      const priorityScore = this.calculatePriorityScore(threat, analysis);
      
      // Suggest containment actions
      const containmentActions = this.suggestContainment(threat, analysis);
      
      // Create triage result
      const triageResult = {
        threatId: threat.id || threat.threat_id,
        timestamp: new Date().toISOString(),
        analysisTime: Date.now() - startTime,
        severity: this.determineSeverity(priorityScore),
        priorityScore,
        confidence: analysis.confidence || 'medium',
        recommendation: analysis.recommendation,
        containmentActions,
        investigationPriority: this.determineInvestigationPriority(priorityScore),
        aiAnalysis: analysis,
        autoActions: this.determineAutoActions(threat, priorityScore)
      };

      // Store in append-only storage
      await securityEventStorage.append({
        eventType: 'threat_triage',
        data: triageResult
      });

      // Log triage decision
      await logForensicEvent(ForensicEventTypes.ALERT_TRIGGERED, {
        type: 'ai_threat_triage',
        threatId: triageResult.threatId,
        priorityScore: triageResult.priorityScore,
        severity: triageResult.severity,
        containmentActions: triageResult.containmentActions.length
      });

      return triageResult;
    } catch (error) {
      console.error('Threat triage failed:', error);
      
      // Log failure
      await logForensicEvent(ForensicEventTypes.SECURITY_BREACH, {
        type: 'triage_failure',
        error: error.message,
        threatId: threat.id || threat.threat_id
      });
      
      throw error;
    }
  }

  /**
   * AI-powered threat analysis
   */
  async analyzeThreat(threat) {
    const prompt = `You are an expert cybersecurity threat analyst. Analyze this threat and provide comprehensive triage assessment:

Threat Details:
- Type: ${threat.threat_type || threat.indicatorType || 'Unknown'}
- Severity: ${threat.severity || 'Unknown'}
- Target Platforms: ${threat.target_platforms?.join(', ') || threat.indicatorType || 'Unknown'}
- Indicators: ${JSON.stringify(threat.indicators || [])}
- Source: ${threat.source || 'Unknown'}
- Malicious: ${threat.malicious || false}
- Threat Score: ${threat.threatScore || threat.threat_score || 0}

Provide:
1. Confidence level (low/medium/high) for this threat
2. Immediate risks posed by this threat
3. Potential impact on organization
4. Recommended investigation priority (critical/high/medium/low)
5. Suggested initial response actions
6. Related MITRE ATT&CK techniques`;

    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            confidence: {
              type: 'string',
              enum: ['low', 'medium', 'high']
            },
            immediate_risks: {
              type: 'array',
              items: { type: 'string' }
            },
            potential_impact: {
              type: 'string'
            },
            investigation_priority: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low']
            },
            initial_response: {
              type: 'array',
              items: { type: 'string' }
            },
            mitre_techniques: {
              type: 'array',
              items: { type: 'string' }
            },
            recommendation: {
              type: 'string'
            },
            estimated_time_to_compromise: {
              type: 'string'
            }
          }
        }
      });

      return response;
    } catch (error) {
      console.error('AI analysis failed:', error);
      return {
        confidence: 'low',
        immediate_risks: ['Analysis unavailable'],
        recommendation: 'Manual review required',
        investigation_priority: 'medium'
      };
    }
  }

  /**
   * Calculate priority score (0-100)
   */
  calculatePriorityScore(threat, analysis) {
    let score = 0;

    // Base severity score
    const severityScores = {
      critical: 40,
      high: 30,
      medium: 20,
      low: 10,
      info: 5
    };
    score += severityScores[threat.severity] || 15;

    // Threat score contribution
    score += (threat.threatScore || 0) * 0.3;

    // Confidence multiplier
    const confidenceMultipliers = {
      high: 1.3,
      medium: 1.0,
      low: 0.7
    };
    score *= confidenceMultipliers[analysis.confidence] || 1.0;

    // Investigation priority boost
    const priorityBoosts = {
      critical: 20,
      high: 10,
      medium: 0,
      low: -10
    };
    score += priorityBoosts[analysis.investigation_priority] || 0;

    // Malicious flag boost
    if (threat.malicious) {
      score += 15;
    }

    // Multiple IOCs boost
    if (threat.indicators?.length > 5) {
      score += 10;
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Determine severity based on score
   */
  determineSeverity(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'info';
  }

  /**
   * Determine investigation priority
   */
  determineInvestigationPriority(score) {
    if (score >= 80) return 'immediate';
    if (score >= 60) return 'urgent';
    if (score >= 40) return 'normal';
    return 'low';
  }

  /**
   * Suggest containment actions
   */
  suggestContainment(threat, analysis) {
    const actions = [];

    // Platform-specific containment
    const platforms = threat.target_platforms || [threat.indicatorType];
    
    for (const platform of platforms) {
      switch (platform) {
        case 'windows':
          actions.push({
            action: 'Isolate Windows endpoints',
            priority: 'high',
            automated: true
          });
          actions.push({
            action: 'Deploy Windows Defender signature update',
            priority: 'medium',
            automated: true
          });
          break;
          
        case 'macos':
          actions.push({
            action: 'Enable XProtect updates',
            priority: 'high',
            automated: false
          });
          actions.push({
            action: 'Scan for malicious launch agents',
            priority: 'high',
            automated: true
          });
          break;
          
        case 'linux':
          actions.push({
            action: 'Update IDS/IPS rules',
            priority: 'high',
            automated: true
          });
          break;
          
        case 'ios':
          actions.push({
            action: 'Deploy MDM configuration profile',
            priority: 'high',
            automated: true
          });
          break;
          
        case 'android':
          actions.push({
            action: 'Push SafetyNet verification',
            priority: 'medium',
            automated: true
          });
          break;
      }
    }

    // Threat type specific actions
    if (threat.threat_type === 'malware' || threat.indicatorType === 'malware') {
      actions.push({
        action: 'Quarantine suspicious files',
        priority: 'critical',
        automated: true
      });
      actions.push({
        action: 'Block C2 domains/IPs at firewall',
        priority: 'critical',
        automated: true
      });
    }

    if (threat.threat_type === 'network_attack') {
      actions.push({
        action: 'Enable enhanced network monitoring',
        priority: 'high',
        automated: true
      });
      actions.push({
        action: 'Block malicious IP addresses',
        priority: 'critical',
        automated: true
      });
    }

    // Add AI-suggested actions
    if (analysis.initial_response) {
      analysis.initial_response.forEach(action => {
        actions.push({
          action,
          priority: 'medium',
          automated: false,
          source: 'AI'
        });
      });
    }

    return actions;
  }

  /**
   * Determine auto-actions
   */
  determineAutoActions(threat, priorityScore) {
    const autoActions = [];

    // Critical threats get immediate automated response
    if (priorityScore >= 80) {
      autoActions.push('create_alert');
      autoActions.push('notify_admins');
      autoActions.push('create_incident_ticket');
    }

    // High priority threats
    if (priorityScore >= 60) {
      autoActions.push('create_alert');
      autoActions.push('enrich_with_threat_intel');
    }

    // All threats get logged
    autoActions.push('log_to_audit');
    autoActions.push('update_threat_database');

    return autoActions;
  }

  /**
   * Batch triage multiple threats
   */
  async batchTriage(threats) {
    const results = [];

    for (const threat of threats) {
      try {
        const result = await this.triageThreat(threat);
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message, threat });
      }
    }

    return results;
  }

  /**
   * Get triage statistics
   */
  async getTriageStats() {
    try {
      const db = await import('../lib/OfflineDB').then(m => m.offlineDB);
      const events = await db.db.table('securityEvents')
        .where('eventType')
        .equals('threat_triage')
        .toArray();

      const last24h = events.filter(e => 
        Date.now() - new Date(e.timestamp).getTime() < 24 * 60 * 60 * 1000
      );

      return {
        total: events.length,
        last24h: last24h.length,
        bySeverity: {
          critical: last24h.filter(e => e.data.severity === 'critical').length,
          high: last24h.filter(e => e.data.severity === 'high').length,
          medium: last24h.filter(e => e.data.severity === 'medium').length,
          low: last24h.filter(e => e.data.severity === 'low').length
        },
        avgPriorityScore: last24h.length > 0
          ? last24h.reduce((sum, e) => sum + e.data.priorityScore, 0) / last24h.length
          : 0
      };
    } catch (error) {
      return null;
    }
  }
}

export const aiThreatTriage = new AIThreatTriageSystem();