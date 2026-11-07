import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Save, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '../components/common/PageHeader';
import AutoResponseEditor from '../components/policy/AutoResponseEditor';
import FirewallEditor from '../components/policy/FirewallEditor';
import UsbEditor from '../components/policy/UsbEditor';
import HardeningEditor from '../components/policy/HardeningEditor';

export default function PolicyEditor() {
  const { policyId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = policyId === 'new';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [policyPayload, setPolicyPayload] = useState({
    auto_response_rules: [],
    firewall_config: {},
    usb_restrictions: {},
    hardening_checklist: {}
  });

  const { data: policy, isLoading } = useQuery({
    queryKey: ['security-policy', policyId],
    queryFn: async () => {
      if (isNew) return null;
      return await base44.entities.SecurityPolicy.get(policyId);
    },
    enabled: !isNew
  });

  useEffect(() => {
    if (policy) {
      setName(policy.name || '');
      setDescription(policy.description || '');
      setPolicyPayload(policy.policy_payload_json || {
        auto_response_rules: [],
        firewall_config: {},
        usb_restrictions: {},
        hardening_checklist: {}
      });
    }
  }, [policy]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      const response = await base44.functions.invoke('policyOperations', {
        operation: isNew ? 'create' : 'update',
        policy_id: isNew ? undefined : policyId,
        name,
        description,
        policy_payload_json: policyPayload,
        organization_id: user.organization_id
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['security-policies'] });
      queryClient.invalidateQueries({ queryKey: ['security-policy', policyId] });
      toast.success(isNew ? 'Policy created' : 'Policy updated');
      if (isNew && data.policy) {
        navigate(`/PolicyEditor/${data.policy.id}`);
      }
    },
    onError: (error) => {
      toast.error('Failed to save policy', { description: error.message });
    }
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Policy name is required');
      return;
    }
    saveMutation.mutate();
  };

  if (!isNew && isLoading) {
    return <div className="p-6 text-white">Loading policy...</div>;
  }

  if (!isNew && !policy) {
    return (
      <div className="p-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="text-center py-12">
            <Shield className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400 mb-4">Policy not found</p>
            <Button onClick={() => navigate('/PolicyList')} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Policies
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PageHeader
        title={isNew ? 'Create Policy' : 'Edit Policy'}
        description={isNew ? 'Define a new security policy' : `Editing: ${policy?.name}`}
        icon={Shield}
        actions={[
          {
            label: 'Back',
            icon: ArrowLeft,
            variant: 'outline',
            onClick: () => navigate('/PolicyList')
          },
          {
            label: saveMutation.isPending ? 'Saving...' : 'Save Policy',
            icon: saveMutation.isPending ? Loader2 : Save,
            variant: 'default',
            className: 'bg-blue-600 hover:bg-blue-700',
            onClick: handleSave,
            disabled: saveMutation.isPending
          }
        ]}
      />

      <div className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-3">
              Policy Details
              {!isNew && policy?.status && (
                <Badge className={
                  policy.status === 'PUBLISHED' ? 'bg-green-500/20 text-green-400' :
                  policy.status === 'DRAFT' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-slate-500/20 text-slate-400'
                }>
                  {policy.status}
                </Badge>
              )}
              {!isNew && policy?.version && (
                <Badge variant="outline" className="text-slate-400">
                  Version {policy.version}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-400">Policy Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., High Security Policy"
                className="bg-slate-800 border-slate-700 text-white mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-slate-400">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the purpose and scope of this policy..."
                className="bg-slate-800 border-slate-700 text-white mt-1"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Policy Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="auto-response" className="w-full">
              <TabsList className="bg-slate-800 w-full justify-start">
                <TabsTrigger value="auto-response">Auto Response</TabsTrigger>
                <TabsTrigger value="firewall">Firewall</TabsTrigger>
                <TabsTrigger value="usb">USB Restrictions</TabsTrigger>
                <TabsTrigger value="hardening">Hardening Checklist</TabsTrigger>
              </TabsList>

              <TabsContent value="auto-response" className="mt-6">
                <AutoResponseEditor
                  config={policyPayload.auto_response_rules || []}
                  onChange={(rules) => setPolicyPayload({
                    ...policyPayload,
                    auto_response_rules: rules
                  })}
                />
              </TabsContent>

              <TabsContent value="firewall" className="mt-6">
                <FirewallEditor
                  config={policyPayload.firewall_config || {}}
                  onChange={(config) => setPolicyPayload({
                    ...policyPayload,
                    firewall_config: config
                  })}
                />
              </TabsContent>

              <TabsContent value="usb" className="mt-6">
                <UsbEditor
                  config={policyPayload.usb_restrictions || {}}
                  onChange={(config) => setPolicyPayload({
                    ...policyPayload,
                    usb_restrictions: config
                  })}
                />
              </TabsContent>

              <TabsContent value="hardening" className="mt-6">
                <HardeningEditor
                  config={policyPayload.hardening_checklist || {}}
                  onChange={(config) => setPolicyPayload({
                    ...policyPayload,
                    hardening_checklist: config
                  })}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}