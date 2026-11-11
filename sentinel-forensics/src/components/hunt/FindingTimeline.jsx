import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle, Shield, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function FindingTimeline({ findings }) {
  const sortedFindings = [...findings].sort((a, b) => 
    new Date(b.first_seen) - new Date(a.first_seen)
  );

  const getStatusIcon = (status) => {
    switch (status) {
      case 'new': return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'investigating': return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'contained': return <Shield className="w-4 h-4 text-green-400" />;
      case 'closed': return <CheckCircle className="w-4 h-4 text-blue-400" />;
      default: return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 text-red-400';
      case 'high': return 'bg-orange-500/20 text-orange-400';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400';
      case 'low': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-slate-700 text-slate-400';
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white">Findings Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-700" />

          <div className="space-y-4">
            {sortedFindings.map((finding) => (
              <div key={finding.id} className="relative pl-10">
                {/* Timeline dot */}
                <div className="absolute left-2 top-2 w-4 h-4 rounded-full bg-slate-900 border-2 border-slate-600 flex items-center justify-center">
                  {getStatusIcon(finding.status)}
                </div>

                <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-white mb-1">
                        {finding.title}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge className={getSeverityColor(finding.severity)}>
                          {finding.severity}
                        </Badge>
                        <Badge className="bg-slate-700 text-slate-300 text-xs">
                          {finding.category.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500">
                      {format(new Date(finding.first_seen), 'MMM d, h:mm a')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Risk Score: {finding.risk_score} • Confidence: {Math.round(finding.confidence * 100)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}