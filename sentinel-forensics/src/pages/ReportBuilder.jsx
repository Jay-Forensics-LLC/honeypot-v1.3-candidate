import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../components/hooks/useUser';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sparkles, FileEdit, Calendar, Plus, Play, Trash2, Clock, FileText, FileSpreadsheet, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import ReportGenerator from '../components/reports/ReportGenerator';

export default function ReportBuilder() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [showScheduledForm, setShowScheduledForm] = useState(false);
  const [formData, setFormData] = useState({
    report_name: '',
    data_source: 'cases',
    filters: {},
    visualization: 'table',
    template_type: 'custom',
    schedule_enabled: false,
    schedule_pattern: 'daily',
    email_recipients: []
  });

  const { data: scheduledReports = [] } = useQuery({
    queryKey: ['custom-reports', user?.organization_id],
    queryFn: () => base44.entities.CustomReport.filter({ organization_id: user.organization_id }),
    enabled: !!user?.organization_id
  });

  const createReport = useMutation({
    mutationFn: (data) => base44.entities.CustomReport.create({
      ...data,
      organization_id: user.organization_id
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['custom-reports']);
      setShowScheduledForm(false);
      toast.success('Scheduled report created');
      setFormData({
        report_name: '',
        data_source: 'cases',
        filters: {},
        visualization: 'table',
        template_type: 'custom',
        schedule_enabled: false,
        schedule_pattern: 'daily',
        email_recipients: []
      });
    }
  });

  const deleteReport = useMutation({
    mutationFn: (id) => base44.entities.CustomReport.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['custom-reports']);
      toast.success('Report deleted');
    }
  });

  const generateReport = useMutation({
    mutationFn: async (reportId) => {
      const response = await base44.functions.invoke('generateCustomReport', { reportId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['custom-reports']);
      toast.success('Report generated and sent');
    }
  });

  const dataSources = [
    { value: 'cases', label: 'Cases' },
    { value: 'evidence', label: 'Evidence' },
    { value: 'alerts', label: 'Alerts' },
    { value: 'devices', label: 'Devices' },
    { value: 'audit_logs', label: 'Audit Logs' }
  ];

  const templates = [
    { value: 'custom', label: 'Custom' },
    { value: 'gdpr', label: 'GDPR Compliance' },
    { value: 'soc2', label: 'SOC 2' },
    { value: 'hipaa', label: 'HIPAA' },
    { value: 'iso27001', label: 'ISO 27001' }
  ];

  const visualizations = [
    { value: 'table', label: 'Table', icon: FileSpreadsheet },
    { value: 'bar_chart', label: 'Bar Chart', icon: BarChart3 },
    { value: 'summary', label: 'Summary', icon: FileText }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Report Builder</h1>
        <p className="text-slate-400">Generate comprehensive forensic reports with AI, manual templates, or scheduled automation</p>
      </div>

      <Tabs defaultValue="ai" className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800">
          <TabsTrigger value="ai" className="data-[state=active]:bg-slate-800">
            <Sparkles className="w-4 h-4 mr-2" />
            AI-Powered
          </TabsTrigger>
          <TabsTrigger value="manual" className="data-[state=active]:bg-slate-800">
            <FileEdit className="w-4 h-4 mr-2" />
            Manual Builder
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="data-[state=active]:bg-slate-800">
            <Calendar className="w-4 h-4 mr-2" />
            Scheduled Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-12 text-center">
              <Sparkles className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">AI report generation coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual">
          <ReportGenerator />
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-slate-400">Automate report generation and delivery</p>
            <Button onClick={() => setShowScheduledForm(!showScheduledForm)} className="bg-red-600 hover:bg-red-700">
              <Plus className="w-4 h-4 mr-2" />
              New Scheduled Report
            </Button>
          </div>

          {showScheduledForm && (
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Create Scheduled Report</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-slate-300 mb-2 block">Report Name</label>
                  <Input
                    value={formData.report_name}
                    onChange={(e) => setFormData({...formData, report_name: e.target.value})}
                    placeholder="Monthly Security Report"
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-300 mb-2 block">Data Source</label>
                    <select
                      value={formData.data_source}
                      onChange={(e) => setFormData({...formData, data_source: e.target.value})}
                      className="w-full p-2 rounded-lg bg-slate-800 border-slate-700 text-white"
                    >
                      {dataSources.map(ds => (
                        <option key={ds.value} value={ds.value}>{ds.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-slate-300 mb-2 block">Template</label>
                    <select
                      value={formData.template_type}
                      onChange={(e) => setFormData({...formData, template_type: e.target.value})}
                      className="w-full p-2 rounded-lg bg-slate-800 border-slate-700 text-white"
                    >
                      {templates.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-300 mb-2 block">Visualization</label>
                  <div className="grid grid-cols-3 gap-3">
                    {visualizations.map(viz => {
                      const Icon = viz.icon;
                      return (
                        <button
                          key={viz.value}
                          onClick={() => setFormData({...formData, visualization: viz.value})}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            formData.visualization === viz.value
                              ? 'border-red-500 bg-red-500/10'
                              : 'border-slate-700 hover:border-slate-600'
                          }`}
                        >
                          <Icon className="w-5 h-5 text-white mx-auto mb-1" />
                          <p className="text-xs text-white">{viz.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={formData.schedule_enabled}
                      onChange={(e) => setFormData({...formData, schedule_enabled: e.target.checked})}
                      className="rounded"
                    />
                    Enable Scheduled Generation
                  </label>
                </div>

                {formData.schedule_enabled && (
                  <div>
                    <label className="text-sm text-slate-300 mb-2 block">Schedule Pattern</label>
                    <select
                      value={formData.schedule_pattern}
                      onChange={(e) => setFormData({...formData, schedule_pattern: e.target.value})}
                      className="w-full p-2 rounded-lg bg-slate-800 border-slate-700 text-white"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={() => createReport.mutate(formData)}
                    disabled={!formData.report_name || createReport.isPending}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {createReport.isPending ? 'Creating...' : 'Create Report'}
                  </Button>
                  <Button onClick={() => setShowScheduledForm(false)} variant="outline">
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4">
            {scheduledReports.map(report => (
              <Card key={report.id} className="bg-slate-900 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">{report.report_name}</h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <Badge className="bg-blue-500/20 text-blue-300">
                          {report.data_source}
                        </Badge>
                        <Badge className="bg-purple-500/20 text-purple-300">
                          {report.template_type}
                        </Badge>
                        <Badge className="bg-green-500/20 text-green-300">
                          {report.visualization}
                        </Badge>
                        {report.schedule_enabled && (
                          <Badge className="bg-orange-500/20 text-orange-300">
                            <Clock className="w-3 h-3 mr-1" />
                            {report.schedule_pattern}
                          </Badge>
                        )}
                      </div>
                      {report.last_generated && (
                        <p className="text-sm text-slate-400">
                          Last generated: {new Date(report.last_generated).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => generateReport.mutate(report.id)}
                        disabled={generateReport.isPending}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Play className="w-4 h-4 mr-1" />
                        Generate
                      </Button>
                      <Button
                        onClick={() => deleteReport.mutate(report.id)}
                        size="sm"
                        variant="outline"
                        className="border-red-600 text-red-500 hover:bg-red-950/50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {scheduledReports.length === 0 && (
              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="p-12 text-center">
                  <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">No scheduled reports yet</h3>
                  <p className="text-slate-400 mb-4">Create your first automated report</p>
                  <Button onClick={() => setShowScheduledForm(true)} className="bg-red-600 hover:bg-red-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Scheduled Report
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}