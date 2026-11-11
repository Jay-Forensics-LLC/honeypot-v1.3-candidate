import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Shield, 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  Database,
  Lock,
  Activity,
  Info
} from 'lucide-react';
import { format } from 'date-fns';

/**
 * EVIDENCE-GRADE REPORT VIEWER
 * Displays court-defensible reports with full provenance
 */
export default function EvidenceGradeReportViewer({ report }) {
  if (!report) return null;

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/50',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      low: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      info: 'bg-slate-500/20 text-slate-400 border-slate-500/50'
    };
    return colors[severity] || colors.info;
  };

  const getConfidenceColor = (conf) => {
    if (conf >= 0.8) return 'text-green-400';
    if (conf >= 0.5) return 'text-yellow-400';
    return 'text-orange-400';
  };

  return (
    <div className="space-y-6">
      {/* Simulation Warning */}
      {report.is_simulated && (
        <Alert className="bg-orange-500/20 border-orange-500/50">
          <AlertTriangle className="w-4 h-4 text-orange-400" />
          <AlertDescription className="text-orange-300">
            <strong>DEMO/TEST MODE:</strong> This report contains simulated or test data and is NOT suitable for court evidence or production use.
          </AlertDescription>
        </Alert>
      )}

      {/* Report Metadata */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#EF4444]" />
            Evidence-Grade Report Metadata
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-400">Report ID</p>
              <code className="text-white text-xs">{report.report_id}</code>
            </div>
            <div>
              <p className="text-slate-400">Version</p>
              <p className="text-white">{report.report_version}</p>
            </div>
            <div>
              <p className="text-slate-400">Generated</p>
              <p className="text-white">{format(new Date(report.generated_at), 'PPpp')}</p>
            </div>
            <div>
              <p className="text-slate-400">Mode</p>
              <Badge>{report.mode}</Badge>
            </div>
          </div>

          {/* Integrity */}
          <div className="p-4 bg-slate-800/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-white">Report Integrity</span>
            </div>
            <code className="text-xs text-slate-400 break-all">
              SHA-256: {report.report_integrity?.report_sha256}
            </code>
            {report.report_integrity?.signature && (
              <div className="mt-2">
                <p className="text-xs text-slate-400">
                  Digitally signed with {report.report_integrity.signature.algorithm}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Target & Provenance */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Target & Acquisition Provenance</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="target">
            <TabsList className="bg-slate-800">
              <TabsTrigger value="target">Target Identity</TabsTrigger>
              <TabsTrigger value="provenance">Acquisition</TabsTrigger>
            </TabsList>
            <TabsContent value="target" className="space-y-2 mt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400">Device ID</p>
                  <code className="text-white text-xs">{report.target_identity?.device_id}</code>
                </div>
                <div>
                  <p className="text-slate-400">Hostname</p>
                  <p className="text-white">{report.target_identity?.hostname || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-slate-400">OS</p>
                  <p className="text-white">{report.target_identity?.os_name || 'Unknown'} {report.target_identity?.os_version || ''}</p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="provenance" className="space-y-2 mt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400">Collection Start</p>
                  <p className="text-white text-xs">{format(new Date(report.acquisition_provenance.collection_start), 'PPpp')}</p>
                </div>
                <div>
                  <p className="text-slate-400">Collection End</p>
                  <p className="text-white text-xs">{format(new Date(report.acquisition_provenance.collection_end), 'PPpp')}</p>
                </div>
                <div>
                  <p className="text-slate-400">Time Sync</p>
                  <Badge variant="outline">{report.acquisition_provenance.time_sync_status}</Badge>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Evidence Inventory */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            Evidence Inventory ({report.evidence_inventory?.length || 0} items)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {report.evidence_inventory?.map((item, idx) => (
              <div key={idx} className="p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <code className="text-xs text-slate-400">{item.evidence_id}</code>
                    <p className="text-sm text-white mt-1">{item.type}</p>
                  </div>
                  {item.is_simulated && (
                    <Badge className="bg-orange-500/20 text-orange-400">SIMULATED</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-slate-400">Collected</p>
                    <p className="text-white">{format(new Date(item.collected_at), 'MMM d, HH:mm')}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Size</p>
                    <p className="text-white">{formatBytes(item.size_bytes)}</p>
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-xs text-slate-400">SHA-256</p>
                  <code className="text-xs text-slate-300 break-all">{item.hash_sha256}</code>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Findings */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#EF4444]" />
            Findings ({report.findings?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {report.findings?.map((finding, idx) => (
              <div key={idx} className={`p-4 rounded-lg border-2 ${getSeverityColor(finding.severity)}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getSeverityColor(finding.severity)}>
                        {finding.severity}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Confidence: <span className={getConfidenceColor(finding.confidence)}>
                          {Math.round(finding.confidence * 100)}%
                        </span>
                      </Badge>
                      <Badge variant="outline">{finding.status}</Badge>
                    </div>
                    <h4 className="text-lg font-semibold text-white">{finding.title}</h4>
                  </div>
                </div>

                {/* Observed Facts */}
                {finding.observed_facts?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-slate-300 mb-2">Observed Facts:</p>
                    <ul className="space-y-1">
                      {finding.observed_facts.map((fact, i) => (
                        <li key={i} className="text-sm text-slate-400">
                          • {fact.fact} <code className="text-xs text-slate-500">({fact.source})</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Evidence References */}
                <div className="mb-3">
                  <p className="text-sm font-medium text-slate-300 mb-2">
                    Evidence References: {finding.evidence_refs?.length || 0}
                  </p>
                  {finding.evidence_refs?.slice(0, 3).map((ref, i) => (
                    <code key={i} className="text-xs text-slate-400 block">
                      {ref.evidence_id} ({ref.locator})
                    </code>
                  ))}
                </div>

                {/* Reasoning */}
                {finding.reasoning && (
                  <div className="mb-3 p-3 bg-slate-900/50 rounded">
                    <p className="text-xs font-medium text-slate-300 mb-1">Reasoning:</p>
                    <p className="text-sm text-slate-400">{finding.reasoning}</p>
                  </div>
                )}

                {/* Limitations */}
                {finding.limitations && (
                  <Alert className="bg-orange-500/10 border-orange-500/30 mt-3">
                    <Info className="w-4 h-4 text-orange-400" />
                    <AlertDescription className="text-xs text-orange-300">
                      <strong>Limitations:</strong> {finding.limitations}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Recommended Actions */}
                {finding.recommended_actions?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-slate-300 mb-1">Recommended Actions:</p>
                    <ul className="space-y-1">
                      {finding.recommended_actions.map((action, i) => (
                        <li key={i} className="text-xs text-slate-400">
                          {i + 1}. {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}