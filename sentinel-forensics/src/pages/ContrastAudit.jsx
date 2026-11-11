import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Play, Eye } from 'lucide-react';
import { auditPage } from '../components/utils/contrastChecker';

export default function ContrastAudit() {
  const [results, setResults] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const runAudit = () => {
    setIsRunning(true);
    // Delay to ensure UI updates before heavy computation
    setTimeout(() => {
      const auditResults = auditPage();
      setResults(auditResults);
      setIsRunning(false);
    }, 100);
  };

  const getSeverityColor = (ratio, threshold) => {
    const diff = ratio - threshold;
    if (diff >= 3) return 'text-green-400';
    if (diff >= 1) return 'text-yellow-400';
    if (diff >= 0) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Contrast Audit</h1>
            <p className="text-slate-400">WCAG 2.1 AA compliance checker (4.5:1 normal, 3:1 large text)</p>
          </div>
          <Button
            onClick={runAudit}
            disabled={isRunning}
            className="bg-red-600 hover:bg-red-700"
          >
            <Play className="w-4 h-4 mr-2" />
            {isRunning ? 'Running...' : 'Run Audit'}
          </Button>
        </div>

        {results && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">Total Checked</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">
                    {results.navigation.length + results.buttons.length + results.text.length}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">Navigation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-400">{results.navigation.length}</div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">Buttons</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-purple-400">{results.buttons.length}</div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">Failing</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-3xl font-bold ${results.failing.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {results.failing.length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Failing Elements */}
            {results.failing.length > 0 && (
              <Card className="bg-slate-900 border-red-800">
                <CardHeader>
                  <CardTitle className="text-red-400 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Failed Contrast Checks ({results.failing.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {results.failing.map((item, idx) => (
                      <div key={idx} className="p-4 bg-slate-800/50 rounded-lg border border-red-900/50">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <code className="text-sm text-white">{item.element}</code>
                            {item.isLargeText && (
                              <Badge className="ml-2 bg-blue-500/20 text-blue-300 text-xs">Large Text</Badge>
                            )}
                          </div>
                          <span className="text-red-400 font-bold">{item.ratio}:1</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded border border-slate-600" style={{ backgroundColor: item.color }} />
                            <span className="text-slate-400">Text: {item.color}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded border border-slate-600" style={{ backgroundColor: item.bgColor }} />
                            <span className="text-slate-400">BG: {item.bgColor}</span>
                          </div>
                          <span className="text-slate-500">Required: {item.threshold}:1</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Passing Navigation (Priority) */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Eye className="w-5 h-5 text-blue-400" />
                  Navigation Elements ({results.navigation.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {results.navigation.map((item, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/30 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {item.passes ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                        )}
                        <code className="text-sm text-slate-300">{item.element}</code>
                      </div>
                      <span className={`font-mono text-sm ${getSeverityColor(parseFloat(item.ratio), item.threshold)}`}>
                        {item.ratio}:1
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* All Passing */}
            {results.failing.length === 0 && (
              <Card className="bg-green-900/20 border-green-800">
                <CardContent className="p-8 text-center">
                  <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-green-400 mb-2">All Checks Passed!</h3>
                  <p className="text-slate-400">All elements meet WCAG 2.1 AA standards</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!results && (
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-12 text-center">
              <Eye className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Ready to Audit</h3>
              <p className="text-slate-400 mb-6">Click "Run Audit" to check contrast ratios across the app</p>
              <p className="text-sm text-slate-500">
                Prioritizes navigation elements, then buttons, then all text
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}