import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Plus, Copy, Search, Loader2, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '../hooks/useUser';

export default function PolicyTemplates({ onCreateFromTemplate }) {
  const [search, setSearch] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [policyName, setPolicyName] = useState('');
  const [policyDescription, setPolicyDescription] = useState('');

  const queryClient = useQueryClient();
  const { data: user } = useUser();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['policy-templates'],
    queryFn: async () => {
      return await base44.entities.PolicyTemplate.filter({}, '-created_date');
    }
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('policyVersionLifecycle', {
        operation: 'createPolicyFromTemplate',
        template_id: selectedTemplate.id,
        name: policyName,
        description: policyDescription
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['SecurityPolicy'] });
      queryClient.invalidateQueries({ queryKey: ['all-policy-versions', user?.organization_id] });
      toast.success('Policy created from template');
      setCreateDialogOpen(false);
      setPolicyName('');
      setPolicyDescription('');
      setSelectedTemplate(null);
    },
    onError: (error) => {
      toast.error('Failed to create policy', { description: error.message });
    }
  });

  const filteredTemplates = templates.filter(t =>
    t.template_name.toLowerCase().includes(search.toLowerCase()) ||
    t.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Policy Templates</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 mx-auto mb-4 text-slate-400 animate-spin" />
              <p className="text-slate-400">Loading templates...</p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">No templates found</p>
              <p className="text-xs text-slate-500 mt-2">Templates allow quick policy creation from pre-defined baselines</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className="p-4 bg-slate-800/30 rounded-lg border border-slate-700 hover:border-slate-600 transition-all"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <FileText className="w-5 h-5 text-blue-400 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="text-white font-semibold">{template.template_name}</h4>
                        {template.is_global && (
                          <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                            <Globe className="w-3 h-3 mr-1" />
                            Global
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {template.policy_type}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400">{template.description}</p>
                      {template.tags?.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {template.tags.slice(0, 3).map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-700">
                    <span className="text-xs text-slate-500">
                      Used {template.usage_count || 0} times
                    </span>
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setPolicyName(template.template_name);
                        setPolicyDescription(template.description);
                        setCreateDialogOpen(true);
                      }}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Copy className="w-3 h-3 mr-2" />
                      Use Template
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create from Template Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Create Policy from Template</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedTemplate && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 mb-4">
                <p className="text-xs text-blue-300">
                  Creating from: <strong>{selectedTemplate.template_name}</strong>
                </p>
              </div>
            )}

            <div>
              <Label className="text-slate-400">Policy Name *</Label>
              <Input
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
                placeholder="Enter policy name..."
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-slate-400">Description</Label>
              <Textarea
                value={policyDescription}
                onChange={(e) => setPolicyDescription(e.target.value)}
                placeholder="Describe the policy purpose..."
                className="bg-slate-800 border-slate-700 text-white mt-1"
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                setSelectedTemplate(null);
                setPolicyName('');
                setPolicyDescription('');
              }}
              className="border-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createFromTemplateMutation.mutate()}
              disabled={!policyName || createFromTemplateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createFromTemplateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Policy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}