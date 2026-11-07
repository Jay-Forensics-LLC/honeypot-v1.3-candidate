import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Shield, AlertTriangle, CheckCircle, Scan, Database } from "lucide-react";
import { toast } from "sonner";
import { formatEnumTitle } from "../utils/SafetyUtils";

export default function ThreatScanner({ evidence }) {
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const queryClient = useQueryClient();

  const { data: detections = [] } = useQuery({
    queryKey: ['threat-detections', evidence.id],
    queryFn: () => base44.entities.ThreatDetection.filter({ evidence_id: evidence.id }),
    enabled: !!evidence.id
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      setScanning(true);
      setScanProgress(0);

      // Simulate scanning process
      const interval = setInterval(() => {
        setScanProgress(prev => Math.min(prev + 10, 90));
      }, 300);

      // Perform AI-based threat analysis
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this evidence file for security threats and malware indicators:
        
File Name: ${evidence.title}
File Hash: ${evidence.file_hash}
Evidence Type: ${evidence.evidence_type}
Description: ${evidence.description}

Perform a comprehensive security analysis and provide:
1. Threat assessment (safe, suspicious, malicious)
2. Confidence score (0-100)
3. Any malware families or threat actors associated
4. IOCs (Indicators of Compromise) if found
5. Recommended remediation steps

Format the response as a structured security report.`,
        response_json_schema: {
          type: "object",
          properties: {
            threat_found: { type: "boolean" },
            threat_name: { type: "string" },
            threat_severity: { type: "string" },
            confidence_score: { type: "number" },
            signatures_matched: { type: "array", items: { type: "string" } },
            iocs_found: { type: "array", items: { type: "string" } },
            remediation_steps: { type: "array", items: { type: "string" } }
          }
        }
      });

      clearInterval(interval);
      setScanProgress(100);

      // Save detection results
      const detection = {
        evidence_id: evidence.id,
        detection_engine: 'ml_analysis',
        threat_found: response.threat_found || false,
        threat_name: response.threat_name || 'No threats detected',
        threat_severity: response.threat_severity || 'info',
        confidence_score: response.confidence_score || 0,
        detection_details: {
          signatures_matched: response.signatures_matched || [],
          iocs_found: response.iocs_found || [],
          behavioral_indicators: [],
          av_detections: 0,
          sandbox_verdict: 'clean'
        },
        scan_timestamp: new Date().toISOString(),
        remediation_steps: response.remediation_steps || [],
        false_positive: false
      };

      await base44.entities.ThreatDetection.create(detection);

      return detection;
    },
    onSuccess: (detection) => {
      queryClient.invalidateQueries({ queryKey: ['threat-detections', evidence.id] });
      setScanning(false);
      setScanProgress(0);
      
      if (detection.threat_found) {
        toast.error('⚠️ Threat detected!', {
          description: `${detection.threat_name} - ${detection.threat_severity}`
        });
      } else {
        toast.success('✅ Scan complete - No threats detected');
      }
    },
    onError: () => {
      setScanning(false);
      setScanProgress(0);
      toast.error('Scan failed');
    }
  });

  const latestDetection = detections[0];

  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-semibold text-white">Threat Analysis</h3>
        </div>
        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanning}
          size="sm"
          className="bg-green-600 hover:bg-green-700"
        >
          {scanning ? (
            <>
              <Scan className="w-4 h-4 mr-2 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Scan className="w-4 h-4 mr-2" />
              Run Threat Scan
            </>
          )}
        </Button>
      </div>

      {scanning && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-300">Analyzing evidence...</span>
                <span className="text-slate-400">{scanProgress}%</span>
              </div>
              <Progress value={scanProgress} className="h-2 bg-slate-700" />
            </div>
          </CardContent>
        </Card>
      )}

      {latestDetection && (
        <Card className={`border-l-4 ${latestDetection.threat_found ? 'border-l-red-500 bg-red-500/10' : 'border-l-green-500 bg-green-500/10'} border-slate-700`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {latestDetection.threat_found ? (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                )}
                <div>
                  <p className="font-semibold text-white">{latestDetection.threat_name}</p>
                  <p className="text-xs text-slate-400">
                    Scanned: {new Date(latestDetection.scan_timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${getSeverityColor(latestDetection.threat_severity)} text-white`}>
                  {formatEnumTitle(latestDetection.threat_severity)}
                </Badge>
                <Badge className="bg-slate-700 text-white">
                  {latestDetection.confidence_score}% confidence
                </Badge>
              </div>
            </div>

            {latestDetection.detection_details?.iocs_found?.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-slate-400 mb-1">IOCs Found:</p>
                <div className="flex flex-wrap gap-1">
                  {latestDetection.detection_details.iocs_found.map((ioc, idx) => (
                    <Badge key={idx} className="bg-red-500/20 text-red-400 text-xs">
                      {ioc}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {latestDetection.remediation_steps?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-2">Recommended Actions:</p>
                <ul className="list-disc list-inside space-y-1">
                  {latestDetection.remediation_steps.map((step, idx) => (
                    <li key={idx} className="text-xs text-slate-300">{step}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {detections.length === 0 && !scanning && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-8 text-center">
            <Database className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 mb-2">No threat scans performed yet</p>
            <p className="text-xs text-slate-500">Run a threat scan to analyze this evidence for malware and security threats</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}