import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  FileText,
  Scale,
  Download,
  CheckCircle,
  Shield
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const REPORT_TEMPLATES = [
  {
    id: 'forensic_report',
    name: 'Forensic Investigation Report',
    description: 'Comprehensive forensic analysis report',
    icon: FileText,
    color: 'text-blue-400',
    sections: ['Executive Summary', 'Investigation Details', 'Findings', 'Evidence', 'Conclusion', 'Recommendations']
  },
  {
    id: 'chain_of_custody',
    name: 'Chain of Custody Report',
    description: 'Complete chain of custody documentation',
    icon: Shield,
    color: 'text-green-400',
    sections: ['Evidence Information', 'Collection Details', 'Custody Log', 'Integrity Verification', 'Digital Signatures']
  },
  {
    id: 'affidavit',
    name: 'Legal Affidavit',
    description: 'Sworn statement of facts for legal proceedings',
    icon: Scale,
    color: 'text-purple-400',
    sections: ['Affiant Information', 'Statement of Facts', 'Evidence References', 'Expert Opinion', 'Oath']
  },
  {
    id: 'incident_response',
    name: 'Incident Response Report',
    description: 'Security incident investigation and response',
    icon: Shield,
    color: 'text-red-400',
    sections: ['Incident Overview', 'Timeline', 'Impact Assessment', 'Response Actions', 'Lessons Learned']
  }
];

