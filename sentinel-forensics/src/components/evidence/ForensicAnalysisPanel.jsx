import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Microscope, 
  Shield, 
  Database, 
  Loader2,
  AlertTriangle,
  CheckCircle,
  Activity,
  FileSearch,
  Network
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ForensicAnalysisPanel({ evidenceId, existingAnalysis }) {
  const [loading, setLoading] = useState({
    disk: false,
    malware: false,
    ioc: false
  });
  const [results, setResults] = useState({
    disk: existingAnalysis?.disk_analysis || null,
    malware: existingAnalysis?.malware_analysis || null,
    ioc: existingAnalysis?.ioc_enrichment || null
  });

  const runDiskAnalysis = async () => {
    setLoading(prev => ({ ...prev, disk: true }));
    try {
      const { data } = await base44.functions.invoke('forensicDiskAnalysis', { 
        evidence_id: evidenceId 
      });
      setResults(prev => ({ ...prev, disk: data.analysis }));
      toast.success('Disk analysis completed');
    } catch (error) {
      toast.error('Disk analysis failed: ' + error.message);
    } finally {
      setLoading(prev => ({ ...prev, disk: false }));
    }
  };

  const runMalwareAnalysis = async () => {
    setLoading(prev => ({ ...prev, malware: true }));
    try {
      const { data } = await base44.functions.invoke('malwareSignatureAnalysis', { 
        evidence_id: evidenceId 
      });
      setResults(prev => ({ ...prev, malware: data.analysis }));
      toast.success('Malware analysis completed');
    } catch (error) {
      toast.error('Malware analysis failed: ' + error.message);
    } finally {
      setLoading(prev => ({ ...prev, malware: false }));
    }
  };

  const runIOCEnrichment = async () => {
    setLoading(prev => ({ ...prev, ioc: true }));
    try {
      const { data } = await base44.functions.invoke('enrichEvidenceWithIOC', { 
        evidence_id: evidenceId 
      });
      setResults(prev => ({ ...prev, ioc: data.enrichment }));
      toast.success('IOC enrichment completed');
    } catch (error) {
      toast.error('IOC enrichment failed: ' + error.message);
    } finally {
      setLoading(prev => ({ ...prev, ioc: false }));
    }
  };

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/30',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      low: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    };
    return colors[severity] || colors.low;
  };

  return (
    <div className="space-y-4">
      {/* Analysis Actions */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Microscope className="w-5 h-5" />
            Forensic Analysis Tools
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-3">
            <Button
              onClick={runDiskAnalysis}
              disabled={loading.disk}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading.disk ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Database className="w-4 h-4 mr-2" />
              )}
              Disk Analysis
            </Button>
            
            <Button
              onClick={runMalwareAnalysis}
              disabled={loading.malware}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {loading.malware ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Shield className="w-4 h-4 mr-2" />
              )}
              Malware Scan
            </Button>
            
            <Button
              onClick={runIOCEnrichment}
              disabled={loading.ioc}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading.ioc ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Network className="w-4 h-4 mr-2" />
              )}
              IOC Enrichment
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Disk Analysis Results */}
      {results.disk && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Database className="w-5 h-5" />
              Disk Analysis Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-400 mb-1">File System</p>
                <Badge className="bg-blue-500/20 text-blue-400">
                  {results.disk.file_system_type}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Deleted Files Recovered</p>
                <p className="text-white font-semibold">{results.disk.deleted_files_recovered}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Hidden Files Found</p>
                <p className="text-white font-semibold">{results.disk.hidden_files_found}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Encryption Detected</p>
                <Badge className={results.disk.encryption_detected ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}>
                  {results.disk.encryption_detected ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>

            {results.disk.suspicious_artifacts?.length > 0 && (
              <div>
                <p className="text-sm text-slate-400 mb-2">Suspicious Artifacts</p>
                <div className="space-y-2">
                  {results.disk.suspicious_artifacts.map((artifact, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <p className="text-white text-sm font-medium">{artifact.type}</p>
                        <Badge className={getSeverityColor(artifact.risk)}>
                          {artifact.risk}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{artifact.path}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Malware Analysis Results */}
      {results.malware && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Malware Analysis Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-400 mb-1">Threat Score</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-800 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        results.malware.threat_score > 80 ? 'bg-red-500' :
                        results.malware.threat_score > 60 ? 'bg-orange-500' :
                        results.malware.threat_score > 40 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${results.malware.threat_score}%` }}
                    />
                  </div>
                  <span className="text-white font-semibold">{results.malware.threat_score}</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Detection Status</p>
                {results.malware.signature_matches?.length > 0 ? (
                  <Badge className="bg-red-500/20 text-red-400">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Malware Detected
                  </Badge>
                ) : (
                  <Badge className="bg-green-500/20 text-green-400">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Clean
                  </Badge>
                )}
              </div>
            </div>

            {results.malware.signature_matches?.length > 0 && (
              <div>
                <p className="text-sm text-slate-400 mb-2">Detected Malware</p>
                <div className="space-y-2">
                  {results.malware.signature_matches.map((match, idx) => (
                    <div key={idx} className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-white font-semibold">{match.family}</p>
                        <Badge className={getSeverityColor(match.severity)}>
                          {match.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-300 mb-1">Variant: {match.variant}</p>
                      <p className="text-xs text-slate-400">Confidence: {(match.confidence * 100).toFixed(1)}%</p>
                      <p className="text-xs text-slate-400">Signature ID: {match.signature_id}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.malware.behavioral_analysis?.length > 0 && (
              <div>
                <p className="text-sm text-slate-400 mb-2">Suspicious Behaviors</p>
                <div className="space-y-2">
                  {results.malware.behavioral_analysis.map((behavior, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg flex items-center justify-between">
                      <p className="text-white text-sm">{behavior.behavior}</p>
                      <Badge className="bg-orange-500/20 text-orange-400">
                        Risk: {behavior.risk_score}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* IOC Enrichment Results */}
      {results.ioc && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Network className="w-5 h-5" />
              Threat Intelligence Enrichment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-slate-400 mb-1">IOCs Found</p>
                <p className="text-2xl font-bold text-white">{results.ioc.iocs_found}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Risk Level</p>
                <Badge className={getSeverityColor(results.ioc.risk_assessment.severity)}>
                  {results.ioc.risk_assessment.severity.toUpperCase()}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Overall Score</p>
                <p className="text-2xl font-bold text-white">{results.ioc.risk_assessment.overall_score}</p>
              </div>
            </div>

            {results.ioc.indicators?.length > 0 && (
              <div>
                <p className="text-sm text-slate-400 mb-2">Indicators of Compromise</p>
                <div className="space-y-2">
                  {results.ioc.indicators.map((ioc, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <Badge className="bg-purple-500/20 text-purple-400">
                          {ioc.type.toUpperCase()}
                        </Badge>
                        <p className="text-xs text-slate-400">{ioc.source}</p>
                      </div>
                      <p className="text-white text-sm font-mono break-all">{ioc.value}</p>
                      {ioc.malicious_count && (
                        <p className="text-xs text-red-400 mt-1">
                          Detected by {ioc.malicious_count}/{ioc.total_engines} engines
                        </p>
                      )}
                      {ioc.abuse_score && (
                        <p className="text-xs text-orange-400 mt-1">
                          Abuse Score: {ioc.abuse_score}% ({ioc.reports_count} reports)
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.ioc.recommendations?.length > 0 && (
              <div>
                <p className="text-sm text-slate-400 mb-2">Recommendations</p>
                <div className="space-y-2">
                  {results.ioc.recommendations.map((rec, idx) => (
                    <div key={idx} className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg flex items-start gap-2">
                      <Activity className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-blue-200">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}