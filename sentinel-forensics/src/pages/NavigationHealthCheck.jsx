import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { navigationConfig, FEATURE_VISIBILITY, isRouteAllowed } from '@/components/config/navigationConfig';
import { validateNavigation, ROUTE_MANIFEST, runNavigationAudit } from '@/components/validation/NavigationValidator';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, Eye, Code } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/utils';

export default function NavigationHealthCheck() {
  const [auditResults, setAuditResults] = useState([]);
  const [navigationStats, setNavigationStats] = useState(null);
  const [testing, setTesting] = useState(false);
  const navigate = useNavigate();

  const runAudit = () => {
    setTesting(true);
    const results = validateNavigation(ROUTE_MANIFEST);
    setAuditResults(results);
    
    // Calculate stats
    const allNavItems = navigationConfig.flatMap(cat => cat.submenu);
    const publicItems = allNavItems.filter(item => item.visibility === FEATURE_VISIBILITY.PUBLIC);
    const betaItems = allNavItems.filter(item => item.visibility === FEATURE_VISIBILITY.BETA);
    const internalItems = allNavItems.filter(item => item.visibility === FEATURE_VISIBILITY.INTERNAL);
    
    setNavigationStats({
      totalItems: allNavItems.length,
      publicItems: publicItems.length,
      betaItems: betaItems.length,
      internalItems: internalItems.length,
      categories: navigationConfig.length,
      routesCovered: ROUTE_MANIFEST.length,
      issues: results.length
    });
    
    setTesting(false);
  };

  useEffect(() => {
    runAudit();
  }, []);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'CRITICAL': return 'destructive';
      case 'MEDIUM': return 'default';
      default: return 'secondary';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'CRITICAL': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'MEDIUM': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <CheckCircle className="h-4 w-4 text-blue-500" />;
    }
  };

  const testRoute = (page) => {
    try {
      navigate(createPageUrl(page));
    } catch (error) {
      console.error('Navigation test failed:', error);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Navigation Health Check</h1>
          <p className="text-muted-foreground mt-1">Runtime validation of navigation integrity</p>
        </div>
        <Button onClick={runAudit} disabled={testing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${testing ? 'animate-spin' : ''}`} />
          Re-run Audit
        </Button>
      </div>

      {/* Overall Health Card */}
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
          <CardDescription>Navigation configuration status</CardDescription>
        </CardHeader>
        <CardContent>
          {navigationStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-2xl font-bold">{navigationStats.totalItems}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Categories</p>
                <p className="text-2xl font-bold">{navigationStats.categories}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Routes Defined</p>
                <p className="text-2xl font-bold">{navigationStats.routesCovered}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Issues Found</p>
                <p className={`text-2xl font-bold ${navigationStats.issues === 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {navigationStats.issues}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tier Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">PUBLIC Tier</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{navigationStats?.publicItems}</p>
            <p className="text-xs text-muted-foreground mt-1">Core workflow pages</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">BETA Tier</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{navigationStats?.betaItems}</p>
            <p className="text-xs text-muted-foreground mt-1">Expert mode features</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">INTERNAL Tier</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">{navigationStats?.internalItems}</p>
            <p className="text-xs text-muted-foreground mt-1">Developer tools</p>
          </CardContent>
        </Card>
      </div>

      {/* Issues */}
      {auditResults.length === 0 ? (
        <Alert>
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-600 font-semibold">
            ✅ Navigation audit passed - all items have valid routes
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Issues Detected
            </CardTitle>
            <CardDescription>{auditResults.length} navigation issues require attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {auditResults.map((issue, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg">
                  {getSeverityIcon(issue.severity)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getSeverityColor(issue.severity)}>{issue.severity}</Badge>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{issue.type}</code>
                    </div>
                    <p className="text-sm">{issue.message}</p>
                    {issue.page && (
                      <p className="text-xs text-muted-foreground mt-1">Page: <code>{issue.page}</code></p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation Test Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Route Testing</CardTitle>
          <CardDescription>Click any item to test navigation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {navigationConfig.map((category, catIdx) => (
              <div key={catIdx} className="space-y-2">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  {category.name}
                  <Badge variant="outline">{category.submenu.length} items</Badge>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {category.submenu.map((item, itemIdx) => (
                    <Button
                      key={itemIdx}
                      variant="outline"
                      size="sm"
                      onClick={() => testRoute(item.page)}
                      className="justify-start text-xs"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      {item.name}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Console Output */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Console Audit
          </CardTitle>
          <CardDescription>Run full audit in browser console</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => runNavigationAudit()} variant="secondary">
            Run Console Audit
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Check browser DevTools console for detailed output
          </p>
        </CardContent>
      </Card>
    </div>
  );
}