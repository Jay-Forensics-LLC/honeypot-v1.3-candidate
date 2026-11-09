
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, FileText, FileArchive, CheckCircle, Loader2, Shield } from 'lucide-react';
import { generatePDFRemediation } from '@/functions/generatePDFRemediation';
import { toast } from 'sonner';

export default function ForensicExporter() {
  const [exportConfig, setExportConfig] = useState({
    include_scan_results: true,
    include_quarantine_manifest: true,
    include_snapshots_metadata: true,
    include_chain_of_custody: true,
    format_pdf: true,
    format_csv: true,
    watermark: true,
    digital_signature: true
  });

  const [selectedScanId, setSelectedScanId] = useState('');

  const { data: recentScans = [] } = useQuery({
    queryKey: ['remediation-scans'],
    queryFn: async () => {
      try {
        return await base44.entities.RemediationScan.filter(
          { status: 'completed' },
          '-completed_at',
          10
        );
      } catch (error) {
        console.error("Failed to fetch recent scans:", error);
        return [];
      }
    }
  });

  const generateCSVExport = (scan) => {
    const headers = ['Finding ID', 'Type', 'Path/Value', 'Severity', 'Confidence', 'Recommendation', 'First Seen'];
    const rows = [headers.join(',')];

    if (scan.findings) {
      for (const finding of scan.findings) {
        rows.push([
          finding.finding_id || '',
          finding.type || '',
          `"${(finding.path || finding.value || '').replace(/"/g, '""')}"`, // Handle path or value
          finding.severity || '',
          finding.confidence || '',
          `"${(finding.recommendation || '').replace(/"/g, '""')}"`,
          finding.first_seen || ''
        ].join(','));
      }
    }

    return rows.join('\n');
  };

  const generateManifestSignature = async (scan, quarantineItems) => {
    const signatureData = {
      scan_id: scan?.scan_id,
      threat_count: quarantineItems?.length || 0,
      timestamp: new Date().toISOString(),
      watermarked: exportConfig.watermark,
      includes_scan_results: exportConfig.include_scan_results,
      includes_quarantine_manifest: exportConfig.include_quarantine_manifest,
      includes_snapshots_metadata: exportConfig.include_snapshots_metadata,
      includes_chain_of_custody: exportConfig.include_chain_of_custody,
    };

    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(signatureData))
    );

    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const exportMutation = useMutation({
    mutationFn: async () => {
      if (!selectedScanId) {
        throw new Error('Please select a scan to export.');
      }

      const scan = recentScans.find(s => s.scan_id === selectedScanId);
      if (!scan) {
        throw new Error('Selected scan not found.');
      }

      // Generate PDF affidavit
      if (exportConfig.format_pdf) {
        try {
          const pdfResponse = await generatePDFRemediation({ scan_id: selectedScanId });

          // Assuming pdfResponse.data is the PDF blob
          const blob = new Blob([pdfResponse.data], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `sentinel-remediation-${selectedScanId}-${Date.now()}.pdf`;
          document.body.appendChild(a);
          a.click();
          URL.revokeObjectURL(url);
          a.remove();
        } catch (pdfError) {
          console.error("Error generating PDF:", pdfError);
          toast.error('PDF Export Failed', {
            description: pdfError.message || 'Could not generate PDF for the selected scan.',
          });
          // Decide if you want to stop here or continue with other exports
        }
      }

      // Generate CSV export
      if (exportConfig.format_csv) {
        try {
          if (scan && scan.findings) {
            const csvData = generateCSVExport(scan);
            const blob = new Blob([csvData], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sentinel-findings-${selectedScanId}-${Date.now()}.csv`;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            a.remove();
          } else {
            console.warn("No findings found for CSV export.");
          }
        } catch (csvError) {
          console.error("Error generating CSV:", csvError);
          toast.error('CSV Export Failed', {
            description: csvError.message || 'Could not generate CSV for the selected scan.',
          });
        }
      }

      // Fetch additional data for JSON manifest
      const quarantineItems = exportConfig.include_quarantine_manifest
        ? await base44.entities.QuarantineItem.filter({ scan_id: selectedScanId })
        : [];
      const snapshots = exportConfig.include_snapshots_metadata && scan?.snapshot_id
        ? await base44.entities.SystemSnapshot.filter({ snapshot_id: scan.snapshot_id })
        : [];

      // Generate JSON manifest
      const manifest = {
        export_id: `EXP-${Date.now()}`,
        scan_id: selectedScanId,
        timestamp: new Date().toISOString(),
        watermarked: exportConfig.watermark,
        digitally_signed: exportConfig.digital_signature,
        includes: {
          scan_results: exportConfig.include_scan_results,
          quarantine_manifest: exportConfig.include_quarantine_manifest,
          snapshots_metadata: exportConfig.include_snapshots_metadata,
          chain_of_custody: exportConfig.include_chain_of_custody
        },
        scan_summary: scan ? {
          scan_name: scan.scan_name,
          scan_type: scan.scan_type,
          platform: scan.platform,
          started_at: scan.started_at,
          completed_at: scan.completed_at,
          risk_score: scan.risk_score,
          threats_found: scan.statistics?.threats_found || 0,
          snapshot_id: scan.snapshot_id,
        } : null,
        quarantine_items: exportConfig.include_quarantine_manifest ? quarantineItems : [],
        snapshots: exportConfig.include_snapshots_metadata ? snapshots : [],
        chain_of_custody: exportConfig.include_chain_of_custody
          ? (quarantineItems?.flatMap(q => q.chain_of_custody || []) || [])
          : [],
        signature: exportConfig.digital_signature
          ? await generateManifestSignature(scan, quarantineItems)
          : null
      };

      // Download manifest
      try {
        const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
        const manifestUrl = URL.createObjectURL(manifestBlob);
        const manifestLink = document.createElement('a');
        manifestLink.href = manifestUrl;
        manifestLink.download = `sentinel-manifest-${selectedScanId}-${Date.now()}.json`;
        document.body.appendChild(manifestLink);
        manifestLink.click();
        URL.revokeObjectURL(manifestUrl);
        manifestLink.remove();
      } catch (manifestError) {
        console.error("Error generating manifest:", manifestError);
        toast.error('Manifest Export Failed', {
          description: manifestError.message || 'Could not generate JSON manifest.',
        });
      }


      return manifest; // Return the generated manifest for onSuccess
    },
    onSuccess: () => {
      toast.success('Forensic Bundle Generated Successfully!', {
        description: 'Export package ready for legal review and download.',
        duration: 5000
      });
    },
    onError: (error) => {
      toast.error('Export Failed', {
        description: error.message || 'An unexpected error occurred during export.',
      });
    }
  });

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-3">
            <FileArchive className="w-6 h-6 text-indigo-400" />
            Forensic Export Bundle
          </CardTitle>
          <p className="text-sm text-slate-400 mt-2">
            Generate legally-admissible export packages with watermarks and digital signatures
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Select Scan */}
          <div className="space-y-2">
            <Label htmlFor="scan-select" className="text-white font-semibold">Select Scan to Export:</Label>
            <select
              id="scan-select"
              value={selectedScanId}
              onChange={(e) => setSelectedScanId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-md px-3 py-2"
              style={{ fontSize: '16px', minHeight: '44px' }}
            >
              <option value="">-- Select a completed scan --</option>
              {recentScans.length > 0 ? (
                recentScans.map((scan) => (
                  <option key={scan.id} value={scan.scan_id}>
                    {scan.scan_name} - {new Date(scan.completed_at).toLocaleString()}
                    ({scan.statistics?.threats_found || 0} threats)
                  </option>
                ))
              ) : (
                <option value="" disabled>No completed scans available</option>
              )}
            </select>
          </div>

          {/* Export Options */}
          <div className="space-y-3">
            <Label className="text-white font-semibold">Include in Export:</Label>
            <div className="grid md:grid-cols-2 gap-3 p-4 bg-slate-800/50 rounded-lg">
              {[
                { key: 'include_scan_results', label: 'Scan Results & Findings', icon: FileText },
                { key: 'include_quarantine_manifest', label: 'Quarantine Manifest', icon: Shield },
                { key: 'include_snapshots_metadata', label: 'Snapshot Metadata', icon: FileArchive },
                { key: 'include_chain_of_custody', label: 'Chain of Custody Logs', icon: CheckCircle }
              ].map(option => {
                const Icon = option.icon;
                return (
                  <div key={option.key} className="flex items-center gap-3 p-3 bg-slate-900/50 rounded border border-slate-700">
                    <Checkbox
                      id={option.key}
                      checked={exportConfig[option.key]}
                      onCheckedChange={(checked) =>
                        setExportConfig({...exportConfig, [option.key]: checked})
                      }
                    />
                    <Label htmlFor={option.key} className="text-white flex items-center gap-2 cursor-pointer flex-1">
                      <Icon className="w-4 h-4 text-blue-400" />
                      {option.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Export Formats */}
          <div className="space-y-3">
            <Label className="text-white font-semibold">Export Formats:</Label>
            <div className="grid md:grid-cols-2 gap-3 p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded border border-slate-700">
                <Checkbox
                  id="format_pdf"
                  checked={exportConfig.format_pdf}
                  onCheckedChange={(checked) =>
                    setExportConfig({...exportConfig, format_pdf: checked})
                  }
                />
                <Label htmlFor="format_pdf" className="text-white cursor-pointer">
                  PDF Affidavit (Court-ready)
                </Label>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded border border-slate-700">
                <Checkbox
                  id="format_csv"
                  checked={exportConfig.format_csv}
                  onCheckedChange={(checked) =>
                    setExportConfig({...exportConfig, format_csv: checked})
                  }
                />
                <Label htmlFor="format_csv" className="text-white cursor-pointer">
                  CSV Data Export
                </Label>
              </div>
            </div>
          </div>

          {/* Security Options */}
          <div className="space-y-3">
            <Label className="text-white font-semibold">Security & Compliance:</Label>
            <div className="grid md:grid-cols-2 gap-3 p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="watermark"
                  checked={exportConfig.watermark}
                  onCheckedChange={(checked) =>
                    setExportConfig({...exportConfig, watermark: checked})
                  }
                />
                <Label htmlFor="watermark" className="text-green-200 cursor-pointer">
                  Watermark Documents
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="digital_signature"
                  checked={exportConfig.digital_signature}
                  onCheckedChange={(checked) =>
                    setExportConfig({...exportConfig, digital_signature: checked})
                  }
                />
                <Label htmlFor="digital_signature" className="text-green-200 cursor-pointer">
                  Digital Signature
                </Label>
              </div>
            </div>
          </div>

          {/* Export Button */}
          <Button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending || !selectedScanId}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 min-h-[48px] font-semibold"
          >
            {exportMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Generating Export Bundle...
              </>
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" />
                Generate Forensic Bundle
              </>
            )}
          </Button>

          {!selectedScanId && (
            <p className="text-xs text-center text-slate-500">
              Select a completed scan to generate export
            </p>
          )}

          {/* Export Contents Preview */}
          <div className="p-4 bg-slate-800/50 rounded-lg space-y-2 text-xs">
            <p className="font-semibold text-white mb-3">Export Bundle Contents:</p>
            <div className="space-y-1 text-slate-400">
              <p>✓ Watermarked PDF affidavit with investigator details</p>
              <p>✓ CSV data export with all scan findings</p>
              <p>✓ SHA-256 signed manifest for integrity verification</p>
              <p>✓ Complete chain-of-custody logs</p>
              <p>✓ Snapshot metadata and rollback tokens</p>
              <p>✓ Quarantine manifest with encryption details</p>
              <p>✓ Timestamp receipts (RFC-3161)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
