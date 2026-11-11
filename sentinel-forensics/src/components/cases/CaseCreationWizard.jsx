import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import StabilizationChecklist from './StabilizationChecklist';
import { FileText, ArrowRight } from 'lucide-react';

const STEPS = {
  STABILIZATION: 0,
  CASE_DETAILS: 1
};

export default function CaseCreationWizard({ open, onClose, onCreateCase }) {
  const [currentStep, setCurrentStep] = useState(STEPS.STABILIZATION);
  const [stabilizationData, setStabilizationData] = useState(null);
  const [caseData, setCaseData] = useState({
    title: '',
    description: '',
    case_purpose: 'exploratory',
    priority: 'medium',
    tags: ''
  });

  const handleStabilizationComplete = (data) => {
    setStabilizationData(data);
    setCurrentStep(STEPS.CASE_DETAILS);
  };

  const handleCreateCase = () => {
    const tagsArray = caseData.tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t);

    onCreateCase({
      ...caseData,
      tags: tagsArray,
      ...stabilizationData
    });

    // Reset wizard
    setCurrentStep(STEPS.STABILIZATION);
    setStabilizationData(null);
    setCaseData({
      title: '',
      description: '',
      priority: 'medium',
      tags: ''
    });
  };

  const handleCancel = () => {
    setCurrentStep(STEPS.STABILIZATION);
    setStabilizationData(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-400" />
            Create New Case - {currentStep === STEPS.STABILIZATION ? 'Step 1 of 2' : 'Step 2 of 2'}
          </DialogTitle>
        </DialogHeader>

        {currentStep === STEPS.STABILIZATION && (
          <StabilizationChecklist
            onComplete={handleStabilizationComplete}
            onCancel={handleCancel}
          />
        )}

        {currentStep === STEPS.CASE_DETAILS && (
          <div className="space-y-6 py-4">
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="text-xs text-green-200">
                ✓ Stabilization checklist completed. You may now define case details.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="title" className="text-slate-300">Case Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Suspicious Device Activity - Jan 2025"
                  value={caseData.title}
                  onChange={(e) => setCaseData({ ...caseData, title: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                />
              </div>

              <div>
                <Label htmlFor="case_purpose" className="text-slate-300">Case Purpose * (Gate 1: Intent at Time Zero)</Label>
                <Select
                  value={caseData.case_purpose}
                  onValueChange={(value) => setCaseData({ ...caseData, case_purpose: value })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="suspected_compromise">Suspected Compromise</SelectItem>
                    <SelectItem value="due_diligence">Due Diligence / Monitoring</SelectItem>
                    <SelectItem value="incident_documentation">Incident Documentation</SelectItem>
                    <SelectItem value="exploratory">Unknown / Exploratory</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="description" className="text-slate-300">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Document observable conditions without conclusions..."
                  value={caseData.description}
                  onChange={(e) => setCaseData({ ...caseData, description: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white mt-1 h-24"
                />
              </div>

              <div>
                <Label htmlFor="priority" className="text-slate-300">Priority</Label>
                <Select
                  value={caseData.priority}
                  onValueChange={(value) => setCaseData({ ...caseData, priority: value })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
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

              <div>
                <Label htmlFor="tags" className="text-slate-300">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  placeholder="e.g., mobile, network, suspicious-app"
                  value={caseData.tags}
                  onChange={(e) => setCaseData({ ...caseData, tags: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-700">
              <Button
                onClick={() => setCurrentStep(STEPS.STABILIZATION)}
                variant="outline"
              >
                Back to Stabilization
              </Button>
              <Button
                onClick={handleCreateCase}
                disabled={!caseData.title.trim()}
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                Create Case
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}