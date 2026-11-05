import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Save, Trash2, LayoutDashboard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import MetricWidget from '../components/dashboard/MetricWidget';
import ChartWidget from '../components/dashboard/ChartWidget';
import ReportTemplates from '../components/reports/ReportTemplates';
import ExportControls from '../components/reports/ExportControls';
import { useOrgQuery } from '../components/hooks/useOrgQuery';

export default function DashboardBuilder() {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [reportName, setReportName] = useState('');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: savedWidgets = [] } = useOrgQuery('DashboardWidget', {}, '-created_date', 100);

  const saveWidgetMutation = useMutation({
    mutationFn: async (widget) => {
      return await base44.entities.DashboardWidget.create({
        ...widget,
        organization_id: user.organization_id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-query', 'DashboardWidget'] });
      toast.success('Widget saved');
    }
  });

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setReportName(template.name);
  };

  const addWidget = () => {
    setWidgets([...widgets, {
      id: `widget-${Date.now()}`,
      widget_name: 'New Widget',
      widget_type: 'metric',
      data_source: 'ThreatDetection',
      filters: {}
    }]);
  };

  const updateWidget = (id, updates) => {
    setWidgets(widgets.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const removeWidget = (id) => {
    setWidgets(widgets.filter(w => w.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Dashboard Builder</h1>
            <p className="text-slate-400">Create custom dashboards and reports</p>
          </div>
          {widgets.length > 0 && (
            <ExportControls 
              reportData={widgets} 
              reportName={reportName || 'Custom Report'}
            />
          )}
        </div>

        {/* Report Templates */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-blue-400" />
              Report Templates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReportTemplates onSelectTemplate={handleTemplateSelect} />
          </CardContent>
        </Card>

        {/* Custom Widgets */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white">Custom Widgets</CardTitle>
              <Button
                onClick={addWidget}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Widget
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {widgets.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <LayoutDashboard className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No widgets yet. Add your first widget to get started.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {widgets.map(widget => (
                  <Card key={widget.id} className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4 space-y-3">
                      <Input
                        value={widget.widget_name}
                        onChange={(e) => updateWidget(widget.id, { widget_name: e.target.value })}
                        placeholder="Widget name"
                        className="bg-slate-900 border-slate-700 text-white"
                      />
                      
                      <div className="grid grid-cols-2 gap-2">
                        <Select 
                          value={widget.widget_type}
                          onValueChange={(value) => updateWidget(widget.id, { widget_type: value })}
                        >
                          <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-700 text-white">
                            <SelectItem value="metric">Metric</SelectItem>
                            <SelectItem value="chart">Chart</SelectItem>
                            <SelectItem value="table">Table</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select 
                          value={widget.data_source}
                          onValueChange={(value) => updateWidget(widget.id, { data_source: value })}
                        >
                          <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-700 text-white">
                            <SelectItem value="ThreatDetection">Threats</SelectItem>
                            <SelectItem value="UserBehaviorAnalytics">UBA</SelectItem>
                            <SelectItem value="Device">Devices</SelectItem>
                            <SelectItem value="Alert">Alerts</SelectItem>
                            <SelectItem value="Case">Cases</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveWidgetMutation.mutate(widget)}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          <Save className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeWidget(widget.id)}
                          className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Saved Widgets */}
        {savedWidgets.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Saved Widgets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {savedWidgets.map(widget => (
                  <div key={widget.id}>
                    {widget.widget_type === 'metric' && (
                      <MetricWidget widget={widget} data={{ value: 0 }} />
                    )}
                    {widget.widget_type === 'chart' && (
                      <ChartWidget widget={widget} data={[]} />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}