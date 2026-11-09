import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Shield, AlertTriangle } from 'lucide-react';
import { threatIntelligenceService } from './ThreatIntelligenceService';
import { ThreatToEvidenceConverter, RemediationSteps } from './ThreatToEvidenceConverter';
import { toast } from 'sonner';

/**
 * LIVE THREAT SCANNER
 * Real-time threat intelligence enrichment with add-to-evidence
 */
export default function LiveThreatScanner() {
  const [indicator, setIndicator] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [indicatorType, setIndicatorType] = useState('ip');

  async function handleScan() {
    if (!indicator.trim()) {
      toast.error('Please enter an IP or domain');
      return;
    }

    setScanning(true);
    setResult(null);

    try {
      let enrichment;
      
      if (indicatorType === 'ip') {
        enrichment = await threatIntelligenceService.enrichIP(indicator.trim());
      } else {
        enrichment = await threatIntelligenceService.enrichDomain(indicator.trim());
      }

      setResult(enrichment);

      if (enrichment.malicious) {
        toast.error(`Malicious ${indicatorType.toUpperCase()} detected!`, {
          description: `Threat score: ${enrichment.threatScore}/100`
        });
      } else {
        toast.success('Scan complete - No threats detected');
      }
    } catch (error) {
      console.error('Scan failed:', error);
      toast.error('Scan failed', {
        description: error.message
      });
    } finally {
      setScanning(false);
    }
  }

  const getSeverityBadge = (score) => {
    if (score >= 80) return { label: 'CRITICAL', class: 'bg-red-500/20 text-red-300 border-red-500/50' };
    if (score >= 60) return { label: 'HIGH', class: 'bg-orange-500/20 text-orange-300 border-orange-500/50' };
    if (score >= 40) return { label: 'MEDIUM', class: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' };
    if (score >= 20) return { label: 'LOW', class: 'bg-blue-500/20 text-blue-300 border-blue-500/50' };
    return { label: 'INFO', class: 'bg-green-500/20 text-green-300 border-green-500/50' };
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Live Threat Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex gap-2 flex-1">
              <select
                value={indicatorType}
                onChange={(e) => setIndicatorType(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-md px-3 text-white text-sm"
              >
                <option value="ip">IP Address</option>
                <option value="domain">Domain</option>
              </select>
              <Input
                value={indicator}
                onChange={(e) => setIndicator(e.target.value)}
                placeholder={indicatorType === 'ip' ? 'Enter IP address...' : 'Enter domain...'}
                className="flex-1 bg-slate-800 border-slate-700 text-white"
                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              />
            </div>
            <Button
              onClick={handleScan}
              disabled={scanning || !indicator.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {scanning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Scan
                </>
              )}
            </Button>
          </div>

          {result && (
            <div className="space-y-4 mt-6">
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  {result.malicious ? (
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  ) : (
                    <Shield className="w-6 h-6 text-green-400" />
                  )}
                  <div>
                    <p className="font-semibold text-white">{result.indicator}</p>
                    <p className="text-sm text-slate-400">
                      {result.malicious ? 'Malicious indicator detected' : 'Clean - No threats found'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">{result.threatScore}</p>
                    <p className="text-xs text-slate-400">Threat Score</p>
                  </div>
                  <Badge variant="outline" className={getSeverityBadge(result.threatScore).class}>
                    {getSeverityBadge(result.threatScore).label}
                  </Badge>
                </div>
              </div>

              {/* Source Results */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-white">Intelligence Sources:</p>
                {result.sources.map((source, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-800/30 rounded">
                    <div>
                      <p className="text-sm text-white">{source.provider}</p>
                      {source.error ? (
                        <p className="text-xs text-red-400">Error: {source.error}</p>
                      ) : (
                        <p className="text-xs text-slate-400">
                          {source.malicious ? '⚠️ Flagged as malicious' : '✓ Clean'}
                          {source.details?.positives > 0 && ` • ${source.details.positives}/${source.details.total} detections`}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className={source.malicious ? 'text-red-400 border-red-500/30' : 'text-green-400 border-green-500/30'}>
                      {source.confidence}
                    </Badge>
                  </div>
                ))}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                {result.tags?.map((tag, idx) => (
                  <Badge key={idx} variant="outline" className="text-slate-300 border-slate-600">
                    {tag}
                  </Badge>
                ))}
              </div>

              {/* Add to Evidence */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                <p className="text-sm text-slate-400">Preserve this threat as evidence?</p>
                <ThreatToEvidenceConverter threat={result} />
              </div>

              {/* Remediation Steps */}
              {result.malicious && (
                <RemediationSteps threat={result} />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}