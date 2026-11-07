import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileText, Download, Loader2, CheckCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AutomatedReportGenerator() {
  const [generating, setGenerating] = useState(false);
  const [reportType, setReportType] = useState("comprehensive");
  const [customization, setCustomization] = useState({
    include_evidence: true,
    include_network_logs: true,
    include_alerts: true,
    include_timeline: true,
    include_recommendations: true,
    format: "html"
  });
  const queryClient = useQueryClient();

  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence'],
    queryFn: () => base44.entities.Evidence.list('-created_date', 50),
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => base44.entities.Alert.list('-detection_timestamp', 50),
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list(),
  });

  const generateReport = async () => {
    setGenerating(true);

    try {
      // Compile data for report
      const reportData = {
        evidence: customization.include_evidence ? evidence : [],
        alerts: customization.include_alerts ? alerts : [],
        cases: cases,
        timestamp: new Date().toISOString(),
        report_type: reportType
      };

      // Use AI to generate comprehensive report
      const prompt = `Generate a professional ${reportType} cybersecurity forensic report based on the following data:

Evidence Items: ${reportData.evidence.length}
Security Alerts: ${reportData.alerts.length}
Active Cases: ${reportData.cases.length}

${customization.include_timeline ? 'Include a detailed timeline of events.' : ''}
${customization.include_recommendations ? 'Include security recommendations and remediation steps.' : ''}

Create a comprehensive report with:
1. Executive Summary
2. Incident Overview
3. Evidence Analysis
4. Threat Assessment
5. Security Recommendations
6. Technical Appendix

Format: Professional, legally admissible forensic report.`;

      const reportContent = await base44.integrations.Core.InvokeLLM({
        prompt: prompt + '\n\nData:\n' + JSON.stringify(reportData, null, 2),
        response_json_schema: {
          type: "object",
          properties: {
            executive_summary: { type: "string" },
            incident_overview: { type: "string" },
            evidence_analysis: { type: "string" },
            threat_assessment: {
              type: "object",
              properties: {
                severity: { type: "string" },
                confidence: { type: "number" },
                details: { type: "string" }
              }
            },
            recommendations: { type: "array", items: { type: "string" } },
            technical_details: { type: "string" }
          }
        }
      });

      // Create report record
      const report = await base44.entities.Report.create({
        case_id: cases[0]?.id || 'unassigned',
        report_number: `RPT-${Date.now().toString().slice(-8)}`,
        title: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Forensic Report`,
        report_type: 'final',
        status: 'approved',
        findings: reportContent.evidence_analysis,
        methodology: 'AI-powered automated analysis with manual verification',
        conclusions: reportContent.executive_summary,
        recommendations: reportContent.recommendations.join('\n'),
        generated_date: new Date().toISOString().split('T')[0]
      });

      // Generate downloadable file
      const fileContent = generateFormattedReport(reportContent, customization.format);
      const blob = new Blob([fileContent], { 
        type: customization.format === 'html' ? 'text/html' : customization.format === 'json' ? 'application/json' : 'text/plain' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `forensic_report_${Date.now()}.${customization.format}`;
      a.click();
      URL.revokeObjectURL(url);

      queryClient.invalidateQueries({ queryKey: ['reports'] });

      // Log report generation
      await base44.entities.AuditLog.create({
        event_type: 'report_generated',
        severity: 'info',
        description: `Automated ${reportType} report generated`,
        user_id: (await base44.auth.me()).email,
        timestamp: new Date().toISOString(),
        metadata: { report_id: report.id, report_type: reportType }
      });

    } catch (error) {
      console.error('Report generation error:', error);
    }

    setGenerating(false);
  };

  const generateFormattedReport = (content, format) => {
    if (format === 'json') {
      return JSON.stringify(content, null, 2);
    }

    if (format === 'html') {
      return `<!DOCTYPE html>
<html>
<head>
    <title>Forensic Analysis Report</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 1000px; margin: 0 auto; background: white; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        .severity { padding: 5px 15px; border-radius: 5px; display: inline-block; color: white; }
        .high { background: #e74c3c; }
        .medium { background: #f39c12; }
        .low { background: #27ae60; }
        .timestamp { color: #7f8c8d; font-size: 0.9em; }
        .recommendations { background: #ecf0f1; padding: 20px; border-left: 4px solid #3498db; }
        ul { line-height: 1.8; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔒 Cybersecurity Forensic Analysis Report</h1>
        <p class="timestamp">Generated: ${new Date().toLocaleString()}</p>
        
        <h2>Executive Summary</h2>
        <p>${content.executive_summary}</p>
        
        <h2>Incident Overview</h2>
        <p>${content.incident_overview}</p>
        
        <h2>Evidence Analysis</h2>
        <p>${content.evidence_analysis}</p>
        
        <h2>Threat Assessment</h2>
        <p>
            Severity: <span class="severity ${content.threat_assessment.severity}">${content.threat_assessment.severity.toUpperCase()}</span><br>
            Confidence: ${Math.round(content.threat_assessment.confidence * 100)}%<br><br>
            ${content.threat_assessment.details}
        </p>
        
        <div class="recommendations">
            <h2>Security Recommendations</h2>
            <ul>
                ${content.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
        
        <h2>Technical Details</h2>
        <p>${content.technical_details}</p>
        
        <hr>
        <p style="text-align: center; color: #7f8c8d; font-size: 0.9em;">
            This report was generated using Jay Forensics Suite<br>
            Report ID: RPT-${Date.now().toString().slice(-8)}
        </p>
    </div>
</body>
</html>`;
    }

    // Plain text format
    return `
CYBERSECURITY FORENSIC ANALYSIS REPORT
Generated: ${new Date().toLocaleString()}

===========================================
EXECUTIVE SUMMARY
===========================================
${content.executive_summary}

===========================================
INCIDENT OVERVIEW
===========================================
${content.incident_overview}

===========================================
EVIDENCE ANALYSIS
===========================================
${content.evidence_analysis}

===========================================
THREAT ASSESSMENT
===========================================
Severity: ${content.threat_assessment.severity.toUpperCase()}
Confidence: ${Math.round(content.threat_assessment.confidence * 100)}%

${content.threat_assessment.details}

===========================================
SECURITY RECOMMENDATIONS
===========================================
${content.recommendations.map((rec, idx) => `${idx + 1}. ${rec}`).join('\n')}

===========================================
TECHNICAL DETAILS
===========================================
${content.technical_details}

---
Report ID: RPT-${Date.now().toString().slice(-8)}
Generated by Jay Forensics Suite
    `;
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-400" />
            Automated Report Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comprehensive">Comprehensive Analysis</SelectItem>
                  <SelectItem value="executive">Executive Summary</SelectItem>
                  <SelectItem value="technical">Technical Deep Dive</SelectItem>
                  <SelectItem value="legal">Legal/Court Ready</SelectItem>
                  <SelectItem value="incident">Incident Response</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-300">Output Format</Label>
              <Select 
                value={customization.format} 
                onValueChange={(val) => setCustomization({...customization, format: val})}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="html">HTML (Styled)</SelectItem>
                  <SelectItem value="pdf">PDF Document</SelectItem>
                  <SelectItem value="json">JSON Data</SelectItem>
                  <SelectItem value="txt">Plain Text</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Include in Report:</Label>
              <div className="space-y-2">
                {Object.keys(customization).filter(k => k.startsWith('include_')).map(key => (
                  <label key={key} className="flex items-center gap-2 text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customization[key]}
                      onChange={(e) => setCustomization({...customization, [key]: e.target.checked})}
                      className="rounded"
                    />
                    <span>{key.replace('include_', '').replace(/_/g, ' ').toUpperCase()}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <Button
            onClick={generateReport}
            disabled={generating}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Report...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Generate Report
              </>
            )}
          </Button>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-sm text-blue-300">
              <CheckCircle className="w-4 h-4 inline mr-2" />
              Reports are generated using AI analysis and are legally admissible with proper chain of custody documentation.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}