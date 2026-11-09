import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, History, Play, FileText } from 'lucide-react';
import { toast } from 'sonner';

/**
 * TEMPLATE MANAGER
 * Create, edit, and version report templates
 */
export default function TemplateManager() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['report-templates', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.ReportDefinition.filter({
        organization_id: user.organization_id
      }, '-updated_date', 50);
    },
    enabled: !!user?.organization_id
  });

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: async (templateData) => {
      return await base44.entities.ReportDefinition.create({
        ...templateData,
        organization_id: user.organization_id,
        created_by: user.email,
        version: '1.0',
        is_active: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['report-templates']);
      setDialogOpen(false);
      setEditingTemplate(null);
      toast.success('Template created');
    }
  });

  // Update template mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      // Create new version
      const currentVersion = parseFloat(editingTemplate.version || '1.0');
      const newVersion = (currentVersion + 0.1).toFixed(1);
      
      return await base44.entities.ReportDefinition.update(id, {
        ...data,
        version: newVersion,
        last_modified_by: user.email
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['report-templates']);
      setDialogOpen(false);
      setEditingTemplate(null);
      toast.success('Template updated');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const templateData = {
      name: formData.get('name'),
      description: formData.get('description'),
      module_type: formData.get('module_type'),
      output_formats: ['pdf', 'csv'],
      data_scope: {
        type: formData.get('scope_type')
      },
      sections: {
        executive_summary: true,
        detailed_findings: true,
        recommendations: true
      }
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: templateData });
    } else {
      createMutation.mutate(templateData);
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.module_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Report Templates</h2>
          <p className="text-gray-400 text-sm">Create and manage report templates</p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              onClick={() => setEditingTemplate(null)}
              className="bg-red-600 hover:bg-red-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </DialogTrigger>
          
          <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">
                {editingTemplate ? 'Edit Template' : 'Create Template'}
              </DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Template Name</label>
                <Input
                  name="name"
                  defaultValue={editingTemplate?.name}
                  placeholder="e.g., Weekly Vulnerability Report"
                  required
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Description</label>
                <Textarea
                  name="description"
                  defaultValue={editingTemplate?.description}
                  placeholder="Describe what this report covers"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Module Type</label>
                <Select name="module_type" defaultValue={editingTemplate?.module_type || 'case_summary'}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="case_summary">Case Summary</SelectItem>
                    <SelectItem value="vulnerability_assessment">Vulnerability Assessment</SelectItem>
                    <SelectItem value="compliance_status">Compliance Status</SelectItem>
                    <SelectItem value="security_posture">Security Posture</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Data Scope</label>
                <Select name="scope_type" defaultValue="organization">
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="organization">Organization</SelectItem>
                    <SelectItem value="case">Per Case</SelectItem>
                    <SelectItem value="project">Per Project</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  className="border-slate-700 text-gray-400"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  className="bg-red-600 hover:bg-red-700"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingTemplate ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search templates..."
        className="bg-slate-800 border-slate-700 text-white"
      />

      {/* Templates Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading templates...</div>
      ) : filteredTemplates.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No templates yet. Create your first report template.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="bg-slate-900 border-slate-800 hover:border-red-600 transition-colors">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-white text-lg">{template.name}</CardTitle>
                    <p className="text-gray-400 text-sm mt-1">{template.description}</p>
                  </div>
                  <Badge className="bg-slate-800 text-gray-300">
                    v{template.version || '1.0'}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Type:</span>
                  <Badge variant="outline" className="border-slate-700 text-gray-300">
                    {template.module_type.replace(/_/g, ' ')}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Formats:</span>
                  <Badge variant="outline" className="border-slate-700 text-gray-300">PDF</Badge>
                  <Badge variant="outline" className="border-slate-700 text-gray-300">CSV</Badge>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingTemplate(template);
                      setDialogOpen(true);
                    }}
                    className="flex-1 border-slate-700 text-gray-400 hover:text-white"
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-slate-700 text-gray-400 hover:text-white"
                  >
                    <History className="w-3 h-3 mr-1" />
                    History
                  </Button>
                  
                  <Button
                    size="sm"
                    className="flex-1 bg-red-600 hover:bg-red-700"
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Run
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}