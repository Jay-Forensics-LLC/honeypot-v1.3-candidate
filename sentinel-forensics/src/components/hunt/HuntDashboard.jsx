import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, CheckCircle, TrendingUp, Loader2 } from 'lucide-react';

export default function HuntDashboard({ runs, findings, isLoading }) {
  if (isLoading) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-600 mx-auto" />
        </CardContent>
      </Card>
    );
  }

  const recentFindings = findings.slice(0, 10);
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const newCount = findings.filter(f => f.status === 'new').length;

  const categoryCounts = findings.reduce((acc, f) => {
    acc[f.category] = (acc[f.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="grid md:grid-cols-4 gap-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-400">
            Total Findings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-3xl font-bold text-white">
              {findings.length}
            </div>
            <Shield className="w-8 h-8 text-blue-400" />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {newCount} new this week
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-400">
            High Priority
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-3xl font-bold text-red-400">
              {criticalCount + highCount}
            </div>
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <div className="flex gap-2 mt-2">
            {criticalCount > 0 && (
              <Badge className="bg-red-500/20 text-red-400 text-xs">
                {criticalCount} CRITICAL
              </Badge>
            )}
            {highCount > 0 && (
              <Badge className="bg-orange-500/20 text-orange-400 text-xs">
                {highCount} HIGH
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-400">
            Hunt Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-3xl font-bold text-white">
              {runs.length}
            </div>
            <TrendingUp className="w-8 h-8 text-green-400" />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {runs.filter(r => r.status === 'completed').length} completed
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-400">
            Top Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(categoryCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">
                    {cat.replace(/_/g, ' ')}
                  </span>
                  <span className="text-white font-semibold">{count}</span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}