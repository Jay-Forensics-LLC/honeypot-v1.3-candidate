import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Database,
  Calendar,
  Hash,
  FileText,
  Download,
  Shield,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ExternalLink
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { Scale } from "lucide-react";
import { createPageUrl } from "../components/utils";
import { format } from "date-fns";
import EvidenceSharePanel from "../components/collaboration/EvidenceSharePanel";
import ForensicAnalysisPanel from "../components/evidence/ForensicAnalysisPanel";
import OCRProcessor from "../components/evidence/OCRProcessor";
import EvidenceTagging from "../components/evidence/EvidenceTagging";
import CourtroomModeView from "../components/evidence/CourtroomModeView";
import IOCHighlighter from "../components/evidence/IOCHighlighter";
import ChainOfCustodyTimeline from "../components/evidence/ChainOfCustodyTimeline";
import ExhibitAssignmentButton from "../components/evidence/ExhibitAssignmentButton";
import EvidenceConfidenceCard from "../components/evidence/EvidenceConfidenceCard";
import CrossCaseCorrelation from "../components/evidence/CrossCaseCorrelation";
import IntegrityMonitor from "../components/evidence/IntegrityMonitor";
import AnalysisPanel from "../components/evidence/AnalysisPanel";

export default function EvidenceDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const evidenceId = urlParams.get('id');
  const [courtroomMode, setCourtroomMode] = useState(false);

  const { data: evidence, isLoading, error } = useQuery({
    queryKey: ['evidence', evidenceId],
    queryFn: () => base44.entities.EvidenceV2.filter({ id: evidenceId }).then(data => data[0]),
    enabled: !!evidenceId
  });

  const { data: findings } = useQuery({
    queryKey: ['evidence-findings', evidenceId],
    queryFn: async () => {
      const results = await base44.entities.EvidenceFinding.filter({ evidence_id: evidenceId });
      return results || [];
    },
    enabled: !!evidenceId
  });

  const { data: caseData } = useQuery({
    queryKey: ['case', evidence?.case_id],
    queryFn: () => base44.entities.Case.filter({ id: evidence.case_id }).then(data => data[0]),
    enabled: !!evidence?.case_id
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !evidence) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <Card className="bg-red-900/20 border-red-500/30">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-400" />
            <h2 className="text-xl font-bold text-red-300 mb-2">Evidence Not Found</h2>
            <Link to={createPageUrl('Evidence')}>
              <Button className="bg-red-600 hover:bg-red-700">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Evidence
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (courtroomMode) {
    return <CourtroomModeView evidenceId={evidenceId} caseId={evidence?.case_id} />;
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6 pb-24 md:pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={createPageUrl('Evidence')}>
              <Button variant="outline" size="icon" className="border-slate-700">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-white">{evidence.title}</h1>
              </div>
              <p className="text-xs md:text-sm text-slate-400">Evidence #{evidence.evidence_number}</p>
            </div>
          </div>
          <Button
            onClick={() => setCourtroomMode(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Scale className="w-4 h-4 mr-2" />
            Courtroom Mode
          </Button>
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Evidence Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-400 mb-1">Type</p>
                <Badge className="bg-purple-500/20 text-purple-400">
                  {evidence.evidence_type}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Status</p>
                <Badge className={evidence.is_verified ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}>
                  {evidence.is_verified ? (
                    <>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Verified
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Pending Verification
                    </>
                  )}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Collected</p>
                <p className="text-white text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(evidence.collection_timestamp || evidence.created_date), 'MMM d, yyyy HH:mm')}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Case</p>
                {caseData && (
                  <Link to={createPageUrl(`CaseDetail?id=${caseData.id}`)}>
                    <p className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1">
                      {caseData.case_number}
                      <ExternalLink className="w-3 h-3" />
                    </p>
                  </Link>
                )}
              </div>
            </div>

            {evidence.description && (
              <div>
                <p className="text-sm text-slate-400 mb-1">Description</p>
                <p className="text-white text-sm leading-relaxed">
                  <IOCHighlighter text={evidence.description} caseId={evidence.case_id} />
                </p>
              </div>
            )}

            {(evidence.file_hash || evidence.file_hash_sha256 || evidence.sha256_hash) && (
              <div>
                <p className="text-sm text-slate-400 mb-1">File Hash (SHA-256)</p>
                <p className="text-white text-xs font-mono break-all bg-slate-800 p-2 rounded">
                  {evidence.file_hash || evidence.file_hash_sha256 || evidence.sha256_hash}
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-slate-700">
              <div className="mb-4">
                <p className="text-sm text-slate-400 mb-2">Exhibit Number</p>
                <ExhibitAssignmentButton evidenceId={evidenceId} caseId={evidence.case_id} />
              </div>
              <EvidenceTagging evidenceId={evidenceId} caseId={evidence.case_id} />
            </div>

            {evidence.file_url && (
              <Button
                onClick={() => window.open(evidence.file_url, '_blank')}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Evidence File
              </Button>
            )}
          </CardContent>
        </Card>

        <AnalysisPanel evidenceId={evidenceId} findings={findings || []} />

        <EvidenceConfidenceCard evidenceId={evidenceId} />

        <CrossCaseCorrelation evidenceId={evidenceId} />

        <IntegrityMonitor evidenceId={evidenceId} mode="single" />

        <OCRProcessor 
          evidenceId={evidenceId}
          evidenceType={evidence.evidence_type}
          onComplete={() => {}}
        />

        <EvidenceSharePanel evidenceId={evidenceId} />

        <ForensicAnalysisPanel 
          evidenceId={evidenceId} 
          existingAnalysis={evidence.analysis_results}
        />

        <ChainOfCustodyTimeline evidenceId={evidenceId} />
      </div>
    </div>
  );
}