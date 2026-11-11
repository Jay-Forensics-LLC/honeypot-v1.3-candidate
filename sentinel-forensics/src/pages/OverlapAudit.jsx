import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Play, Navigation } from 'lucide-react';
import { auditPage } from '../components/utils/overlapDetector';

export default function OverlapAudit() {
  const [results, setResults] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const runAudit = () => {
    setIsRunning(true);
    setTimeout(() => {
      const auditResults = auditPage();
      setResults(auditResults);
      setIsRunning(false);
    }, 100);
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return 'text-red-400';
      case 'medium': return 'text-orange-400';
      case 'low': return 'text-yellow-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Button Overlap Audit</h1>
            <p className="text-slate-400">Detects overlapping interactive elements (buttons, links)</p>
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
                  <CardTitle className="text-sm text-slate-400">Navigation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-400">{results.navigation.length}</div>
                  <p className="text-xs text-slate-500 mt-1">Priority elements</p>
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
                  <CardTitle className="text-sm text-slate-400">Links</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-cyan-400">{results.links.length}</div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">Overlapping</CardTitle>
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
                    Overlapping Elements ({results.failing.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {results.failing.map((item, idx) => (
                      <div key={idx} className="p-4 bg-slate-800/50 rounded-lg border border-red-900/50">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <code className="text-sm text-white block mb-2">{item.element}</code>
                            <div className="flex items-center gap-2">
                              <Badge className={`${getSeverityColor(item.severity)} bg-slate-900`}>
                                {item.severity.toUpperCase()}
                              </Badge>
                              <span className="text-xs text-slate-400">
                                {item.position.width.toFixed(0)}×{item.position.height.toFixed(0)}px
                              </span>
                            </div>
                          </div>
                          <span className="text-red-400 font-bold">
                            {item.overlaps.length} overlap{item.overlaps.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        
                        <div className="space-y-2 pl-4 border-l-2 border-red-900/50">
                          {item.overlaps.map((overlap, oidx) => (
                            <div key={oidx} className="text-xs text-slate-400">
                              <span className="text-red-300">↳</span> {overlap.element}
                              <span className="ml-2 text-slate-500">
                                ({overlap.overlapArea.toFixed(0)}px² overlap)
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-500">
                          <strong>Spacing:</strong> margin: {item.spacing.marginTop}px/{item.spacing.marginBottom}px, 
                          padding: {item.spacing.paddingTop}px/{item.spacing.paddingBottom}px
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Navigation Elements (Priority) */}
            {results.navigation.length > 0 && (
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-blue-400" />
                    Navigation Elements ({results.navigation.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {results.navigation.map((item, idx) => (
                      <div key={idx} className="p-3 bg-slate-800/30 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {item.overlaps.length === 0 ? (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                          )}
                          <code className="text-sm text-slate-300">{item.element}</code>
                        </div>
                        {item.overlaps.length > 0 && (
                          <Badge className="bg-red-900/50 text-red-300">
                            {item.overlaps.length} overlap{item.overlaps.length > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* All Passing */}
            {results.failing.length === 0 && (
              <Card className="bg-green-900/20 border-green-800">
                <CardContent className="p-8 text-center">
                  <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-green-400 mb-2">No Overlaps Detected!</h3>
                  <p className="text-slate-400">All interactive elements have proper spacing</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!results && (
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-12 text-center">
              <Navigation className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Ready to Audit</h3>
              <p className="text-slate-400 mb-6">Click "Run Audit" to detect overlapping buttons and links</p>
              <p className="text-sm text-slate-500">
                Prioritizes navigation elements, then buttons, then links
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}