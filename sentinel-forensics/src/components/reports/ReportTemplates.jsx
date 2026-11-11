import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Shield, Users, Activity, CheckCircle } from 'lucide-react';

const REPORT_TEMPLATES = [
  {
    id: 'threat_summary',
    name: 'Monthly Threat Summary',
    description: 'Comprehensive overview of detected threats, severity distribution, and mitigation status',
    icon: Shield,
    defaultWidgets: ['total_threats', 'threats_by_severity', 'threats_by_type', 'mitigation_timeline']
  },
  {
    id: 'uba_risk',
    name: 'UBA Risk Overview',
    description: 'User behavior analytics, risk scores, anomalies detected, and investigation status',
    icon: Users,
    defaultWidgets: ['high_risk_users', 'anomaly_distribution', 'risk_trend', 'department_risk']
  },
  {
    id: 'compliance',
    name: 'Compliance Report',
    description: 'Security posture, audit logs, access reviews, and compliance framework alignment',
    icon: CheckCircle,
    defaultWidgets: ['posture_score', 'audit_summary', 'access_reviews', 'compliance_gaps']
  },
  {
    id: 'incident_response',
    name: 'Incident Response Summary',
    description: 'Active incidents, response times, containment actions, and resolution status',
    icon: Activity,
    defaultWidgets: ['active_incidents', 'response_metrics', 'containment_actions', 'mttr']
  }
];

export default function ReportTemplates({ onSelectTemplate }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {REPORT_TEMPLATES.map(template => {
        const Icon = template.icon;
        return (
          <Card key={template.id} className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-all">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Icon className="w-5 h-5 text-blue-400" />
                {template.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-400">{template.description}</p>
              <Button
                onClick={() => onSelectTemplate(template)}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <FileText className="w-4 h-4 mr-2" />
                Generate Report
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export { REPORT_TEMPLATES };