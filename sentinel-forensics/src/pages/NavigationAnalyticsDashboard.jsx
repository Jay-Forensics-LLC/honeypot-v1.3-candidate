import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  analyzeNavigationPatterns, 
  getNavigationPaths, 
  calculateNavigationHealthScore 
} from '@/components/navigation/NavigationPatternAnalyzer';
import { getNavigationTelemetry, exportNavigationTelemetry, clearNavigationTelemetry } from '@/components/navigation/NavigationTelemetry';
import { Activity, TrendingUp, AlertTriangle, Download, Trash2, BarChart3 } from 'lucide-react';

export default function NavigationAnalyticsDashboard() {
  const [analysis, setAnalysis] = useState(null);
  const [paths, setPaths] = useState([]);
  const [healthScore, setHealthScore] = useState(100);
  const [rawTelemetry, setRawTelemetry] = useState(null);

  const refresh = () => {
    const newAnalysis = analyzeNavigationPatterns();
    const newPaths = getNavigationPaths();
    const newScore = calculateNavigationHealthScore();
    const telemetry = getNavigationTelemetry();

    setAnalysis(newAnalysis);
    setPaths(newPaths);
    setHealthScore(newScore);
    setRawTelemetry(telemetry);
  };

  useEffect(() => {
    refresh();
  }, []);

  const getHealthColor = (score) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'default';
      default: return 'secondary';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Navigation Analytics</h1>
          <p className="text-muted-foreground mt-1">Real-time navigation patterns and performance</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => exportNavigationTelemetry()} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
          <Button 
            onClick={() => {
              if (confirm('Clear all navigation telemetry?')) {
                clearNavigationTelemetry();
                refresh();
              }
            }} 
            variant="outline" 
            size="sm"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
          <Button onClick={refresh} size="sm">
            <Activity className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Health Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Navigation Health Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`text-6xl font-bold ${getHealthColor(healthScore)}`}>
                {healthScore.toFixed(0)}
              </span>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-semibold">{analysis?.successRate || 100}%</p>
              </div>
            </div>
            <Progress value={healthScore} className="h-3" />
            <p className="text-sm text-muted-foreground">
              {healthScore >= 90 && '✅ Excellent navigation health'}
              {healthScore >= 70 && healthScore < 90 && '⚠️ Good health with minor issues'}
              {healthScore < 70 && '🚨 Navigation health needs attention'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Events</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{rawTelemetry?.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Successful</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{rawTelemetry?.byType?.nav_success || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Failures</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">{rawTelemetry?.byType?.nav_failure || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Blocked</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-600">{rawTelemetry?.byType?.nav_blocked || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Common Paths */}
      {paths.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Common Navigation Paths
            </CardTitle>
            <CardDescription>Most frequent user journeys</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {paths.map((path, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm font-mono">{path.path}</span>
                  <Badge variant="outline">{path.count}x</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Problem Routes */}
      {analysis?.problemRoutes?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Problem Routes
            </CardTitle>
            <CardDescription>Routes with failures requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analysis.problemRoutes.map((route, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border border-red-200 rounded-lg bg-red-50">
                  <span className="text-sm font-semibold">{route.route}</span>
                  <Badge variant="destructive">{route.failures} failures</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {analysis?.recommendations?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analysis.recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg">
                  <AlertTriangle className="h-5 w-5 mt-0.5 text-yellow-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getSeverityColor(rec.severity)}>{rec.severity}</Badge>
                    </div>
                    <p className="text-sm">{rec.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event Type Breakdown */}
      {rawTelemetry?.byType && (
        <Card>
          <CardHeader>
            <CardTitle>Event Type Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(rawTelemetry.byType).map(([type, count]) => (
                <div key={type} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{type}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                  <Progress value={(count / rawTelemetry.total) * 100} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}