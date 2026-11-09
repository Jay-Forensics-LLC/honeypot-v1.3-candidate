import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Edit, Save, X, FileText, Calendar, User, AlertTriangle,
  CheckCircle, Clock, Database, Loader2, Trash2, Sparkles, TrendingUp,
  FileDown, Lightbulb, ChevronDown, ChevronUp, Target, Network, Download, Send
} from "lucide-react";
import ReportHistory from "@/components/reports/ReportHistory";
import GenerateReportDialog from "@/components/reports/GenerateReportDialog";
import DistributionManager from "@/components/reports/DistributionManager";
import CorrelationTable from "@/components/correlation/CorrelationTable";
import IntelligenceGraph from "@/components/threat/IntelligenceGraph";
import CampaignTimeline from "@/components/threat/CampaignTimeline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CryptoUtils } from "../components/utils/CryptoUtils";
import { DateUtils } from "../components/utils/DateUtils";
import { createPageUrl } from "../components/utils";
import { useCaseTriage } from "../components/hooks/useCaseTriage";
import TriageAssessment from "../components/cases/TriageAssessment";
import CaseCollaboration from "../components/collaboration/CaseCollaboration";
import ChainOfCustodyTimeline from "../components/evidence/ChainOfCustodyTimeline";
import EndpointOperationsPanel from "../components/forensics/EndpointOperationsPanel";
import CaseReadinessIndicator from "../components/cases/CaseReadinessIndicator";
import AnalysisDisclaimerDialog from "../components/cases/AnalysisDisclaimerDialog";
import EvidenceIntakeForm from "../components/evidence/EvidenceIntakeForm";
import AdvancedEvidenceSearch from "../components/evidence/AdvancedEvidenceSearch";
import ReportTabs from "../components/reports/ReportTabs";
import ExhibitConfigPanel from "../components/cases/ExhibitConfigPanel";
import EvidenceSnapshotManager from "../components/evidence/EvidenceSnapshotManager";
import ForensicTimelineViewer from "../components/forensics/ForensicTimelineViewer";
import DisclosureReadinessPanel from "../components/cases/DisclosureReadinessPanel";
import AdversarialChallengeSimulator from "../components/cases/AdversarialChallengeSimulator";
import CaseAIAssistant from "../components/ai/CaseAIAssistant";
import AIFindingsWidget from "../components/ai/AIFindingsWidget";
import RoleBasedViewToggle from "../components/collaboration/RoleBasedViewToggle";
import CaseActivityFeed from "../components/collaboration/CaseActivityFeed";
import CaseRoleManager from "../components/collaboration/CaseRoleManager";
import LegalCaseSummary from "../components/collaboration/LegalCaseSummary";
import CaseMemberManager from "../components/collaboration/CaseMemberManager";
import CaseActivityTimeline from "../components/collaboration/CaseActivityTimeline";
import CaseTaskBoard from "../components/collaboration/CaseTaskBoard";
import ThreatIntelligencePanel from "../components/threat/ThreatIntelligencePanel";
import ComplianceDashboard from "../components/compliance/ComplianceDashboard";
import MobileDataViewer from "../components/mobile/MobileDataViewer";
import CorrelationPanel from "../components/mobile/CorrelationPanel";
import PlaybookManager from "../components/playbooks/PlaybookManager";

