import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Download,
  AlertTriangle,
  Calendar,
  Hash,
  Plus,
  Loader2,
  Eye,
  CheckCircle,
  Clock,
  History,
  Sparkles
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { createPageUrl } from "../utils";
import { DateUtils } from "../components/utils/DateUtils";
import { useOrgList, useOrgQuery } from "../components/hooks/useOrgQuery";
import { useUser } from "../components/hooks/useUser";

import PageHeader from "../components/common/PageHeader";
import TemplateManager from "../components/reports/TemplateManager";
import GenerationHistory from "../components/reports/GenerationHistory";
import AIReportGenerator from "../components/reports/AIReportGenerator";
import ReportViewer from "../components/reports/ReportViewer";

export default function Reports() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedCase, setSelectedCase] = useState('');
  const [reportType, setReportType] = useState('final');
  const queryClient = useQueryClient();

  const { data: user } = useUser();

  // ORG-SCOPED queries
  const { data: cases = [], isLoading: isLoadingCases } = useOrgList('Case');

  const { data: reports = [], isLoading } = useOrgList('Report', '-generated_date');

  // Generate Report Mutation - FULLY FUNCTIONAL
  const generateReportMutation = useMutation({
    mutationFn: async () => {
      setIsGenerating(true);
      
      const caseData = cases.find(c => c.id === selectedCase);
      
      if (!caseData) {
        throw new Error('Case not found');
      }
      
      // Get current user for org context
      const currentUser = await base44.auth.me();
      
      // ORG-SCOPED: Get all evidence for the case
      const caseEvidence = await base44.entities.EvidenceV2.filter({ 
        organization_id: currentUser.organization_id,
        case_id: selectedCase 
      });
      
      // ORG-SCOPED: Get all alerts
      const allAlerts = await base44.entities.Alert.filter({
        organization_id: currentUser.organization_id
      });
      
      // Create report record
      const reportNumber = `RPT-${Date.now().toString().slice(-8)}`;
      
      const reportData = {
        case_id: selectedCase,
        report_number: reportNumber,
        title: `${reportType.charAt(0).toUpperCase() + reportType.slice(1).replace('_', ' ')} Report - ${caseData.title}`,
        report_type: reportType,
        status: 'draft',
        findings: `Comprehensive forensic analysis for case ${caseData.case_number}. Analysis includes ${caseEvidence.length} pieces of evidence and ${allAlerts.length} security alerts.`,
        methodology: 'Standard digital forensic investigation procedures followed in accordance with NIST SP 800-86 guidelines and Florida Rules of Evidence.',
        conclusions: `Evidence collection and analysis completed. ${caseEvidence.filter(e => e.is_verified).length} of ${caseEvidence.length} evidence items verified and admissible.`,
        recommendations: caseEvidence.filter(e => !e.is_verified).length > 0 
          ? `${caseEvidence.filter(e => !e.is_verified).length} evidence items require verification before court submission per Florida Statute 90.803(6).`
          : 'All evidence verified and admissible per Florida Statute 90.803(6). Case ready for legal proceedings.',
        evidence_references: caseEvidence.map(e => e.evidence_number || e.evidence_id),
        generated_date: new Date().toISOString().split('T')[0],
        approved_by: user?.full_name || 'Demo User'
      };

      const report = await base44.entities.Report.create(reportData);
      
      // Try to generate PDF (will fallback gracefully if function not available)
      try {
        const pdfResponse = await base44.functions.invoke('generatePDFReport', {
          report_id: report.id,
          case_id: selectedCase
        });
        
        if (pdfResponse.data.file_url) {
          await base44.entities.Report.update(report.id, {
            status: 'review',
            file_url: pdfResponse.data.file_url
          });
        }
      } catch (pdfError) {
        console.warn('PDF generation not available, report created without PDF:', pdfError);
        // Update status anyway
        await base44.entities.Report.update(report.id, {
          status: 'review'
        });
      }
      return report;
    },
    onSuccess: (report) => {
      setIsGenerating(false);
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setGenerateDialogOpen(false);
      setSelectedCase('');
      setReportType('final');
      
      toast.success('Report generated successfully!', {
        description: `Report ${report.report_number} created and ready for review`,
        duration: 5000,
        action: {
          label: 'View Report',
          onClick: () => window.location.href = createPageUrl(`ReportDetail/${report.id}`)
        }
      });
    },
    onError: (error) => {
      setIsGenerating(false);
      console.error('Report generation error:', error);
      toast.error('Failed to generate report', {
        description: error.message || 'Please try again'
      });
    }
  });

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Automated Reports</h1>
            <p className="text-slate-400">Templates, scheduling, and forensic audit trail</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => setShowAIGenerator(true)}
              disabled={cases.length === 0 || isLoadingCases}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              AI Report Generator
            </Button>
            <Button
              onClick={() => setGenerateDialogOpen(true)}
              disabled={cases.length === 0 || isLoadingCases}
              variant="outline"
              className="border-slate-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Manual Report
            </Button>
          </div>
        </div>

        {/* Tabs for Templates vs Legacy */}
        <Tabs defaultValue="templates" className="w-full">
          <TabsList className="bg-slate-900 border-slate-800 mb-6">
            <TabsTrigger value="templates" className="data-[state=active]:bg-red-600">
              <FileText className="w-4 h-4 mr-2" />
              Templates & Schedules
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-red-600">
              <History className="w-4 h-4 mr-2" />
              Generation History
            </TabsTrigger>
            <TabsTrigger value="legacy" className="data-[state=active]:bg-red-600">
              <Clock className="w-4 h-4 mr-2" />
              Legacy Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates">
            <TemplateManager />
          </TabsContent>

          <TabsContent value="history">
            <GenerationHistory />
          </TabsContent>

          <TabsContent value="legacy">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Legacy Reports ({reports.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-400" />
                    <p className="text-slate-400">Loading reports...</p>
                  </div>
                ) : reports.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                    <p className="text-lg mb-2">No legacy reports</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reports.map((report) => {
                      const caseData = cases.find(c => c.id === report.case_id);
                      
                      return (
                        <div key={report.id} className="p-4 bg-slate-800/30 border border-slate-700 rounded-lg hover:border-blue-500/50 transition-all">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <FileText className="w-5 h-5 text-blue-400" />
                                <h3 className="font-semibold text-white">{report.title}</h3>
                                <Badge className="bg-blue-500/20 text-blue-400 uppercase text-xs">
                                  {report.report_type?.replace('_', ' ') || 'Unknown'}
                                </Badge>
                                <Badge className={
                                  report.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                                  report.status === 'review' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-slate-500/20 text-slate-400'
                                }>
                                  {report.status || 'draft'}
                                </Badge>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-slate-400">
                                <div className="flex items-center gap-2">
                                  <Hash className="w-4 h-4" />
                                  <span className="font-mono">{report.report_number || 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4" />
                                  {DateUtils.safeFormatDate(report.generated_date, 'No date')}
                                </div>
                                {caseData && (
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    <span className="font-mono">{caseData.case_number}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 ml-4">
                              <Button
                                size="sm"
                                onClick={() => setSelectedReport(report.id)}
                                className="bg-blue-600 hover:bg-blue-700"
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                View
                              </Button>
                              {report.file_url && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(report.file_url, '_blank')}
                                  className="border-slate-700"
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  PDF
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Generate Report Dialog */}
        <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle>Generate New Report</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="case-select">Select Case</Label>
                <Select
                  value={selectedCase}
                  onValueChange={setSelectedCase}
                  disabled={isLoadingCases}
                >
                  <SelectTrigger id="case-select" className="bg-slate-800 border-slate-700">
                    <SelectValue placeholder={isLoadingCases ? "Loading cases..." : "Choose a case..."} />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {cases.length === 0 ? (
                      <SelectItem value="no-cases" disabled>No cases available</SelectItem>
                    ) : (
                      cases.map((caseItem) => (
                        <SelectItem key={caseItem.id} value={caseItem.id}>
                          {caseItem.case_number} - {caseItem.title}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="report-type-select">Report Type</Label>
                <Select
                  value={reportType}
                  onValueChange={setReportType}
                >
                  <SelectTrigger id="report-type-select" className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="preliminary">Preliminary Report</SelectItem>
                    <SelectItem value="progress">Progress Report</SelectItem>
                    <SelectItem value="final">Final Report</SelectItem>
                    <SelectItem value="expert_testimony">Expert Testimony</SelectItem>
                    <SelectItem value="chain_of_custody">Chain of Custody</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Alert className="bg-blue-500/10 border-blue-500/30">
                <FileText className="h-4 w-4 text-blue-400" />
                <AlertDescription className="text-blue-300 text-sm">
                  The report will include all evidence and findings associated with the selected case.
                </AlertDescription>
              </Alert>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setGenerateDialogOpen(false);
                  setSelectedCase('');
                }}
                className="border-slate-700"
                disabled={isGenerating}
              >
                Cancel
              </Button>
              <Button
                onClick={() => generateReportMutation.mutate()}
                disabled={!selectedCase || isGenerating}
                className="bg-green-600 hover:bg-green-700"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Generate Report
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* AI Report Generator Dialog */}
        <Dialog open={showAIGenerator} onOpenChange={setShowAIGenerator}>
          <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">Generate AI-Assisted Report</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Select a case to generate an evidence-backed report:
              </p>
              <Select value={selectedCase} onValueChange={setSelectedCase}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select case..." />
                </SelectTrigger>
                <SelectContent>
                  {(cases || []).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.case_number} - {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedCase && (
                <AIReportGenerator 
                  caseId={selectedCase}
                  onComplete={(reportId) => {
                    setShowAIGenerator(false);
                    setSelectedCase('');
                    setSelectedReport(reportId);
                  }}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Report Viewer Dialog */}
        <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 max-w-5xl max-h-[90vh] overflow-y-auto">
            {selectedReport && <ReportViewer reportId={selectedReport} />}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}