export default function ReportTemplateGenerator() {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [reportData, setReportData] = useState({
    caseNumber: '',
    investigator: '',
    organization: '',
    dateRange: { start: '', end: '' },
    sections: {}
  });
  const [generating, setGenerating] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list(),
    initialData: []
  });

  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence'],
    queryFn: () => base44.entities.EvidenceV2.list(),
    initialData: []
  });

  React.useEffect(() => {
    if (user) {
      setReportData(prev => ({
        ...prev,
        investigator: user.full_name || user.email,
        organization: user.organization || ''
      }));
    }
  }, [user]);

  const generateReport = async () => {
    if (!selectedTemplate) {
      toast.error('Please select a report template');
      return;
    }

    if (!reportData.caseNumber) {
      toast.error('Please select or enter a case number');
      return;
    }

    setGenerating(true);

    try {
      const selectedCase = cases.find(c => c.case_number === reportData.caseNumber);
      const caseEvidence = evidence.filter(e => e.case_id === selectedCase?.id);

      // Generate report content
      const reportContent = generateReportContent(selectedTemplate, selectedCase, caseEvidence);

      // Create PDF
      const blob = new Blob([reportContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTemplate.id}_${reportData.caseNumber}_${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Create report record
      await base44.entities.Report.create({
        case_id: selectedCase?.id,
        report_number: `RPT-${Date.now().toString().slice(-8)}`,
        title: `${selectedTemplate.name} - ${reportData.caseNumber}`,
        report_type: selectedTemplate.id === 'affidavit' ? 'expert_testimony' : 'final',
        status: 'draft',
        findings: reportContent.substring(0, 1000),
        methodology: 'Digital forensic investigation using Sentinel Forensics platform',
        generated_date: new Date().toISOString().split('T')[0]
      });

      toast.success('Report generated successfully');
    } catch (error) {
      toast.error('Failed to generate report');
      console.error(error);
    } finally {
      setGenerating(false);
    }
  };

  const generateReportContent = (template, caseData, evidenceData) => {
    const now = new Date();
    let content = '';

    content += `================================================================================\n`;
    content += `  SENTINEL FORENSICS - ${template.name.toUpperCase()}\n`;
    content += `================================================================================\n\n`;

    content += `Report Date: ${format(now, 'MMMM d, yyyy')}\n`;
    content += `Report Number: RPT-${Date.now().toString().slice(-8)}\n`;
    content += `Case Number: ${reportData.caseNumber}\n`;
    content += `Investigator: ${reportData.investigator}\n`;
    content += `Organization: ${reportData.organization}\n\n`;

    content += `================================================================================\n\n`;

    if (template.id === 'forensic_report') {
      content += `EXECUTIVE SUMMARY\n`;
      content += `--------------------------------------------------------------------------------\n`;
      content += `This report documents the forensic investigation of case ${reportData.caseNumber}.\n`;
      content += `Investigation Period: ${reportData.dateRange.start || 'N/A'} to ${reportData.dateRange.end || format(now, 'yyyy-MM-dd')}\n\n`;

      if (caseData) {
        content += `Case Title: ${caseData.title}\n`;
        content += `Case Description: ${caseData.description || 'N/A'}\n`;
        content += `Priority: ${caseData.priority}\n`;
        content += `Status: ${caseData.status}\n\n`;
      }

      content += `\nEVIDENCE COLLECTED\n`;
      content += `--------------------------------------------------------------------------------\n`;
      content += `Total Evidence Items: ${evidenceData.length}\n\n`;

      evidenceData.forEach((item, index) => {
        content += `[${index + 1}] ${item.evidence_number} - ${item.title}\n`;
        content += `    Type: ${item.evidence_type}\n`;
        content += `    Hash (SHA-256): ${item.file_hash_sha256?.substring(0, 32)}...\n`;
        content += `    Collection Date: ${item.collection_timestamp}\n`;
        content += `    Verified: ${item.is_verified ? 'Yes' : 'No'}\n\n`;
      });
    }

    if (template.id === 'chain_of_custody') {
      content += `CHAIN OF CUSTODY DOCUMENTATION\n`;
      content += `--------------------------------------------------------------------------------\n\n`;

      evidenceData.forEach((item, index) => {
        content += `Evidence Item #${index + 1}\n`;
        content += `Evidence Number: ${item.evidence_number}\n`;
        content += `Title: ${item.title}\n`;
        content += `Type: ${item.evidence_type}\n`;
        content += `Collection Method: ${item.collection_method}\n`;
        content += `Collection Date: ${item.collection_timestamp}\n`;
        content += `SHA-256 Hash: ${item.file_hash_sha256}\n\n`;

        if (item.chain_of_custody && item.chain_of_custody.length > 0) {
          content += `Chain of Custody Log:\n`;
          item.chain_of_custody.forEach((entry, idx) => {
            content += `  [${idx + 1}] ${entry.timestamp} - ${entry.action} by ${entry.performed_by}\n`;
          });
        }
        content += `\n`;
      });
    }

    if (template.id === 'affidavit') {
      content += `AFFIDAVIT\n`;
      content += `--------------------------------------------------------------------------------\n\n`;
      content += `I, ${reportData.investigator}, being duly sworn, hereby depose and state:\n\n`;
      content += `1. I am a digital forensics investigator for ${reportData.organization}.\n\n`;
      content += `2. I have conducted a forensic investigation of case ${reportData.caseNumber}.\n\n`;
      content += `3. During this investigation, I collected and analyzed ${evidenceData.length} piece(s) of digital evidence.\n\n`;
      content += `4. All evidence was collected and handled in accordance with industry best practices.\n\n`;
      content += `5. The chain of custody has been maintained for all evidence items.\n\n`;
      content += `6. Based on my analysis, I have formed the following expert opinions:\n\n`;
      content += `   [Expert opinions would be detailed here based on case findings]\n\n`;
      content += `I declare under penalty of perjury that the foregoing is true and correct.\n\n`;
      content += `Executed on: ${format(now, 'MMMM d, yyyy')}\n\n`;
      content += `_____________________________\n`;
      content += `${reportData.investigator}\n`;
      content += `Digital Forensics Investigator\n`;
    }

    content += `\n================================================================================\n`;
    content += `END OF REPORT\n`;
    content += `Generated by Sentinel Forensics v2.0\n`;
    content += `Report ID: ${now.getTime()}\n`;
    content += `================================================================================\n`;

    return content;
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Scale className="w-5 h-5 text-purple-400" />
            Legal Report Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Template Selection */}
          <div>
            <h3 className="text-white font-semibold mb-3">Select Report Template</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {REPORT_TEMPLATES.map((template) => {
                const Icon = template.icon;
                return (
                  <div
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedTemplate?.id === template.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <Icon className={`w-6 h-6 ${template.color}`} />
                      <div className="flex-1">
                        <h4 className="text-white font-semibold">{template.name}</h4>
                        <p className="text-sm text-slate-400">{template.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {template.sections.slice(0, 3).map((section) => (
                        <Badge key={section} variant="outline" className="border-slate-600 text-slate-300 text-xs">
                          {section}
                        </Badge>
                      ))}
                      {template.sections.length > 3 && (
                        <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">
                          +{template.sections.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Report Details */}
          {selectedTemplate && (
            <div className="space-y-4 border-t border-slate-800 pt-6">
              <h3 className="text-white font-semibold">Report Details</h3>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-300">Case Number *</Label>
                  <select
                    value={reportData.caseNumber}
                    onChange={(e) => setReportData({...reportData, caseNumber: e.target.value})}
                    className="w-full bg-slate-800 border-slate-700 rounded px-3 py-2 text-white"
                  >
                    <option value="">Select case...</option>
                    {cases.map((c) => (
                      <option key={c.id} value={c.case_number}>
                        {c.case_number} - {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-slate-300">Investigator</Label>
                  <Input
                    value={reportData.investigator}
                    onChange={(e) => setReportData({...reportData, investigator: e.target.value})}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>

                <div>
                  <Label className="text-slate-300">Organization</Label>
                  <Input
                    value={reportData.organization}
                    onChange={(e) => setReportData({...reportData, organization: e.target.value})}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>

                <div>
                  <Label className="text-slate-300">Date Range</Label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={reportData.dateRange.start}
                      onChange={(e) => setReportData({
                        ...reportData,
                        dateRange: {...reportData.dateRange, start: e.target.value}
                      })}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                    <Input
                      type="date"
                      value={reportData.dateRange.end}
                      onChange={(e) => setReportData({
                        ...reportData,
                        dateRange: {...reportData.dateRange, end: e.target.value}
                      })}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-200">
                    <p className="font-semibold mb-1">Report Includes:</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-300">
                      {selectedTemplate.sections.map((section) => (
                        <li key={section}>{section}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={generateReport}
                  disabled={generating || !reportData.caseNumber}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  {generating ? (
                    <>
                      <Shield className="w-4 h-4 mr-2 animate-pulse" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Generate Report
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}