export default function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editData, setEditData] = useState({});
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [generatePackage, setGeneratePackage] = useState(false);
  const [aiData, setAiData] = useState({ suggestions: [], timeline: null, report: null });
  const [loadingAI, setLoadingAI] = useState({ suggestions: false, timeline: false, report: false });
  const [showAnalysisDisclaimer, setShowAnalysisDisclaimer] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState(null);
  const [showEvidenceIntake, setShowEvidenceIntake] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [viewMode, setViewMode] = useState('technical');
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showDistribution, setShowDistribution] = useState(false);
  const [selectedReportRun, setSelectedReportRun] = useState(null);
  
  const triageMutation = useCaseTriage();
  const triageData = caseData?.metadata?.triage;

  const { data: caseData, isLoading, error } = useQuery({
    queryKey: ['case', id],
    queryFn: async () => {
      const cases = await base44.entities.Case.filter({ id });
      return cases[0];
    },
    enabled: !!id
  });

  const { data: evidence = [] } = useQuery({
    queryKey: ['case-evidence', id],
    queryFn: () => base44.entities.Evidence.filter({ case_id: id }),
    enabled: !!id
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  // Fetch report runs
  const { data: reportRuns = [] } = useQuery({
    queryKey: ['report-runs', id],
    queryFn: () => base44.entities.ReportRun.filter({ case_id: id }),
    enabled: !!id
  });

  // Fetch templates
  const { data: templates = [] } = useQuery({
    queryKey: ['report-templates'],
    queryFn: () => base44.entities.ReportTemplate.filter({ is_active: true })
  });

  // Generate report mutation
  const generateReportMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('generateReport', {
        case_id: id,
        ...data
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-runs', id] });
      setShowReportDialog(false);
      toast.success('Report generated');
    },
    onError: (error) => {
      toast.error(error.message || 'Report generation failed');
    }
  });

  // Fetch threat intel data for visualization
  const { data: correlations = [] } = useQuery({
    queryKey: ['correlations', id],
    queryFn: async () => {
      const corr = await base44.entities.CorrelationGraph.list();
      return corr.filter(c => c.metadata?.case_id === id);
    },
    enabled: !!id
  });

  const { data: indicators = [] } = useQuery({
    queryKey: ['indicators', id],
    queryFn: () => base44.entities.Indicator.list(),
    enabled: !!id
  });

  const { data: threatActors = [] } = useQuery({
    queryKey: ['threat-actors'],
    queryFn: () => base44.entities.ThreatActor.list()
  });

  const { data: securityEvents = [] } = useQuery({
    queryKey: ['security-events', id],
    queryFn: () => base44.entities.SecurityEvent.filter({ case_id: id }),
    enabled: !!id
  });

  const updateCaseMutation = useMutation({
    mutationFn: async (data) => {
      const logEntry = await CryptoUtils.createSecureLogEntry({
        event_type: 'case_updated',
        severity: 'info',
        description: `Case ${caseData.case_number} updated`,
        user_id: user?.email || 'unknown',
        success: true,
        metadata: { case_id: id, changes: Object.keys(data) }
      });
      await base44.entities.AuditLog.create(logEntry);
      return base44.entities.Case.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', id] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      setIsEditing(false);
      toast.success('Case updated successfully');
    },
    onError: () => {
      toast.error('Failed to update case');
    }
  });

  const deleteCaseMutation = useMutation({
    mutationFn: async () => {
      const logEntry = await CryptoUtils.createSecureLogEntry({
        event_type: 'case_deleted',
        severity: 'warning',
        description: `Case ${caseData.case_number} deleted`,
        user_id: user?.email || 'unknown',
        success: true,
        metadata: { case_id: id }
      });
      await base44.entities.AuditLog.create(logEntry);
      return base44.entities.Case.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success('Case deleted');
      navigate(createPageUrl('Cases'));
    },
    onError: () => {
      toast.error('Failed to delete case');
    }
  });

  const runAIAnalysis = async (analysisType) => {
    // Gate 4: Check if analysis disclaimer has been acknowledged
    if (!caseData?.analysis_disclaimer_acknowledged) {
      setPendingAnalysis(analysisType);
      setShowAnalysisDisclaimer(true);
      return;
    }

    setLoadingAI(prev => ({ ...prev, [analysisType]: true }));
    try {
      const { data } = await base44.functions.invoke('aiCaseAnalysis', {
        caseId: id,
        analysisType
      });
      
      if (analysisType === 'suggest_evidence') {
        setAiData(prev => ({ ...prev, suggestions: data.suggestions || [] }));
        setShowSuggestions(true);
      } else if (analysisType === 'predict_timeline') {
        setAiData(prev => ({ ...prev, timeline: data.timeline }));
        setShowTimeline(true);
      } else if (analysisType === 'generate_report') {
        setAiData(prev => ({ ...prev, report: data.report }));
        setShowReport(true);
      }
      toast.success('AI analysis complete');
    } catch (error) {
      toast.error('AI analysis failed: ' + error.message);
    } finally {
      setLoadingAI(prev => ({ ...prev, [analysisType]: false }));
    }
  };

  const handleStartEdit = () => {
    setEditData({
      title: caseData.title,
      description: caseData.description,
      case_type: caseData.case_type,
      priority: caseData.priority,
      status: caseData.status
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateCaseMutation.mutate(editData);
  };

  const getStatusColor = (status) => {
    const colors = {
      open: 'bg-green-500/20 text-green-300 border-green-500/50',
      active: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
      under_review: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
      closed: 'bg-slate-500/20 text-slate-300 border-slate-500/50',
      archived: 'bg-purple-500/20 text-purple-300 border-purple-500/50'
    };
    return colors[status] || colors.open;
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: 'bg-blue-500/20 text-blue-300',
      medium: 'bg-yellow-500/20 text-yellow-300',
      high: 'bg-orange-500/20 text-orange-300',
      critical: 'bg-red-500/20 text-red-300'
    };
    return colors[priority] || colors.medium;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-400" />
          <p className="text-white">Loading case details...</p>
        </div>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
        <Card className="bg-red-950/20 border-red-500 max-w-md">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Case Not Found</h2>
            <p className="text-red-200 mb-4">The requested case could not be loaded.</p>
            <Button onClick={() => navigate(createPageUrl('Cases'))} className="bg-red-600 hover:bg-red-700">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Cases
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate(createPageUrl('Cases'))}
              className="text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl md:text-3xl font-bold text-white">{caseData.title}</h1>
                <CaseReadinessIndicator caseData={caseData} evidenceCount={evidence.length} />
              </div>
              <p className="text-slate-400 text-sm">{caseData.case_number}</p>
            </div>
          </div>
          <RoleBasedViewToggle
            currentView={viewMode}
            onViewChange={setViewMode}
            userRole={user?.role}
          />
          <div className="flex gap-2 flex-wrap">
            {!isEditing ? (
              <>
                <Button onClick={handleStartEdit} className="bg-blue-600 hover:bg-blue-700">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button
                  onClick={() => setDeleteConfirm(true)}
                  variant="outline"
                  className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </>
            ) : (
              <>
                <Button onClick={handleSave} disabled={updateCaseMutation.isPending} className="bg-green-600 hover:bg-green-700">
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button onClick={() => setIsEditing(false)} variant="outline" className="border-slate-700">
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Triage Assessment */}
        {triageData && (
          <TriageAssessment 
            triage={triageData} 
            onRetriage={() => triageMutation.mutate(id)}
          />
        )}

        {/* Auto-Triage Button */}
        {!triageData && (
          <Card className="bg-gradient-to-r from-orange-900/20 to-red-900/20 border-orange-500/30">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Target className="w-10 h-10 text-orange-400" />
                <div>
                  <h3 className="text-white font-semibold">AI Triage Required</h3>
                  <p className="text-sm text-slate-400">Run automated case triage to classify priority and get investigation recommendations</p>
                </div>
              </div>
              <Button
                onClick={() => triageMutation.mutate(id)}
                disabled={triageMutation.isPending}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {triageMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Target className="w-4 h-4 mr-2" />
                )}
                Run Triage
              </Button>
            </CardContent>
          </Card>
        )}

        {/* AI Investigative Assistant */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            {showAIAssistant ? (
              <CaseAIAssistant caseId={id} onClose={() => setShowAIAssistant(false)} />
            ) : (
              <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30">
                <CardContent className="p-8 text-center">
                  <Sparkles className="w-16 h-16 mx-auto mb-4 text-purple-400" />
                  <h3 className="text-xl font-semibold text-white mb-2">AI Investigative Assistant</h3>
                  <p className="text-slate-300 mb-6">
                    Ask questions, analyze patterns, get recommendations
                  </p>
                  <Button
                    onClick={() => setShowAIAssistant(true)}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Launch AI Assistant
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
          <div>
            <AIFindingsWidget caseId={id} />
          </div>
        </div>

        {/* Evidence Suggestions */}
        {aiData.suggestions.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-white flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-yellow-400" />
                  AI Evidence Suggestions
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowSuggestions(!showSuggestions)}>
                  {showSuggestions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </div>
            </CardHeader>
            {showSuggestions && (
              <CardContent>
                <div className="space-y-3">
                  {aiData.suggestions.map((suggestion, idx) => (
                    <Card key={idx} className="bg-slate-800/50 border-slate-700">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h4 className="text-white font-semibold mb-1">{suggestion.title}</h4>
                            <p className="text-sm text-slate-400 mb-2">{suggestion.rationale}</p>
                            <div className="flex gap-2">
                              <Badge className="bg-purple-500/20 text-purple-300">{suggestion.evidence_type}</Badge>
                              <Badge className={
                                suggestion.priority === 'high' ? 'bg-red-500/20 text-red-300' :
                                suggestion.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                                'bg-blue-500/20 text-blue-300'
                              }>
                                {suggestion.priority} priority
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Timeline Prediction */}
        {aiData.timeline && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                  Predicted Timeline
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowTimeline(!showTimeline)}>
                  {showTimeline ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </div>
            </CardHeader>
            {showTimeline && (
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-blue-400">{aiData.timeline.estimated_days}</p>
                    <p className="text-sm text-slate-400">Days to completion</p>
                  </div>
                  <div className="flex-1">
                    <Badge className={
                      aiData.timeline.confidence === 'high' ? 'bg-green-500/20 text-green-300' :
                      aiData.timeline.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                      'bg-red-500/20 text-red-300'
                    }>
                      {aiData.timeline.confidence} confidence
                    </Badge>
                  </div>
                </div>

                {aiData.timeline.milestones?.length > 0 && (
                  <div>
                    <h4 className="text-white font-semibold mb-2">Key Milestones</h4>
                    <div className="space-y-2">
                      {aiData.timeline.milestones.map((milestone, idx) => (
                        <div key={idx} className="flex items-center gap-3 text-sm">
                          <CheckCircle className="w-4 h-4 text-green-400" />
                          <span className="text-white">{milestone.name}</span>
                          <span className="text-slate-400">~{milestone.estimated_days} days</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiData.timeline.risk_factors?.length > 0 && (
                  <div>
                    <h4 className="text-white font-semibold mb-2">Risk Factors</h4>
                    <div className="space-y-1">
                      {aiData.timeline.risk_factors.map((risk, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm">
                          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5" />
                          <span className="text-slate-300">{risk}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )}

        {/* Case Info */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Case Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-white">Title</Label>
                    <Input
                      value={editData.title}
                      onChange={(e) => setEditData({...editData, title: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Description</Label>
                    <Textarea
                      value={editData.description}
                      onChange={(e) => setEditData({...editData, description: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white h-24"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white">Type</Label>
                      <Select value={editData.case_type} onValueChange={(v) => setEditData({...editData, case_type: v})}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="network_intrusion">Network Intrusion</SelectItem>
                          <SelectItem value="device_compromise">Device Compromise</SelectItem>
                          <SelectItem value="data_breach">Data Breach</SelectItem>
                          <SelectItem value="malware_analysis">Malware Analysis</SelectItem>
                          <SelectItem value="surveillance_detection">Surveillance Detection</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white">Priority</Label>
                      <Select value={editData.priority} onValueChange={(v) => setEditData({...editData, priority: v})}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Status</Label>
                    <Select value={editData.status} onValueChange={(v) => setEditData({...editData, status: v})}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="under_review">Under Review</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Description</p>
                    <p className="text-white">{caseData.description || 'No description'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-500 mb-1">Status</p>
                      <Badge className={getStatusColor(caseData.status)}>
                        {caseData.status?.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 mb-1">Priority</p>
                      <Badge className={getPriorityColor(caseData.priority)}>
                        {caseData.priority?.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Type</p>
                    <p className="text-white">{caseData.case_type?.replace('_', ' ')}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Case Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-blue-400" />
                <div>
                  <p className="text-sm text-slate-500">Created</p>
                  <p className="text-white">{DateUtils.safeFormatDate(caseData.start_date || caseData.created_date)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-purple-400" />
                <div>
                  <p className="text-sm text-slate-500">Assigned To</p>
                  <p className="text-white">{caseData.assigned_investigator || 'Unassigned'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-sm text-slate-500">Evidence Items</p>
                  <p className="text-white">{evidence.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Exhibit Configuration */}
        <ExhibitConfigPanel caseId={id} />

        {/* Evidence Snapshots */}
        <EvidenceSnapshotManager caseId={id} selectedEvidenceIds={evidence.map(e => e.id)} />

        {/* Forensic Timeline */}
        <ForensicTimelineViewer caseId={id} />

        {/* Disclosure Readiness */}
        <DisclosureReadinessPanel caseId={id} />

        {/* Adversarial Challenge Simulator */}
        <AdversarialChallengeSimulator caseId={id} />

        {/* Threat Intelligence */}
        <ThreatIntelligencePanel caseId={id} />

        {/* Compliance Assessment */}
        <ComplianceDashboard caseId={id} />

        {/* Mobile Forensics */}
        <div className="grid md:grid-cols-2 gap-6">
          <MobileDataViewer caseId={id} />
          <CorrelationPanel caseId={id} />
        </div>

        {/* Incident Response Playbooks */}
        <PlaybookManager caseId={id} />

        {/* Advanced Evidence Search */}
        <AdvancedEvidenceSearch caseId={id} />

        {/* Evidence Intake (Phase 2) */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-white">Evidence Collection</CardTitle>
              <Button
                onClick={() => setShowEvidenceIntake(!showEvidenceIntake)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {showEvidenceIntake ? 'Hide' : 'Add Evidence'}
              </Button>
            </div>
          </CardHeader>
          {showEvidenceIntake && (
            <CardContent>
              <EvidenceIntakeForm
                caseId={id}
                caseData={caseData}
                onComplete={() => {
                  queryClient.invalidateQueries({ queryKey: ['case-evidence', id] });
                  queryClient.invalidateQueries({ queryKey: ['case', id] });
                  setShowEvidenceIntake(false);
                }}
              />
            </CardContent>
          )}
        </Card>

        {/* AI Analytics Quick Link */}
        <Card className="bg-gradient-to-r from-red-900/20 to-purple-900/20 border-red-500/30">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Sparkles className="w-10 h-10 text-red-400" />
              <div>
                <h3 className="text-white font-semibold">AI-Driven Analytics</h3>
                <p className="text-sm text-slate-400">
                  Run network, memory, and behavior anomaly detection
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate(createPageUrl(`CaseDetail/${id}/AIAnalytics`))}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Launch Analytics
            </Button>
          </CardContent>
        </Card>

        {/* Endpoint Operations */}
        <EndpointOperationsPanel 
          caseId={id} 
          onEvidenceCollected={() => queryClient.invalidateQueries({ queryKey: ['case-evidence', id] })}
        />

        {/* Report Generation (PHASE 1-7) */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-red-400" />
                Report Management
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowReportDialog(true)}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Generate Report
                </Button>
                {reportRuns.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setShowDistribution(!showDistribution)}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Distribute
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ReportHistory 
              runs={reportRuns} 
              onSelectRun={(run) => setSelectedReportRun(run.id)}
            />
            
            {showDistribution && selectedReportRun && (
              <DistributionManager reportRunId={selectedReportRun} />
            )}
          </CardContent>
        </Card>

        {/* IOC Correlations with Risk Scoring */}
        <CorrelationTable caseId={id} />

        {/* Intelligence Graph Visualization */}
        <IntelligenceGraph
          correlations={correlations}
          indicators={indicators.filter(i => 
            correlations.some(c => c.target_id === i.id)
          )}
          threatActors={threatActors.filter(a => 
            a.associated_iocs?.some(iocId => indicators.some(i => i.id === iocId))
          )}
          caseId={id}
        />

        {/* Campaign Timeline Overlay */}
        {threatActors.length > 0 && (
          <CampaignTimeline
            campaigns={threatActors.flatMap(a => a.campaigns || [])}
            caseEvents={securityEvents}
            caseStartDate={caseData?.start_date}
          />
        )}

        {/* Unified Report Management (Legacy - keeping for backward compat) */}
        <ReportTabs caseId={id} caseData={caseData} />

        {/* NEW: Multi-User Collaboration System */}
        <div className="space-y-6">
          {/* Member Management */}
          <CaseMemberManager caseId={id} caseData={caseData} />
          
          {/* Task Board */}
          <CaseTaskBoard caseId={id} />
          
          {/* Activity Timeline */}
          <CaseActivityTimeline caseId={id} />
        </div>

        {/* Original Collaboration (DEPRECATED - kept for backward compat) */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <CaseActivityFeed caseId={id} />
          </div>
          <div>
            <CaseRoleManager caseId={id} />
          </div>
        </div>

        {/* Role-Based Summary */}
        <LegalCaseSummary caseId={id} viewMode={viewMode} />

        {/* Original Collaboration (Tasks/Messages) */}
        <CaseCollaboration caseId={id} />

        {/* Chain of Custody for Case */}
        {evidence.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                Complete Chain of Custody
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-400 text-sm mb-4">
                Immutable audit trail for all evidence items in this case
              </p>
              {evidence.map((item) => (
                <div key={item.id} className="mb-6 last:mb-0">
                  <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    {item.title}
                  </h4>
                  <ChainOfCustodyTimeline evidenceId={item.id} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Evidence */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Associated Evidence ({evidence.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {evidence.length === 0 ? (
              <div className="text-center py-12">
                <Database className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">No evidence linked to this case</p>
                <Button
                  onClick={() => navigate(createPageUrl('Evidence'))}
                  className="mt-4 bg-blue-600 hover:bg-blue-700"
                >
                  Upload Evidence
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {evidence.map((item) => (
                  <Card key={item.id} className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-blue-400" />
                        <div>
                          <p className="text-white font-medium">{item.title}</p>
                          <p className="text-sm text-slate-400">{item.evidence_type?.replace('_', ' ')}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => navigate(createPageUrl(`EvidenceDetail/${item.id}`))}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        View
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Analysis Disclaimer (Gate 4) */}
      <AnalysisDisclaimerDialog
        open={showAnalysisDisclaimer}
        onClose={() => {
          setShowAnalysisDisclaimer(false);
          setPendingAnalysis(null);
        }}
        onAcknowledge={async () => {
          await base44.entities.Case.update(id, {
            analysis_disclaimer_acknowledged: true,
            analysis_disclaimer_timestamp: new Date().toISOString()
          });
          queryClient.invalidateQueries({ queryKey: ['case', id] });
          setShowAnalysisDisclaimer(false);
          
          // Run the pending analysis
          if (pendingAnalysis) {
            setTimeout(() => runAIAnalysis(pendingAnalysis), 100);
            setPendingAnalysis(null);
          }
        }}
      />

      {/* Generated Report Dialog */}
      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI-Generated Incident Report</DialogTitle>
          </DialogHeader>
          {aiData.report && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">Executive Summary</h3>
                <p className="text-slate-300 whitespace-pre-wrap">{aiData.report.executive_summary}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">Incident Overview</h3>
                <p className="text-slate-300 whitespace-pre-wrap">{aiData.report.incident_overview}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">Investigation Methodology</h3>
                <p className="text-slate-300 whitespace-pre-wrap">{aiData.report.methodology}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">Findings</h3>
                <p className="text-slate-300 whitespace-pre-wrap">{aiData.report.findings}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">Technical Analysis</h3>
                <p className="text-slate-300 whitespace-pre-wrap">{aiData.report.technical_analysis}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">Conclusions</h3>
                <p className="text-slate-300 whitespace-pre-wrap">{aiData.report.conclusions}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">Recommendations</h3>
                <p className="text-slate-300 whitespace-pre-wrap">{aiData.report.recommendations}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate Report Dialog */}
      <GenerateReportDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        templates={templates}
        onGenerate={(data) => generateReportMutation.mutate(data)}
        isLoading={generateReportMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Case</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete this case? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCaseMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}