import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Brain, FileText, Calendar, AlertTriangle, CheckCircle, Loader2, Scale, Gavel } from 'lucide-react';
import { toast } from 'sonner';

export default function LegalAIAssistant({ legalCaseId }) {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [documentContent, setDocumentContent] = useState('');
  const [documentType, setDocumentType] = useState('motion');
  const [documentName, setDocumentName] = useState('');
  const [advancedAnalysisType, setAdvancedAnalysisType] = useState('extract_terms');
  const [advancedContent, setAdvancedContent] = useState('');
  const [advancedResult, setAdvancedResult] = useState(null);
  const [motionType, setMotionType] = useState('motion_to_compel');
  const [motionFacts, setMotionFacts] = useState('');
  const [draftedMotion, setDraftedMotion] = useState(null);
  const [discoveryType, setDiscoveryType] = useState('interrogatories');
  const [discoveryRequests, setDiscoveryRequests] = useState('');
  const [discoveryResponses, setDiscoveryResponses] = useState(null);
  const [communicationType, setCommunicationType] = useState('status_update');
  const [communicationContext, setCommunicationContext] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [generatedCommunication, setGeneratedCommunication] = useState(null);
  const [filingType, setFilingType] = useState('motion');
  const [filingContent, setFilingContent] = useState('');
  const [filingAnalysis, setFilingAnalysis] = useState(null);

  const { data: analyses = [] } = useQuery({
    queryKey: ['legal-analyses', legalCaseId],
    queryFn: () => base44.entities.LegalDocumentAnalysis.filter({ legal_case_id: legalCaseId }),
    enabled: !!legalCaseId
  });

  const analyzeMutation = useMutation({
    mutationFn: ({ legal_case_id, document_name, document_type, document_content }) =>
      base44.functions.invoke('analyzeLegalDocument', { legal_case_id, document_name, document_type, document_content }),
    onSuccess: () => {
      queryClient.invalidateQueries(['legal-analyses']);
      setDocumentContent('');
      setDocumentName('');
      toast.success('Document analyzed');
    }
  });

  const deadlineCheckMutation = useMutation({
    mutationFn: ({ legal_case_id }) => base44.functions.invoke('checkDiscoveryDeadlines', { legal_case_id }),
    onSuccess: (data) => {
      if (data.critical > 0 || data.urgent > 0) {
        toast.error(`${data.critical + data.urgent} urgent deadlines detected`);
      } else {
        toast.success('All deadlines are on track');
      }
    }
  });

  const advancedAnalysisMutation = useMutation({
    mutationFn: (params) => base44.functions.invoke('advancedLegalAnalysis', params),
    onSuccess: (data) => {
      setAdvancedResult(data.result);
      toast.success('Analysis complete');
    }
  });

  const draftMotionMutation = useMutation({
    mutationFn: ({ legal_case_id, motion_type, facts }) =>
      base44.functions.invoke('draftLegalMotion', { legal_case_id, motion_type, facts }),
    onSuccess: (data) => {
      setDraftedMotion(data);
      queryClient.invalidateQueries(['attorney-work-product']);
      toast.success('Motion drafted successfully');
    }
  });

  const discoveryResponseMutation = useMutation({
    mutationFn: ({ legal_case_id, discovery_type, requests, case_facts }) =>
      base44.functions.invoke('generateDiscoveryResponse', { legal_case_id, discovery_type, requests, case_facts }),
    onSuccess: (data) => {
      setDiscoveryResponses(data.responses);
      queryClient.invalidateQueries(['attorney-work-product']);
      toast.success('Discovery responses generated');
    }
  });

  const clientCommunicationMutation = useMutation({
    mutationFn: ({ legal_case_id, communication_type, context, recipient_name }) =>
      base44.functions.invoke('generateClientCommunication', { legal_case_id, communication_type, context, recipient_name }),
    onSuccess: (data) => {
      setGeneratedCommunication(data.communication);
      queryClient.invalidateQueries(['attorney-work-product']);
      toast.success('Communication generated');
    }
  });

  const opposingCounselAnalysisMutation = useMutation({
    mutationFn: ({ legal_case_id, filing_content, filing_type }) =>
      base44.functions.invoke('analyzeOpposingCounselFiling', { legal_case_id, filing_content, filing_type }),
    onSuccess: (data) => {
      setFilingAnalysis(data);
      queryClient.invalidateQueries(['attorney-work-product']);
      toast.success('Filing analyzed');
    }
  });

  const handleAnalyze = () => {
    if (!documentContent.trim() || !documentName.trim()) {
      toast.error('Please provide document name and content');
      return;
    }

    analyzeMutation.mutate({
      legal_case_id: legalCaseId,
      document_name: documentName,
      document_type: documentType,
      document_content: documentContent
    });
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-400" />
            Legal AI Assistant
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="analyze">
            <TabsList className="bg-slate-800 grid grid-cols-2 lg:grid-cols-8 gap-1">
              <TabsTrigger value="analyze">Analysis</TabsTrigger>
              <TabsTrigger value="motions">Motions</TabsTrigger>
              <TabsTrigger value="discovery">Discovery</TabsTrigger>
              <TabsTrigger value="client">Client Comms</TabsTrigger>
              <TabsTrigger value="opposing">Opposing Analysis</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
              <TabsTrigger value="deadlines">Deadlines</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="analyze" className="space-y-4 mt-4">
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Document name"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
                />
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
                >
                  <option value="pleading">Pleading</option>
                  <option value="motion">Motion</option>
                  <option value="brief">Brief</option>
                  <option value="discovery_request">Discovery Request</option>
                  <option value="court_order">Court Order</option>
                  <option value="evidence_submission">Evidence Submission</option>
                </select>
                <Textarea
                  placeholder="Paste legal document content here..."
                  value={documentContent}
                  onChange={(e) => setDocumentContent(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white min-h-[300px] font-mono"
                />
                <Button 
                  onClick={handleAnalyze} 
                  disabled={analyzeMutation.isLoading || !documentContent.trim()}
                  className="w-full"
                >
                  {analyzeMutation.isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4 mr-2" />
                      Analyze Document
                    </>
                  )}
                </Button>

              </div>
            </TabsContent>

            <TabsContent value="motions" className="space-y-4 mt-4">
              <div className="space-y-4">
                <Card className="bg-blue-900/20 border-blue-500/30">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <Gavel className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-blue-300 font-semibold mb-1">AI Motion Drafter</h3>
                        <p className="text-blue-200 text-sm">
                          Generate court-ready motion drafts based on case specifics and identified evidence gaps. 
                          All drafts are saved as privileged attorney work product.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-slate-300 mb-2 block">Motion Type</label>
                    <select
                      value={motionType}
                      onChange={(e) => setMotionType(e.target.value)}
                      className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
                    >
                      <option value="motion_to_compel">Motion to Compel Discovery</option>
                      <option value="motion_for_continuance">Motion for Continuance</option>
                      <option value="motion_in_limine">Motion in Limine</option>
                      <option value="motion_for_summary_judgment">Motion for Summary Judgment</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-slate-300 mb-2 block">
                      Case Facts & Evidence Gaps
                      {analyses.length > 0 && analyses[0]?.analysis_results?.evidence_gaps?.length > 0 && (
                        <Badge className="ml-2 bg-yellow-500/20 text-yellow-300">
                          {analyses[0].analysis_results.evidence_gaps.length} gaps identified
                        </Badge>
                      )}
                    </label>
                    <Textarea
                      placeholder="Enter relevant facts, evidence gaps, and supporting details for the motion..."
                      value={motionFacts}
                      onChange={(e) => setMotionFacts(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white min-h-[200px]"
                    />
                    {analyses.length > 0 && analyses[0]?.analysis_results?.evidence_gaps?.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const gaps = analyses[0].analysis_results.evidence_gaps.join('\n- ');
                          setMotionFacts(prev => prev + (prev ? '\n\n' : '') + 'Evidence Gaps:\n- ' + gaps);
                        }}
                        className="mt-2 text-xs text-blue-400"
                      >
                        Insert Evidence Gaps from Latest Analysis
                      </Button>
                    )}
                  </div>

                  <Button
                    onClick={() => draftMotionMutation.mutate({
                      legal_case_id: legalCaseId,
                      motion_type: motionType,
                      facts: motionFacts
                    })}
                    disabled={draftMotionMutation.isLoading || !motionFacts.trim()}
                    className="w-full"
                  >
                    {draftMotionMutation.isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Drafting Motion...
                      </>
                    ) : (
                      <>
                        <Scale className="w-4 h-4 mr-2" />
                        Generate Motion Draft
                      </>
                    )}
                  </Button>

                  {draftedMotion && (
                    <Card className="bg-green-900/20 border-green-500/30">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3 mb-3">
                          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="text-green-300 font-semibold mb-1">Motion Successfully Drafted</h4>
                            <p className="text-green-200 text-sm">
                              Saved as privileged attorney work product. Access in the Work Product tab.
                            </p>
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded p-3 border border-slate-700">
                          <p className="text-xs text-slate-400 mb-2 font-mono">Preview (first 500 characters):</p>
                          <p className="text-sm text-slate-300 font-mono whitespace-pre-wrap">
                            {draftedMotion.draft_preview}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="discovery" className="space-y-4 mt-4">
              <div className="space-y-4">
                <Card className="bg-purple-900/20 border-purple-500/30">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <FileText className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-purple-300 font-semibold mb-1">Discovery Response Generator</h3>
                        <p className="text-purple-200 text-sm">
                          Generate comprehensive responses to interrogatories, requests for production, and requests for admission with appropriate objections.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-slate-300 mb-2 block">Discovery Type</label>
                    <select
                      value={discoveryType}
                      onChange={(e) => setDiscoveryType(e.target.value)}
                      className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
                    >
                      <option value="interrogatories">Interrogatories</option>
                      <option value="requests_for_production">Requests for Production</option>
                      <option value="requests_for_admission">Requests for Admission</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-slate-300 mb-2 block">Discovery Requests to Respond To</label>
                    <Textarea
                      placeholder="Paste the discovery requests here (numbered)..."
                      value={discoveryRequests}
                      onChange={(e) => setDiscoveryRequests(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white min-h-[250px] font-mono text-sm"
                    />
                  </div>

                  <Button
                    onClick={() => discoveryResponseMutation.mutate({
                      legal_case_id: legalCaseId,
                      discovery_type: discoveryType,
                      requests: discoveryRequests,
                      case_facts: analyses[0]?.analysis_results?.key_arguments?.join('\n') || ''
                    })}
                    disabled={discoveryResponseMutation.isLoading || !discoveryRequests.trim()}
                    className="w-full"
                  >
                    {discoveryResponseMutation.isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating Responses...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4 mr-2" />
                        Generate Discovery Responses
                      </>
                    )}
                  </Button>

                  {discoveryResponses && (
                    <Card className="bg-green-900/20 border-green-500/30">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3 mb-3">
                          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="text-green-300 font-semibold mb-1">Responses Generated</h4>
                            <p className="text-green-200 text-sm">Saved as privileged attorney work product</p>
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded p-3 border border-slate-700 max-h-96 overflow-y-auto">
                          <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono">{discoveryResponses}</pre>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="client" className="space-y-4 mt-4">
              <div className="space-y-4">
                <Card className="bg-cyan-900/20 border-cyan-500/30">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <FileText className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-cyan-300 font-semibold mb-1">Client Communication Generator</h3>
                        <p className="text-cyan-200 text-sm">
                          Draft professional client communications including status updates, document requests, and demand letters.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-slate-300 mb-2 block">Communication Type</label>
                    <select
                      value={communicationType}
                      onChange={(e) => setCommunicationType(e.target.value)}
                      className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
                    >
                      <option value="status_update">Status Update</option>
                      <option value="document_request">Document Request</option>
                      <option value="demand_letter">Demand Letter</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-slate-300 mb-2 block">Recipient Name (Optional)</label>
                    <Input
                      placeholder="Client name or opposing party"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-300 mb-2 block">Context / Details</label>
                    <Textarea
                      placeholder={
                        communicationType === 'status_update' ? 'Recent developments, upcoming deadlines, case progress...' :
                        communicationType === 'document_request' ? 'List specific documents or categories needed...' :
                        'Facts, legal basis, damages sought, resolution deadline...'
                      }
                      value={communicationContext}
                      onChange={(e) => setCommunicationContext(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white min-h-[200px]"
                    />
                  </div>

                  <Button
                    onClick={() => clientCommunicationMutation.mutate({
                      legal_case_id: legalCaseId,
                      communication_type: communicationType,
                      context: communicationContext,
                      recipient_name: recipientName
                    })}
                    disabled={clientCommunicationMutation.isLoading || !communicationContext.trim()}
                    className="w-full"
                  >
                    {clientCommunicationMutation.isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Drafting Communication...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4 mr-2" />
                        Generate Communication
                      </>
                    )}
                  </Button>

                  {generatedCommunication && (
                    <Card className="bg-green-900/20 border-green-500/30">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3 mb-3">
                          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="text-green-300 font-semibold mb-1">Communication Generated</h4>
                            <p className="text-green-200 text-sm">Review and customize before sending</p>
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded p-4 border border-slate-700 max-h-96 overflow-y-auto">
                          <pre className="text-sm text-slate-300 whitespace-pre-wrap">{generatedCommunication}</pre>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="opposing" className="space-y-4 mt-4">
              <div className="space-y-4">
                <Card className="bg-red-900/20 border-red-500/30">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-red-300 font-semibold mb-1">Opposing Counsel Filing Analysis</h3>
                        <p className="text-red-200 text-sm">
                          Analyze opposing counsel's filings for key arguments, weaknesses, evidentiary issues, and strategic response recommendations.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-slate-300 mb-2 block">Filing Type</label>
                    <select
                      value={filingType}
                      onChange={(e) => setFilingType(e.target.value)}
                      className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
                    >
                      <option value="motion">Motion</option>
                      <option value="brief">Brief</option>
                      <option value="complaint">Complaint</option>
                      <option value="answer">Answer</option>
                      <option value="opposition">Opposition</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-slate-300 mb-2 block">Filing Content</label>
                    <Textarea
                      placeholder="Paste the opposing counsel's filing here..."
                      value={filingContent}
                      onChange={(e) => setFilingContent(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white min-h-[300px] font-mono text-sm"
                    />
                  </div>

                  <Button
                    onClick={() => opposingCounselAnalysisMutation.mutate({
                      legal_case_id: legalCaseId,
                      filing_content: filingContent,
                      filing_type: filingType
                    })}
                    disabled={opposingCounselAnalysisMutation.isLoading || !filingContent.trim()}
                    className="w-full"
                  >
                    {opposingCounselAnalysisMutation.isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing Filing...
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Analyze Filing
                      </>
                    )}
                  </Button>

                  {filingAnalysis && (
                    <div className="space-y-3">
                      {filingAnalysis.structured_analysis && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {filingAnalysis.structured_analysis.weaknesses?.length > 0 && (
                            <Card className="bg-amber-900/20 border-amber-500/30">
                              <CardContent className="p-3">
                                <h4 className="text-amber-300 font-semibold mb-2 text-sm">Key Weaknesses</h4>
                                <ul className="space-y-1">
                                  {filingAnalysis.structured_analysis.weaknesses.slice(0, 3).map((w, i) => (
                                    <li key={i} className="text-xs text-amber-200">• {w}</li>
                                  ))}
                                </ul>
                              </CardContent>
                            </Card>
                          )}

                          {filingAnalysis.structured_analysis.evidentiary_issues?.length > 0 && (
                            <Card className="bg-red-900/20 border-red-500/30">
                              <CardContent className="p-3">
                                <h4 className="text-red-300 font-semibold mb-2 text-sm">Evidentiary Issues</h4>
                                <ul className="space-y-1">
                                  {filingAnalysis.structured_analysis.evidentiary_issues.slice(0, 3).map((e, i) => (
                                    <li key={i} className="text-xs text-red-200">• {e}</li>
                                  ))}
                                </ul>
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      )}

                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardContent className="p-4">
                          <h4 className="text-white font-semibold mb-3">Full Analysis</h4>
                          <div className="bg-slate-900/50 rounded p-3 max-h-96 overflow-y-auto">
                            <pre className="text-sm text-slate-300 whitespace-pre-wrap">{filingAnalysis.full_analysis}</pre>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 mt-4">
              <div className="space-y-3">
                <select
                  value={advancedAnalysisType}
                  onChange={(e) => setAdvancedAnalysisType(e.target.value)}
                  className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
                >
                  <option value="extract_terms">Extract Defined Terms</option>
                  <option value="summarize_deposition">Summarize Deposition</option>
                  <option value="generate_discovery">Generate Discovery Requests</option>
                  <option value="sentiment_analysis">Sentiment Analysis</option>
                </select>
                <Textarea
                  placeholder="Paste content here..."
                  value={advancedContent}
                  onChange={(e) => setAdvancedContent(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white min-h-[250px] font-mono"
                />
                <Button 
                  onClick={() => advancedAnalysisMutation.mutate({
                    analysis_type: advancedAnalysisType,
                    content: advancedContent,
                    case_type: 'civil_litigation',
                    evidence_gaps: analyses[0]?.analysis_results?.evidence_gaps || []
                  })}
                  disabled={advancedAnalysisMutation.isLoading || !advancedContent.trim()}
                  className="w-full"
                >
                  {advancedAnalysisMutation.isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    'Run Analysis'
                  )}
                </Button>

                {advancedResult && (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4">
                      <h4 className="text-white font-medium mb-3">Results</h4>
                      <div className="text-sm space-y-2 text-slate-300">
                        {advancedAnalysisType === 'extract_terms' && advancedResult.defined_terms?.map((term, idx) => (
                          <div key={idx} className="p-2 bg-slate-700/50 rounded">
                            <span className="font-semibold text-blue-300">{term.term}:</span> {term.definition}
                          </div>
                        ))}
                        {advancedAnalysisType === 'summarize_deposition' && (
                          <>
                            <p>{advancedResult.summary}</p>
                            {advancedResult.key_statements?.length > 0 && (
                              <div>
                                <h5 className="font-medium text-yellow-300">Key Statements:</h5>
                                <ul className="list-disc list-inside ml-2">
                                  {advancedResult.key_statements.map((s, idx) => <li key={idx}>{s}</li>)}
                                </ul>
                              </div>
                            )}
                          </>
                        )}
                        {advancedAnalysisType === 'generate_discovery' && (
                          <>
                            {advancedResult.interrogatories?.length > 0 && (
                              <div>
                                <h5 className="font-medium text-blue-300">Interrogatories:</h5>
                                <ol className="list-decimal list-inside ml-2">
                                  {advancedResult.interrogatories.map((q, idx) => <li key={idx}>{q}</li>)}
                                </ol>
                              </div>
                            )}
                            {advancedResult.document_requests?.length > 0 && (
                              <div>
                                <h5 className="font-medium text-green-300">Document Requests:</h5>
                                <ol className="list-decimal list-inside ml-2">
                                  {advancedResult.document_requests.map((r, idx) => <li key={idx}>{r}</li>)}
                                </ol>
                              </div>
                            )}
                          </>
                        )}
                        {advancedAnalysisType === 'sentiment_analysis' && (
                          <>
                            <div className="flex gap-4">
                              <Badge>{advancedResult.confidence_level} confidence</Badge>
                              <Badge variant="outline">{advancedResult.tone}</Badge>
                              <Badge variant="outline">{advancedResult.posture}</Badge>
                            </div>
                            {advancedResult.vulnerabilities?.length > 0 && (
                              <div>
                                <h5 className="font-medium text-red-300">Vulnerabilities:</h5>
                                <ul className="list-disc list-inside ml-2">
                                  {advancedResult.vulnerabilities.map((v, idx) => <li key={idx}>{v}</li>)}
                                </ul>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="deadlines" className="space-y-4 mt-4">
              <Button 
                onClick={() => deadlineCheckMutation.mutate({ legal_case_id: legalCaseId })}
                disabled={deadlineCheckMutation.isLoading}
                className="w-full"
              >
                {deadlineCheckMutation.isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4 mr-2" />
                    Check Discovery Deadlines
                  </>
                )}
              </Button>

              {deadlineCheckMutation.data?.alerts && (
                <div className="space-y-2">
                  {deadlineCheckMutation.data.alerts.map((alert, idx) => (
                    <Card key={idx} className={`
                      ${alert.severity === 'critical' ? 'bg-red-900/20 border-red-500/50' : ''}
                      ${alert.severity === 'high' ? 'bg-orange-900/20 border-orange-500/50' : ''}
                      ${alert.severity === 'medium' ? 'bg-yellow-900/20 border-yellow-500/50' : ''}
                    `}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5
                            ${alert.severity === 'critical' ? 'text-red-400' : ''}
                            ${alert.severity === 'high' ? 'text-orange-400' : ''}
                            ${alert.severity === 'medium' ? 'text-yellow-400' : ''}
                          `} />
                          <div>
                            <h4 className="text-white font-medium">{alert.deadline}</h4>
                            <p className="text-sm text-slate-300">{alert.message}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-3 mt-4">
              {analyses.map((analysis) => (
                <Card key={analysis.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="text-white font-medium">{analysis.document_name}</h4>
                        <Badge variant="outline" className="mt-1">
                          {analysis.document_type.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <Badge className="bg-blue-500/20 text-blue-300">
                        {analysis.ai_confidence_score}% confidence
                      </Badge>
                    </div>

                    {analysis.analysis_results && (
                      <div className="space-y-3 text-sm">
                        {analysis.analysis_results.key_arguments?.length > 0 && (
                          <div>
                            <h5 className="text-slate-300 font-medium mb-1">Key Arguments:</h5>
                            <ul className="list-disc list-inside text-slate-400 space-y-1">
                              {analysis.analysis_results.key_arguments.map((arg, idx) => (
                                <li key={idx}>{arg}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {analysis.analysis_results.evidence_gaps?.length > 0 && (
                          <div>
                            <h5 className="text-slate-300 font-medium mb-1 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-yellow-400" />
                              Evidence Gaps:
                            </h5>
                            <ul className="list-disc list-inside text-slate-400 space-y-1">
                              {analysis.analysis_results.evidence_gaps.map((gap, idx) => (
                                <li key={idx}>{gap}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {analysis.analysis_results.relevant_case_law?.length > 0 && (
                          <div>
                            <h5 className="text-slate-300 font-medium mb-1">Relevant Case Law:</h5>
                            <div className="space-y-1">
                              {analysis.analysis_results.relevant_case_law.map((caselaw, idx) => (
                                <div key={idx} className="text-slate-400">
                                  <span className="font-mono text-xs">{caselaw.citation}</span>
                                  <p className="text-xs ml-4">{caselaw.relevance}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}