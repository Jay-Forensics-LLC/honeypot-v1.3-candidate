import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../components/hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Shield, Plus, Edit, Trash2, FileText, CheckCircle, Clock, 
  Sparkles, Download, Eye, Archive, Loader2, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

const POLICY_TYPES = [
  { value: 'data_protection', label: 'Data Protection' },
  { value: 'access_control', label: 'Access Control' },
  { value: 'incident_response', label: 'Incident Response' },
  { value: 'data_retention', label: 'Data Retention' },
  { value: 'encryption', label: 'Encryption' },
  { value: 'audit_logging', label: 'Audit Logging' },
  { value: 'acceptable_use', label: 'Acceptable Use' },
  { value: 'vendor_management', label: 'Vendor Management' },
  { value: 'disaster_recovery', label: 'Disaster Recovery' },
  { value: 'business_continuity', label: 'Business Continuity' }
];

const COMPLIANCE_FRAMEWORKS = [
  { value: 'gdpr', label: 'GDPR' },
  { value: 'hipaa', label: 'HIPAA' },
  { value: 'soc2', label: 'SOC 2' },
  { value: 'owasp', label: 'OWASP' },
  { value: 'ccpa', label: 'CCPA' },
  { value: 'cfaa', label: 'CFAA' },
  { value: 'iso27001', label: 'ISO 27001' },
  { value: 'nist', label: 'NIST' },
  { value: 'pci_dss', label: 'PCI DSS' }
];

