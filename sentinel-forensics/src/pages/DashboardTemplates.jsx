import React from 'react';
import { Layout, Plus, Edit, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function DashboardTemplates() {
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ['dashboard-templates'],
    queryFn: async () => {
      const result = await base44.functions.invoke('dashboardTemplates', { action: 'list' });
      return result.data;
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (templateId) => {
      await base44.functions.invoke('dashboardTemplates', {
        action: 'delete',
        template_id: templateId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-templates'] });
      toast.success('Template deleted');
    }
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard Templates</h1>
            <p className="text-gray-600">Manage role-based dashboard configurations</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        ) : templates?.templates?.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.templates.map(template => {
              const allowedWidgets = JSON.parse(template.allowed_widget_keys_json || '[]');
              const requiredPerms = JSON.parse(template.required_permissions_json || '[]');

              return (
                <Card key={template.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layout className="w-5 h-5 text-blue-600" />
                        {template.name}
                        {template.visibility === 'system' && (
                          <Badge variant="secondary">System</Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          <Edit className="w-4 h-4" />
                        </Button>
                        {template.visibility !== 'system' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600"
                            onClick={() => deleteMutation.mutate(template.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-gray-600">{template.description}</p>
                    
                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-1">Allowed Widgets</div>
                      <div className="flex flex-wrap gap-1">
                        {allowedWidgets.slice(0, 5).map((widget, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {widget}
                          </Badge>
                        ))}
                        {allowedWidgets.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{allowedWidgets.length - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-1">Required Permissions</div>
                      <div className="flex flex-wrap gap-1">
                        {requiredPerms.map((perm, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              No templates yet
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}