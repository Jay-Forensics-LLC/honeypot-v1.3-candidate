import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Loader2,
  ExternalLink,
  Activity
} from "lucide-react";
import { toast } from "sonner";

export default function AutomatedThreatScanner({ evidenceId, fileHash, onScanComplete }) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);

  const runScan = async () => {
    if (!evidenceId || !fileHash) {
      toast.error("Evidence ID and file hash required for scanning");
      return;
    }

    setScanning(true);
    setProgress(10);

    try {
      // Extract indicators from evidence
      const indicators = {
        file_hashes: [fileHash],
        ip_addresses: [],
        domains: [],
        urls: []
      };

      setProgress(30);

      // Run automated enrichment
      const { data } = await base44.functions.invoke('threatEnrichment', {
        evidence_id: evidenceId,
        indicators: indicators
      });

      setProgress(90);
      setResults(data);
      setProgress(100);

      // Notify user of results
      if (data.threats_found.length > 0) {
        toast.error(`⚠️ ${data.threats_found.length} threat(s) detected!`, {
          description: `Threat score: ${data.overall_threat_score}/100`
        });
      } else {
        toast.success("✅ No threats detected", {
          description: "Evidence appears clean"
        });
      }

      if (onScanComplete) {
        onScanComplete(data);
      }

    } catch (error) {
      console.error("Threat scan error:", error);
      toast.error("Threat scan failed", {
        description: error.message
      });
    } finally {
      setScanning(false);
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          Automated Threat Intelligence Scan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!scanning && !results && (
          <div className="text-center py-6">
            <p className="text-slate-400 mb-4">
              Scan this evidence against multiple threat intelligence sources
            </p>
            <Button 
              onClick={runScan}
              className="bg-gradient-to-r from-blue-600 to-purple-600"
            >
              <Activity className="w-4 h-4 mr-2" />
              Run Threat Scan
            </Button>
          </div>
        )}

        {scanning && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Scanning...</span>
              <span className="text-sm text-white font-semibold">{progress}%</span>
            </div>
            <Progress value={progress} className="w-full" />
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking VirusTotal, AbuseIPDB, URLScan.io...
            </div>
          </div>
        )}

        {results && (
          <div className="space-y-4">
            {/* Threat Score */}
            <div className={`p-4 rounded-lg border-2 ${
              results.overall_threat_score > 75 ? 'bg-red-500/10 border-red-500' :
              results.overall_threat_score > 50 ? 'bg-orange-500/10 border-orange-500' :
              results.overall_threat_score > 25 ? 'bg-yellow-500/10 border-yellow-500' :
              'bg-green-500/10 border-green-500'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-white">Overall Threat Score</h4>
                <span className={`text-2xl font-bold ${
                  results.overall_threat_score > 75 ? 'text-red-400' :
                  results.overall_threat_score > 50 ? 'text-orange-400' :
                  results.overall_threat_score > 25 ? 'text-yellow-400' :
                  'text-green-400'
                }`}>
                  {results.overall_threat_score}/100
                </span>
              </div>
              <Progress 
                value={results.overall_threat_score} 
                className={`w-full ${
                  results.overall_threat_score > 75 ? '[&>div]:bg-red-500' :
                  results.overall_threat_score > 50 ? '[&>div]:bg-orange-500' :
                  results.overall_threat_score > 25 ? '[&>div]:bg-yellow-500' :
                  '[&>div]:bg-green-500'
                }`}
              />
            </div>

            {/* Sources Checked */}
            <div>
              <h4 className="font-semibold text-white mb-2">Sources Checked</h4>
              <div className="flex flex-wrap gap-2">
                {results.sources_checked.map((source, idx) => (
                  <Badge key={idx} variant="outline" className="border-blue-500 text-blue-400">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {source}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Threats Found */}
            {results.threats_found.length > 0 && (
              <div>
                <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  Threats Detected ({results.threats_found.length})
                </h4>
                <div className="space-y-2">
                  {results.threats_found.map((threat, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded border border-slate-700">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{threat.source}</p>
                          <p className="text-xs text-slate-400">{threat.indicator_type}: {threat.indicator_value}</p>
                        </div>
                        <Badge className={
                          threat.threat_level === 'critical' ? 'bg-red-500' :
                          threat.threat_level === 'high' ? 'bg-orange-500' :
                          threat.threat_level === 'medium' ? 'bg-yellow-500' :
                          'bg-blue-500'
                        }>
                          {threat.threat_level?.toUpperCase()}
                        </Badge>
                      </div>
                      {threat.malicious_count && (
                        <p className="text-xs text-slate-400">
                          Detection: {threat.malicious_count} engines ({threat.detection_rate}%)
                        </p>
                      )}
                      {threat.permalink && (
                        <Button
                          size="sm"
                          variant="link"
                          className="text-blue-400 p-0 h-auto mt-2"
                          onClick={() => window.open(threat.permalink, '_blank')}
                        >
                          View Full Report <ExternalLink className="w-3 h-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {results.recommendations.length > 0 && (
              <div>
                <h4 className="font-semibold text-white mb-2">Recommended Actions</h4>
                <ul className="space-y-2">
                  {results.recommendations.map((rec, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-blue-400 mt-1">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Re-scan Button */}
            <Button 
              onClick={() => {
                setResults(null);
                setProgress(0);
                runScan();
              }}
              variant="outline"
              className="w-full border-slate-700"
            >
              <Activity className="w-4 h-4 mr-2" />
              Re-scan Evidence
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}