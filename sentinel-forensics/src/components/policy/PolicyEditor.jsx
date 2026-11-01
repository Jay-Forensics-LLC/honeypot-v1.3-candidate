import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Shield, Save, Send, Loader2, FilePlus, AlertTriangle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '../hooks/useUser';

import AutoResponseEditor from './AutoResponseEditor';
import FirewallEditor from './FirewallEditor';
import UsbEditor from './UsbEditor';
import HardeningEditor from './HardeningEditor';

export default function PolicyEditor({ policy, onClose }) {
  const [name, setName] = useState(policy?.name || '');
  const [description, setDescription] = useState(policy?.description || '');
  const [changeSummary, setChangeSummary] = useState('');
  const [policyPayload, setPolicyPayload] = useState(policy?.policy_payload_json || {
    auto_response_rules: [],
    firewall_config: { profile: 'BALANCED', logging_level: 'BASIC', rules: [], apply_mode: 'RECOMMEND_ONLY' },
    usb_restrictions: { mode: 'ALLOW_ALL', log_violations: false, alert_on_violation: false },
    hardening_checklist: { items: [] }
  });
  const [editingVersion, setEditingVersion] = useState(null);

  const queryClient = useQueryClient();
  const { data: user } = useUser();

  // Fetch versions for this policy (if editing existing)
  const { data: versions = [] } = useQuery({
    queryKey: ['policy-versions', policy?.id],
    queryFn: async () => {
      return await base44.entities.PolicyVersion.filter({
        policy_id: policy.id,
        organization_id: user.organization_id
      }, '-version_number');
    },
    enabled: !!policy?.id && !!user?.organization_id
  });

  const activeVersion = versions.find(v => v.status === 'ACTIVE');
  const draftVersions = versions.filter(v => v.status === 'DRAFT');
  const pendingVersions = versions.filter(v => v.status === 'PENDING_APPROVAL');
  const latestDraft = draftVersions[0];
  const latestPending = pendingVersions[0];

  // Determine editing mode
  const isReadOnly = !!latestPending;
  const isNewPolicy = !policy;

  useEffect(() => {
    if (latestDraft) {
      // Load draft version
      setEditingVersion(latestDraft);
      setPolicyPayload(latestDraft.payload);
      setChangeSummary(latestDraft.change_summary || '');
    } else if (latestPending) {
      // Load pending version (read-only)
      setEditingVersion(latestPending);
      setPolicyPayload(latestPending.payload);
      setChangeSummary(latestPending.change_summary || '');
    } else if (activeVersion) {
      // Load active version (read-only, need to create draft to edit)
      setEditingVersion(activeVersion);
      setPolicyPayload(activeVersion.payload);
    }
  }, [latestDraft, latestPending, activeVersion]);

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (isNewPolicy) {
        // Create new policy with draft version
        const response = await base44.functions.invoke('policyOperations', {
          operation: 'create',
          name,
          description,
          policy_payload_json: policyPayload
        });
        return response.data;
      } else if (latestDraft) {
        // Update existing draft version
        await base44.entities.PolicyVersion.update(latestDraft.id, {
          payload: policyPayload,
          change_summary: changeSummary
        });
        await base44.entities.SecurityPolicy.update(policy.id, {
          name,
          description
        });
        return { version_id: latestDraft.id };
      } else {
        // Should not reach here (UI prevents editing without draft)
        return Response.json({ error: 'No draft version to save' }, { status: 400 });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['SecurityPolicy'] });
      queryClient.invalidateQueries({ queryKey: ['policy-versions', policy?.id] });
      queryClient.invalidateQueries({ queryKey: ['all-policy-versions', user?.organization_id] });
      toast.success('Draft saved');
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to save draft', { description: error.message });
    }
  });

  const submitForApprovalMutation = useMutation({
    mutationFn: async () => {
      const versionToSubmit = latestDraft;
      if (!versionToSubmit) {
        throw new Error('No draft version to submit');
      }

      // Save current changes first
      await base44.entities.PolicyVersion.update(versionToSubmit.id, {
        payload: policyPayload,
        change_summary: changeSummary
      });

      // Submit for approval
      const response = await base44.functions.invoke('policyVersionLifecycle', {
        operation: 'submitPolicyVersionForApproval',
        policy_id: policy.id,
        version_number: versionToSubmit.version_number
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['SecurityPolicy'] });
      queryClient.invalidateQueries({ queryKey: ['policy-versions', policy?.id] });
      queryClient.invalidateQueries({ queryKey: ['all-policy-versions', user?.organization_id] });
      queryClient.invalidateQueries({ queryKey: ['cp-approval-queue'] });
      toast.success('Version submitted for approval');
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to submit for approval', { description: error.message });
    }
  });

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      const payload = activeVersion?.payload || policy?.policy_payload_json;
      const response = await base44.functions.invoke('policyVersionLifecycle', {
        operation: 'createPolicyVersion',
        policy_id: policy.id,
        change_summary: 'Draft for editing',
        payload
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-versions', policy?.id] });
      queryClient.invalidateQueries({ queryKey: ['all-policy-versions', user?.organization_id] });
      toast.success('Draft version created');
    },
    onError: (error) => {
      toast.error('Failed to create draft', { description: error.message });
    }
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-3">
            <Shield className="w-6 h-6 text-red-500" />
            {policy ? 'Edit Policy' : 'New Policy'}
          </DialogTitle>
        </DialogHeader>

        {/* Version Banner */}
        {!isNewPolicy && (
          <div className="mt-4">
            {latestPending ? (
              <Alert className="bg-yellow-500/10 border-yellow-500/30">
                <Lock className="w-4 h-4 text-yellow-400" />
                <AlertDescription className="text-yellow-300 text-sm">
                  <strong>Pending Approval v{latestPending.version_number}</strong> - This version is awaiting admin review and cannot be edited.
                </AlertDescription>
              </Alert>
            ) : latestDraft ? (
              <Alert className="bg-blue-500/10 border-blue-500/30">
                <FilePlus className="w-4 h-4 text-blue-400" />
                <AlertDescription className="text-blue-300 text-sm">
                  <strong>Editing Draft v{latestDraft.version_number}</strong> - Changes will be saved to this draft version.
                </AlertDescription>
              </Alert>
            ) : activeVersion ? (
              <Alert className="bg-green-500/10 border-green-500/30">
                <AlertTriangle className="w-4 h-4 text-green-400" />
                <AlertDescription className="text-green-300 text-sm flex items-center justify-between">
                  <span><strong>Active v{activeVersion.version_number} (Read-only)</strong> - Create a draft to make changes.</span>
                  <Button
                    size="sm"
                    onClick={() => createDraftMutation.mutate()}
                    disabled={createDraftMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 ml-4"
                  >
                    Create Draft
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="bg-orange-500/10 border-orange-500/30">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <AlertDescription className="text-orange-300 text-sm">
                  <strong>Legacy Policy (Migration Pending)</strong> - This policy uses the old format. Save to migrate to version system.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label className="text-slate-400">Policy Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Corporate Security Baseline"
                className="bg-slate-800 border-slate-700 text-white mt-1"
                disabled={isReadOnly}
              />
            </div>

            <div>
              <Label className="text-slate-400">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Policy purpose and scope..."
                className="bg-slate-800 border-slate-700 text-white mt-1"
                rows={3}
                disabled={isReadOnly}
              />
            </div>

            {!isNewPolicy && latestDraft && (
              <div>
                <Label className="text-slate-400">Change Summary *</Label>
                <Input
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  placeholder="Describe what changed in this version..."
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                  disabled={isReadOnly}
                />
              </div>
            )}
          </div>

          {/* Policy Domains */}
          <Tabs defaultValue="auto-response" className="w-full">
            <TabsList className="bg-slate-800 border-slate-700">
              <TabsTrigger value="auto-response">Auto-Response</TabsTrigger>
              <TabsTrigger value="firewall">Firewall</TabsTrigger>
              <TabsTrigger value="usb">USB Restrictions</TabsTrigger>
              <TabsTrigger value="hardening">Hardening Checklist</TabsTrigger>
            </TabsList>

            <TabsContent value="auto-response">
              <AutoResponseEditor
                rules={policyPayload.auto_response_rules || []}
                onChange={(rules) => !isReadOnly && setPolicyPayload({ ...policyPayload, auto_response_rules: rules })}
                readOnly={isReadOnly}
              />
            </TabsContent>

            <TabsContent value="firewall">
              <FirewallEditor
                config={policyPayload.firewall_config}
                onChange={(config) => !isReadOnly && setPolicyPayload({ ...policyPayload, firewall_config: config })}
                readOnly={isReadOnly}
              />
            </TabsContent>

            <TabsContent value="usb">
              <UsbEditor
                config={policyPayload.usb_restrictions}
                onChange={(config) => !isReadOnly && setPolicyPayload({ ...policyPayload, usb_restrictions: config })}
                readOnly={isReadOnly}
              />
            </TabsContent>

            <TabsContent value="hardening">
              <HardeningEditor
                checklist={policyPayload.hardening_checklist}
                onChange={(checklist) => !isReadOnly && setPolicyPayload({ ...policyPayload, hardening_checklist: checklist })}
                readOnly={isReadOnly}
              />
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-slate-700"
              disabled={saveDraftMutation.isPending || submitForApprovalMutation.isPending}
            >
              Cancel
            </Button>

            {!isReadOnly && (
              <>
                <Button
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={!name || saveDraftMutation.isPending || (latestDraft && !changeSummary)}
                  className="bg-slate-700 hover:bg-slate-600"
                >
                  {saveDraftMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Draft
                </Button>

                {latestDraft && (
                  <Button
                    onClick={() => submitForApprovalMutation.mutate()}
                    disabled={!name || !changeSummary || submitForApprovalMutation.isPending}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                  >
                    {submitForApprovalMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Submit for Approval
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}