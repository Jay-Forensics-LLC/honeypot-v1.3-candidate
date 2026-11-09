import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  FileText, 
  Download, 
  Loader2, 
  AlertTriangle,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { useQueryClient } from '@tanstack/react-query';

export default function ReportGenerator({ caseId }) {
  const queryClient = useQueryClient();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [generatedReportId, setGeneratedReportId] = useState(null);
  const [includeAuditTrail, setIncludeAuditTrail] = useState(false);
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const generateReport = async () => {
    if (!caseId) {
      toast.error('No case selected');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await base44.functions.invoke('generateForensicSummary', {
        caseId,
        includeAuditTrail: includeAuditTrail
      });

      if (response.data.success) {
        setReportContent(response.data.report_content);
        setGeneratedReportId(response.data.report_id);
        setShowPreview(true);
        
        toast.success('Forensic report generated successfully!', {
          description: `Report ID: ${response.data.report_number}`
        });

        queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      } else {
        throw new Error(response.data.error || 'Report generation failed');
      }
    } catch (err) {
      console.error('Report generation error:', err);
      setError(err.message || 'Failed to generate report');
      toast.error('Failed to generate report', {
        description: err.message
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const exportPDF = async () => {
    if (!generatedReportId) {
      toast.error('No report to export');
      return;
    }

    setIsExporting(true);

    try {
      const response = await base44.functions.invoke('generatePDFReport', {
        reportId: generatedReportId
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `forensic-report-${generatedReportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      toast.success('PDF report downloaded successfully!');
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error('Failed to export PDF', {
        description: err.message
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            AI-Powered Forensic Report Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-slate-300 text-sm">
            Generate a comprehensive forensic analysis report using AI. The report includes evidence correlation, 
            threat analysis, chain of custody verification, and legal admissibility assessment.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="include-audit"
              checked={includeAuditTrail}
              onChange={(e) => setIncludeAuditTrail(e.target.checked)}
              className="rounded border-slate-700 bg-slate-800"
            />
            <label htmlFor="include-audit" className="text-sm text-slate-300 cursor-pointer">
              Include complete audit trail in report
            </label>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-300 font-semibold">Error</p>
                  <p className="text-red-200 text-sm mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={generateReport}
              disabled={isGenerating || isExporting}
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Report...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>

            {generatedReportId && (
              <Button
                onClick={exportPDF}
                disabled={isExporting || isGenerating}
                variant="outline"
                className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Export PDF
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-200">
                <p className="font-semibold mb-1">Legal Admissibility</p>
                <p className="text-blue-300/80">
                  All generated reports include SHA-256 digital signatures, timestamps, and chain-of-custody verification 
                  to meet legal standards (F.S. 90.803).
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6 text-blue-400" />
              Forensic Analysis Report
            </DialogTitle>
          </DialogHeader>

          <div className="prose prose-invert max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-2xl font-bold text-white mt-6 mb-4">{children}</h1>,
                h2: ({ children }) => <h2 className="text-xl font-semibold text-white mt-5 mb-3">{children}</h2>,
                h3: ({ children }) => <h3 className="text-lg font-semibold text-slate-200 mt-4 mb-2">{children}</h3>,
                p: ({ children }) => <p className="text-slate-300 my-2 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside text-slate-300 my-2 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside text-slate-300 my-2 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="text-slate-300">{children}</li>,
                strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                code: ({ inline, children }) => inline ? (
                  <code className="bg-slate-800 text-blue-300 px-1.5 py-0.5 rounded text-sm">{children}</code>
                ) : (
                  <code className="block bg-slate-800 text-blue-300 p-3 rounded my-2 overflow-x-auto">{children}</code>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-blue-500 pl-4 italic text-slate-400 my-4">{children}</blockquote>
                ),
              }}
            >
              {reportContent}
            </ReactMarkdown>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 sticky bottom-0 bg-slate-900">
            <Button
              variant="outline"
              onClick={() => setShowPreview(false)}
              className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
            >
              Close
            </Button>
            <Button
              onClick={exportPDF}
              disabled={isExporting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export as PDF
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}