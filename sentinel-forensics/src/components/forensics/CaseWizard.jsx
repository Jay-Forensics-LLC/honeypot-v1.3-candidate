import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ArrowRight, ArrowLeft, Check, FileText, Database, 
  Settings, Download, Loader2, CheckCircle2, AlertTriangle 
} from 'lucide-react';
import { toast } from 'sonner';
import SecureEvidenceUploader from '../evidence/SecureEvidenceUploader';

/**
 * FORENSIC CASE WIZARD
 * Court-admissible workflow: Case → Evidence → Analysis → Report
 */
export default function CaseWizard({ onComplete, onCancel }) {
  const [step, setStep] = useState(1);
  const [wizardData, setWizardData] = useState({
    case: {
      title: '',
      description: '',
      case_type: 'network_intrusion',
      priority: 'medium'
    },
    evidenceItems: [],
    analyses: {
      hash_verification: true,
      metadata_extraction: true,
      timeline_reconstruction: false,
      threat_correlation: false
    }
  });
  const [caseId, setCaseId] = useState(null);
  const queryClient = useQueryClient();

  // Step 1: Create Case
  const createCaseMutation = useMutation({
    mutationFn: async (caseData) => {
      const caseNumber = `CASE-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
      
      const response = await base44.functions.invoke('createCase', {
        case_number: caseNumber,
        ...caseData
      });
      
      return response.data;
    },
    onSuccess: (data) => {
      setCaseId(data.case_id);
      setStep(2);
      toast.success('Case created successfully');
    },
    onError: (error) => {
      toast.error('Failed to create case: ' + error.message);
    }
  });

  // Step 4: Generate Package
  const generatePackageMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('generateEvidencePackage', {
        case_id: caseId,
        include_analyses: wizardData.analyses,
        format: 'zip'
      });
      return response.data;
    },
    onSuccess: (data) => {
      // Download package
      if (data.download_url) {
        window.open(data.download_url, '_blank');
      }
      
      toast.success('Forensic package generated', {
        description: 'Report ready for court submission'
      });
      
      queryClient.invalidateQueries({ queryKey: ['org-query', 'Case'] });
      
      if (onComplete) onComplete(caseId);
    },
    onError: (error) => {
      toast.error('Package generation failed: ' + error.message);
    }
  });

  const handleNext = () => {
    if (step === 1) {
      if (!wizardData.case.title) {
        toast.error('Case title is required');
        return;
      }
      createCaseMutation.mutate(wizardData.case);
    } else if (step === 2) {
      if (wizardData.evidenceItems.length === 0) {
        toast.error('At least one evidence item is required');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      generatePackageMutation.mutate();
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleEvidenceUploaded = (evidenceData) => {
    setWizardData(prev => ({
      ...prev,
      evidenceItems: [...prev.evidenceItems, evidenceData]
    }));
  };

  const steps = [
    { number: 1, title: 'Case Details', icon: FileText },
    { number: 2, title: 'Evidence', icon: Database },
    { number: 3, title: 'Analyses', icon: Settings },
    { number: 4, title: 'Generate Report', icon: Download }
  ];

  return (
    <div className="space-y-6">
      {/* Progress Tracker */}
      <div className="flex items-center justify-between">
        {steps.map((s, idx) => (
          <div key={s.number} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                step >= s.number 
                  ? 'bg-green-600 border-green-600' 
                  : 'bg-slate-800 border-slate-700'
              }`}>
                {step > s.number ? (
                  <CheckCircle2 className="w-5 h-5 text-white" />
                ) : (
                  <s.icon className="w-5 h-5 text-white" />
                )}
              </div>
              <p className={`text-xs mt-2 text-center ${
                step >= s.number ? 'text-white font-semibold' : 'text-slate-400'
              }`}>
                {s.title}
              </p>
            </div>
            {idx < steps.length - 1 && (
              <div className={`h-0.5 flex-1 ${
                step > s.number ? 'bg-green-600' : 'bg-slate-700'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">{steps[step - 1].title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: Case Details */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label className="text-white">Case Title *</Label>
                <Input
                  value={wizardData.case.title}
                  onChange={(e) => setWizardData(prev => ({
                    ...prev,
                    case: { ...prev.case, title: e.target.value }
                  }))}
                  placeholder="Enter case title"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white">Description</Label>
                <Textarea
                  value={wizardData.case.description}
                  onChange={(e) => setWizardData(prev => ({
                    ...prev,
                    case: { ...prev.case, description: e.target.value }
                  }))}
                  placeholder="Describe the incident..."
                  className="bg-slate-800 border-slate-700 text-white h-32"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white">Case Type</Label>
                  <Select 
                    value={wizardData.case.case_type} 
                    onValueChange={(v) => setWizardData(prev => ({
                      ...prev,
                      case: { ...prev.case, case_type: v }
                    }))}
                  >
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
                  <Select 
                    value={wizardData.case.priority} 
                    onValueChange={(v) => setWizardData(prev => ({
                      ...prev,
                      case: { ...prev.case, priority: v }
                    }))}
                  >
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
            </>
          )}

          {/* Step 2: Evidence Upload */}
          {step === 2 && (
            <div className="space-y-4">
              <SecureEvidenceUploader 
                caseId={caseId} 
                onSuccess={handleEvidenceUploaded}
              />

              {wizardData.evidenceItems.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-white">Uploaded Evidence ({wizardData.evidenceItems.length})</Label>
                  {wizardData.evidenceItems.map((item, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                      <div className="flex-1">
                        <p className="text-white font-medium">{item.title || 'Evidence Item'}</p>
                        <p className="text-xs text-slate-400">SHA-256: {item.file_hash?.substring(0, 16)}...</p>
                      </div>
                      <Badge className="bg-green-500/20 text-green-400">Verified</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Analysis Selection */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-slate-400 text-sm">Select analyses to include in the forensic report:</p>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                  <Checkbox 
                    checked={wizardData.analyses.hash_verification}
                    onCheckedChange={(checked) => setWizardData(prev => ({
                      ...prev,
                      analyses: { ...prev.analyses, hash_verification: checked }
                    }))}
                  />
                  <div className="flex-1">
                    <p className="text-white font-medium">Hash Verification</p>
                    <p className="text-xs text-slate-400">SHA-256 integrity checksums (Required)</p>
                  </div>
                  <Badge className="bg-blue-500/20 text-blue-400">Essential</Badge>
                </div>

                <div className="flex items-center gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                  <Checkbox 
                    checked={wizardData.analyses.metadata_extraction}
                    onCheckedChange={(checked) => setWizardData(prev => ({
                      ...prev,
                      analyses: { ...prev.analyses, metadata_extraction: checked }
                    }))}
                  />
                  <div className="flex-1">
                    <p className="text-white font-medium">Metadata Extraction</p>
                    <p className="text-xs text-slate-400">File attributes, timestamps, EXIF data</p>
                  </div>
                  <Badge className="bg-green-500/20 text-green-400">Recommended</Badge>
                </div>

                <div className="flex items-center gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                  <Checkbox 
                    checked={wizardData.analyses.timeline_reconstruction}
                    onCheckedChange={(checked) => setWizardData(prev => ({
                      ...prev,
                      analyses: { ...prev.analyses, timeline_reconstruction: checked }
                    }))}
                  />
                  <div className="flex-1">
                    <p className="text-white font-medium">Timeline Reconstruction</p>
                    <p className="text-xs text-slate-400">Event sequencing and temporal analysis</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                  <Checkbox 
                    checked={wizardData.analyses.threat_correlation}
                    onCheckedChange={(checked) => setWizardData(prev => ({
                      ...prev,
                      analyses: { ...prev.analyses, threat_correlation: checked }
                    }))}
                  />
                  <div className="flex-1">
                    <p className="text-white font-medium">Threat Intelligence Correlation</p>
                    <p className="text-xs text-slate-400">IOC matching and attribution analysis</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review & Generate */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-1" />
                  <div className="text-sm text-blue-200">
                    <p className="font-semibold mb-2">Ready to Generate Forensic Package</p>
                    <p>The package will include:</p>
                    <ul className="list-disc ml-5 mt-2 space-y-1">
                      <li>Case metadata and documentation</li>
                      <li>{wizardData.evidenceItems.length} evidence item(s) with SHA-256 hashes</li>
                      <li>Complete chain-of-custody audit log</li>
                      <li>Court-admissible PDF report with digital signatures</li>
                      <li>Evidence integrity verification results</li>
                    </ul>
                  </div>
                </div>
              </div>

              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <h4 className="text-white font-semibold mb-3">Package Contents Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Case Number:</span>
                      <span className="text-white font-mono">CASE-{new Date().getFullYear()}-{caseId?.substring(0, 8)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Evidence Items:</span>
                      <span className="text-white">{wizardData.evidenceItems.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Analyses:</span>
                      <span className="text-white">
                        {Object.values(wizardData.analyses).filter(Boolean).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Format:</span>
                      <span className="text-white">Signed ZIP Archive</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <div className="flex gap-2">
          {step > 1 && (
            <Button
              onClick={handleBack}
              variant="outline"
              className="border-slate-700"
              disabled={createCaseMutation.isPending || generatePackageMutation.isPending}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          <Button
            onClick={onCancel}
            variant="outline"
            className="border-slate-700"
          >
            Cancel
          </Button>
        </div>

        <Button
          onClick={handleNext}
          disabled={
            createCaseMutation.isPending || 
            generatePackageMutation.isPending ||
            (step === 2 && wizardData.evidenceItems.length === 0)
          }
          className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
        >
          {createCaseMutation.isPending || generatePackageMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : step === 4 ? (
            <>
              <Download className="w-4 h-4 mr-2" />
              Generate Package
            </>
          ) : (
            <>
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}