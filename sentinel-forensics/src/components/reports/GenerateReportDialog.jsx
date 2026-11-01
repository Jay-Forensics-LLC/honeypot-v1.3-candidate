import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Shield, BarChart, Sparkles } from 'lucide-react';

export default function GenerateReportDialog({ open, onOpenChange, templates, onGenerate, isLoading }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [reportTitle, setReportTitle] = useState('');

  const handleGenerate = () => {
    if (selectedTemplate && reportTitle.trim()) {
      onGenerate({ template_id: selectedTemplate.id, report_title: reportTitle });
    }
  };

  const getTemplateIcon = (type) => {
    switch (type) {
      case 'court_admissible': return Shield;
      case 'executive_summary': return BarChart;
      case 'technical_analysis': return Sparkles;
      default: return FileText;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Generate Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label className="text-slate-400">Report Title</Label>
            <Input
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder="e.g., Incident Response Report - January 2026"
              className="bg-slate-800 border-slate-700 text-white mt-2"
            />
          </div>
          <div>
            <Label className="text-slate-400 mb-3 block">Select Template</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map(template => {
                const Icon = getTemplateIcon(template.template_type);
                return (
                  <Card
                    key={template.id}
                    className={`cursor-pointer transition-all ${
                      selectedTemplate?.id === template.id
                        ? 'bg-red-500/20 border-red-500'
                        : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                    }`}
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Icon className="w-5 h-5 text-red-400 mt-1" />
                        <div>
                          <p className="text-white font-semibold">{template.template_name}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {template.sections?.length || 0} sections • v{template.version}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={!selectedTemplate || !reportTitle.trim() || isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading ? 'Generating...' : 'Generate Report'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}