export default function SecurityPolicyManagement() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  
  const [formData, setFormData] = useState({
    policy_name: '',
    policy_type: '',
    compliance_frameworks: [],
    version: '1.0',
    content: '',
    summary: '',
    tags: []
  });

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['security-policies', user?.organization_id],
    queryFn: () => base44.entities.SecurityPolicy.filter(
      { organization_id: user.organization_id },
      '-created_date',
      100
    ),
    enabled: !!user?.organization_id
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.SecurityPolicy.create({
      ...data,
      organization_id: user.organization_id
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['security-policies']);
      setShowCreateDialog(false);
      toast.success('Policy created successfully');
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to create policy', { description: error.message });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SecurityPolicy.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['security-policies']);
      toast.success('Policy updated successfully');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.SecurityPolicy.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['security-policies']);
      toast.success('Policy deleted successfully');
    }
  });

  const generateWithAI = async (action = 'draft') => {
    setAiGenerating(true);
    try {
      const response = await base44.functions.invoke('aiPolicyDrafter', {
        policy_type: formData.policy_type,
        compliance_frameworks: formData.compliance_frameworks,
        existing_content: formData.content,
        action
      });

      setFormData(prev => ({
        ...prev,
        content: response.policy_content,
        ai_generated: true
      }));

      toast.success('AI-generated policy ready for review');
    } catch (error) {
      toast.error('Failed to generate policy', { description: error.message });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleStatusChange = async (policyId, newStatus) => {
    const updates = { status: newStatus };
    
    if (newStatus === 'approved') {
      updates.approved_by = user.email;
      updates.approved_date = new Date().toISOString();
    }
    
    if (newStatus === 'active') {
      updates.effective_date = new Date().toISOString();
    }

    await updateMutation.mutateAsync({ id: policyId, data: updates });
  };

  const exportPolicy = (policy) => {
    const content = `# ${policy.policy_name}
Version: ${policy.version}
Status: ${policy.status}
Type: ${policy.policy_type}
Compliance: ${policy.compliance_frameworks?.join(', ') || 'N/A'}

---

${policy.content}`;

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${policy.policy_name.replace(/\s+/g, '_')}_v${policy.version}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const resetForm = () => {
    setFormData({
      policy_name: '',
      policy_type: '',
      compliance_frameworks: [],
      version: '1.0',
      content: '',
      summary: '',
      tags: []
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'approved': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'review': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'draft': return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
      case 'archived': return 'bg-red-500/20 text-red-300 border-red-500/30';
      default: return 'bg-slate-500/20 text-slate-300';
    }
  };

  const activePolicies = policies.filter(p => p.status === 'active').length;
  const pendingReview = policies.filter(p => p.status === 'review').length;
  const drafts = policies.filter(p => p.status === 'draft').length;

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6 flex items-center justify-center">
        <Card className="bg-slate-900/50 border-slate-800 max-w-md">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Admin Access Required</h3>
            <p className="text-slate-400">Only administrators can manage security policies.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Security Policy Management</h1>
            <p className="text-slate-400">Define, version, and enforce security policies aligned with compliance frameworks</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Create Policy
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Active Policies</p>
                  <p className="text-2xl font-bold text-white">{activePolicies}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Pending Review</p>
                  <p className="text-2xl font-bold text-white">{pendingReview}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Drafts</p>
                  <p className="text-2xl font-bold text-white">{drafts}</p>
                </div>
                <FileText className="w-8 h-8 text-slate-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Policies</p>
                  <p className="text-2xl font-bold text-white">{policies.length}</p>
                </div>
                <Shield className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Policies List */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Security Policies</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
            ) : policies.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No security policies yet</p>
                <Button onClick={() => setShowCreateDialog(true)} className="mt-4">
                  Create Your First Policy
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {policies.map(policy => (
                  <div key={policy.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-white">{policy.policy_name}</h3>
                          <Badge className={getStatusColor(policy.status)}>
                            {policy.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            v{policy.version}
                          </Badge>
                          {policy.ai_generated && (
                            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                              <Sparkles className="w-3 h-3 mr-1" />
                              AI-Assisted
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-slate-400 mb-3">{policy.summary || 'No summary'}</p>
                        
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="text-xs">
                            {POLICY_TYPES.find(t => t.value === policy.policy_type)?.label}
                          </Badge>
                          {policy.compliance_frameworks?.map(fw => (
                            <Badge key={fw} variant="outline" className="text-xs">
                              {fw.toUpperCase()}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedPolicy(policy);
                            setShowViewDialog(true);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => exportPolicy(policy)}>
                          <Download className="w-4 h-4" />
                        </Button>
                        {policy.status === 'draft' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStatusChange(policy.id, 'review')}
                          >
                            Submit for Review
                          </Button>
                        )}
                        {policy.status === 'review' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStatusChange(policy.id, 'approved')}
                          >
                            Approve
                          </Button>
                        )}
                        {policy.status === 'approved' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStatusChange(policy.id, 'active')}
                          >
                            Activate
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(policy.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              Create Security Policy
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Policy Name</label>
              <Input
                value={formData.policy_name}
                onChange={(e) => setFormData({...formData, policy_name: e.target.value})}
                placeholder="e.g., Data Protection Policy"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Policy Type</label>
                <Select value={formData.policy_type} onValueChange={(value) => setFormData({...formData, policy_type: value})}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {POLICY_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-slate-400 mb-2 block">Version</label>
                <Input
                  value={formData.version}
                  onChange={(e) => setFormData({...formData, version: e.target.value})}
                  placeholder="1.0"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-2 block">Compliance Frameworks</label>
              <div className="flex flex-wrap gap-2">
                {COMPLIANCE_FRAMEWORKS.map(fw => (
                  <Badge
                    key={fw.value}
                    className={`cursor-pointer ${
                      formData.compliance_frameworks.includes(fw.value)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                    onClick={() => {
                      const current = formData.compliance_frameworks;
                      setFormData({
                        ...formData,
                        compliance_frameworks: current.includes(fw.value)
                          ? current.filter(f => f !== fw.value)
                          : [...current, fw.value]
                      });
                    }}
                  >
                    {fw.label}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-2 block">Summary</label>
              <Textarea
                value={formData.summary}
                onChange={(e) => setFormData({...formData, summary: e.target.value})}
                placeholder="Brief description of this policy..."
                className="bg-slate-800 border-slate-700 text-white"
                rows={2}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-slate-400">Policy Content</label>
                <Button
                  size="sm"
                  onClick={() => generateWithAI('draft')}
                  disabled={!formData.policy_type || aiGenerating}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {aiGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate with AI
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({...formData, content: e.target.value})}
                placeholder="Policy content (Markdown supported)..."
                className="bg-slate-800 border-slate-700 text-white font-mono text-sm"
                rows={12}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.policy_name || !formData.policy_type || !formData.content || createMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Policy'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">{selectedPolicy?.policy_name}</DialogTitle>
          </DialogHeader>

          {selectedPolicy && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={getStatusColor(selectedPolicy.status)}>
                  {selectedPolicy.status}
                </Badge>
                <Badge variant="outline">v{selectedPolicy.version}</Badge>
              </div>

              <div className="prose prose-invert max-w-none">
                <ReactMarkdown>{selectedPolicy.content}</ReactMarkdown>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}