import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function FindingsList({ findings, onSelectFinding, filter }) {
  const filtered = findings.filter(f => {
    if (filter === 'all') return true;
    if (filter === 'high-priority') return f.severity === 'critical' || f.severity === 'high';
    if (filter === 'new') return f.status === 'new';
    return f.severity === filter || f.category === filter;
  });

  const sorted = filtered.sort((a, b) => b.risk_score - a.risk_score);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-slate-700 text-slate-400';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'new': return 'bg-blue-500/20 text-blue-400';
      case 'investigating': return 'bg-yellow-500/20 text-yellow-400';
      case 'contained': return 'bg-green-500/20 text-green-400';
      case 'false_positive': return 'bg-slate-700 text-slate-400';
      case 'closed': return 'bg-slate-800 text-slate-500';
      default: return 'bg-slate-700 text-slate-400';
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span>Hunt Findings</span>
          <Badge className="bg-slate-800 text-slate-300">
            {sorted.length} findings
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sorted.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No findings match the selected filter
            </div>
          ) : (
            sorted.map(finding => (
              <div
                key={finding.id}
                className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-white font-semibold">
                        {finding.title}
                      </h3>
                      <Badge className={getSeverityColor(finding.severity)}>
                        {finding.severity.toUpperCase()}
                      </Badge>
                      <Badge className={getStatusColor(finding.status)}>
                        {finding.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-slate-400 mb-3">
                      {finding.hypothesis}
                    </p>

                    <div className="grid grid-cols-3 gap-4 mb-2">
                      <div>
                        <p className="text-xs text-slate-500">Risk Score</p>
                        <p className={`text-lg font-semibold ${
                          finding.risk_score >= 75 ? 'text-red-400' : 
                          finding.risk_score >= 50 ? 'text-orange-400' : 
                          'text-yellow-400'
                        }`}>
                          {finding.risk_score}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Confidence</p>
                        <p className="text-lg font-semibold text-white">
                          {Math.round(finding.confidence * 100)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Blast Radius</p>
                        <p className="text-lg font-semibold text-white">
                          {finding.blast_radius?.count || 1}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-1 mb-2">
                      <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                        {finding.category.replace(/_/g, ' ')}
                      </Badge>
                      <Badge className="bg-slate-700 text-slate-300 text-xs">
                        {finding.primary_entity_type}
                      </Badge>
                    </div>

                    <p className="text-xs text-slate-500">
                      First seen: {finding.first_seen 
                        ? format(new Date(finding.first_seen), 'MMM d, h:mm a')
                        : 'Unknown'}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSelectFinding(finding)}
                    className="border-slate-700"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Details
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}