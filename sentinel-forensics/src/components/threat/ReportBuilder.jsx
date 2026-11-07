import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ReportBuilder({ onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [criteria, setCriteria] = useState({
    report_name: '',
    report_purpose: 'internal_review',
    time_range_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    time_range_end: new Date().toISOString(),
    data_sources: ['alerts', 'endpoint_events'],
    threat_categories: ['malware', 'persistence', 'surveillance'],
    severity_threshold: 'medium',
    framework_alignment: ['mitre_attack']
  });

  const generateReport = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('generateThreatIntelReport', {
        report_name: criteria.report_name,
        report_purpose: criteria.report_purpose,
        criteria: {
          ...criteria,
          report_name: undefined,
          report_purpose: undefined
        }
      });
      return response;
    },
    onSuccess: () => {
      toast.success('Report generated successfully');
      onSuccess();
    },
    onError: (error) => {
      toast.error('Report generation failed: ' + error.message);
    }
  });

  const toggleArrayItem = (field, value) => {
    const current = criteria[field];
    if (current.includes(value)) {
      setCriteria({ ...criteria, [field]: current.filter(v => v !== value) });
    } else {
      setCriteria({ ...criteria, [field]: [...current, value] });
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-red-400" />
            Generate Threat Intelligence Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label className="text-white">Report Name</Label>
                <Input
                  value={criteria.report_name}
                  onChange={(e) => setCriteria({ ...criteria, report_name: e.target.value })}
                  placeholder="Q4 2024 Threat Analysis"
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div>
                <Label className="text-white">Report Purpose</Label>
                <Select
                  value={criteria.report_purpose}
                  onValueChange={(value) => setCriteria({ ...criteria, report_purpose: value })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="internal_review">Internal Review</SelectItem>
                    <SelectItem value="executive_summary">Executive Summary</SelectItem>
                    <SelectItem value="legal_affidavit">Legal/Affidavit</SelectItem>
                    <SelectItem value="client_facing">Client-Facing</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Start Date</Label>
                  <Input
                    type="datetime-local"
                    value={criteria.time_range_start.slice(0, 16)}
                    onChange={(e) => setCriteria({ ...criteria, time_range_start: new Date(e.target.value).toISOString() })}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
                <div>
                  <Label className="text-white">End Date</Label>
                  <Input
                    type="datetime-local"
                    value={criteria.time_range_end.slice(0, 16)}
                    onChange={(e) => setCriteria({ ...criteria, time_range_end: new Date(e.target.value).toISOString() })}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Data Sources & Criteria */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label className="text-white mb-3 block">Data Sources</Label>
                <div className="flex flex-wrap gap-2">
                  {['alerts', 'endpoint_events', 'network_logs', 'ble_wifi_scans', 'file_integrity', 'auth_events'].map(source => (
                    <Badge
                      key={source}
                      className={`cursor-pointer ${
                        criteria.data_sources.includes(source)
                          ? 'bg-blue-600 hover:bg-blue-700'
                          : 'bg-slate-700 hover:bg-slate-600'
                      }`}
                      onClick={() => toggleArrayItem('data_sources', source)}
                    >
                      {source.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-white mb-3 block">Threat Categories</Label>
                <div className="flex flex-wrap gap-2">
                  {['malware', 'persistence', 'lateral_movement', 'surveillance', 'misconfiguration', 'data_exfiltration'].map(cat => (
                    <Badge
                      key={cat}
                      className={`cursor-pointer ${
                        criteria.threat_categories.includes(cat)
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-slate-700 hover:bg-slate-600'
                      }`}
                      onClick={() => toggleArrayItem('threat_categories', cat)}
                    >
                      {cat.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-white">Severity Threshold</Label>
                <Select
                  value={criteria.severity_threshold}
                  onValueChange={(value) => setCriteria({ ...criteria, severity_threshold: value })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="low">Low and above</SelectItem>
                    <SelectItem value="medium">Medium and above</SelectItem>
                    <SelectItem value="high">High and above</SelectItem>
                    <SelectItem value="critical">Critical only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-white mb-3 block">Framework Alignment</Label>
                <div className="flex flex-wrap gap-2">
                  {['mitre_attack', 'nist_csf', 'cis_controls'].map(fw => (
                    <Badge
                      key={fw}
                      className={`cursor-pointer ${
                        criteria.framework_alignment.includes(fw)
                          ? 'bg-purple-600 hover:bg-purple-700'
                          : 'bg-slate-700 hover:bg-slate-600'
                      }`}
                      onClick={() => toggleArrayItem('framework_alignment', fw)}
                    >
                      {fw.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            {step > 1 && (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                className="border-slate-700"
              >
                Back
              </Button>
            )}
            {step < 2 ? (
              <Button
                onClick={() => setStep(2)}
                disabled={!criteria.report_name}
                className="bg-red-600 hover:bg-red-700 ml-auto"
              >
                Continue
              </Button>
            ) : (
              <Button
                onClick={() => generateReport.mutate()}
                disabled={generateReport.isPending || criteria.data_sources.length === 0}
                className="bg-red-600 hover:bg-red-700 ml-auto"
              >
                {generateReport.isPending ? (
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
            )}
          </div>

          {/* Disclaimer */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">
                Reports are generated from observed data only. No threats are invented. 
                All findings are evidence-backed and traceable.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}