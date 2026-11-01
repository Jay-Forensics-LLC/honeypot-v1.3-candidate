import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Shield,
  Edit,
  Copy,
  Archive,
  Clock,
  Search,
  FileText,
  Eye,
  FilePlus,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useUser } from '../hooks/useUser';
import VersionsPanel from './VersionsPanel';

export default function PoliciesList({ policies, onEdit }) {
  const [search, setSearch] = useState('');
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState(null);
  const queryClient = useQueryClient();
  const { data: user } = useUser();

  // Fetch all versions for all policies to show version status
  const { data: allVersions = [] } = useQuery({
    queryKey: ['all-policy-versions', user?.organization_id],
    queryFn: async () => {
      return await base44.entities.PolicyVersion.filter({
        organization_id: user.organization_id
      }, '-version_number', 200);
    },
    enabled: !!user?.organization_id
  });

  const cloneMutation = useMutation({
    mutationFn: async (policyId) => {
      const response = await base44.functions.invoke('policyOperations', {
        operation: 'clonePolicy',
        policy_id: policyId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['SecurityPolicy'] });
      toast.success('Policy cloned successfully');
    }
  });

  const archiveMutation = useMutation({
    mutationFn: async (policyId) => {
      const response = await base44.functions.invoke('policyOperations', {
        operation: 'archivePolicy',
        policy_id: policyId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['SecurityPolicy'] });
      queryClient.invalidateQueries({ queryKey: ['all-policy-versions', user?.organization_id] });
      toast.success('Policy archived');
    }
  });

  const createDraftMutation = useMutation({
    mutationFn: async (policy) => {
      // Get ACTIVE version payload
      const activeVersions = allVersions.filter(v => 
        v.policy_id === policy.id && v.status === 'ACTIVE'
      );
      
      const payload = activeVersions.length > 0 
        ? activeVersions[0].payload 
        : policy.policy_payload_json;

      const response = await base44.functions.invoke('policyVersionLifecycle', {
        operation: 'createPolicyVersion',
        policy_id: policy.id,
        change_summary: 'Draft from active version',
        payload
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-policy-versions', user?.organization_id] });
      toast.success('Draft version created');
    },
    onError: (error) => {
      toast.error('Failed to create draft', { description: error.message });
    }
  });

  const filteredPolicies = policies.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status) => {
    const colors = {
      DRAFT: 'bg-slate-500/20 text-slate-400',
      PUBLISHED: 'bg-green-500/20 text-green-400',
      ARCHIVED: 'bg-red-500/20 text-red-400'
    };
    return colors[status] || colors.DRAFT;
  };

  if (policies.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-12 text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-slate-600" />
          <p className="text-slate-400 mb-4">No policies yet</p>
          <p className="text-sm text-slate-500">
            Create your first security policy to start managing device compliance
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white">All Policies</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search policies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-700"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {filteredPolicies.map((policy) => {
            const policyVersions = allVersions.filter(v => v.policy_id === policy.id);
            const activeVersion = policyVersions.find(v => v.status === 'ACTIVE');
            const draftVersions = policyVersions.filter(v => v.status === 'DRAFT');
            const pendingVersions = policyVersions.filter(v => v.status === 'PENDING_APPROVAL');
            const hasNoActiveVersion = !activeVersion;

            let lifecycleStatus = 'ACTIVE';
            if (pendingVersions.length > 0) {
              lifecycleStatus = 'PENDING_APPROVAL';
            } else if (draftVersions.length > 0 && !activeVersion) {
              lifecycleStatus = 'DRAFT';
            } else if (policy.status === 'ARCHIVED') {
              lifecycleStatus = 'ARCHIVED';
            }

            return (
              <div
                key={policy.id}
                className="p-4 bg-slate-800/30 rounded-lg border border-slate-700 hover:border-slate-600 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Shield className="w-5 h-5 text-blue-400" />
                      <h3 className="text-lg font-semibold text-white">{policy.name}</h3>
                      <Badge className={getStatusColor(lifecycleStatus)}>
                        {lifecycleStatus}
                      </Badge>
                      {policy.is_enabled && activeVersion && (
                        <Badge className="bg-green-500/20 text-green-400">
                          ENABLED
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-slate-400">
                        {activeVersion ? `Active v${activeVersion.version_number}` : `v${policy.version}`}
                      </Badge>
                      {draftVersions.length > 0 && (
                        <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                          {draftVersions.length} draft(s)
                        </Badge>
                      )}
                      {hasNoActiveVersion && (
                        <Badge className="bg-orange-500/20 text-orange-400 text-xs">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Migration pending
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm text-slate-300 mb-3">
                      {policy.description || 'No description'}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {activeVersion 
                          ? format(new Date(activeVersion.activated_at || activeVersion.created_date), 'MMM d, yyyy')
                          : format(new Date(policy.updated_date || policy.created_date), 'MMM d, yyyy')
                        }
                      </span>
                      <span>
                        {activeVersion 
                          ? `Activated by ${activeVersion.approved_by || activeVersion.created_by}`
                          : `Updated by ${policy.updated_by || policy.created_by}`
                        }
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedPolicyId(policy.id);
                        setVersionsOpen(true);
                      }}
                      className="border-slate-700"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Versions ({policyVersions.length})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => createDraftMutation.mutate(policy)}
                      disabled={createDraftMutation.isPending || draftVersions.length > 0}
                      className="border-blue-600 text-blue-400"
                    >
                      <FilePlus className="w-4 h-4 mr-2" />
                      Create Draft
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(policy)}
                      className="border-slate-700"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cloneMutation.mutate(policy.id)}
                      disabled={cloneMutation.isPending}
                      className="border-slate-700"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Clone
                    </Button>
                    {policy.status !== 'ARCHIVED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => archiveMutation.mutate(policy.id)}
                        disabled={archiveMutation.isPending}
                        className="border-slate-700"
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        Archive
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
      </Card>

      <VersionsPanel 
        policyId={selectedPolicyId}
        open={versionsOpen}
        onClose={() => {
          setVersionsOpen(false);
          setSelectedPolicyId(null);
        }}
      />
    </>
  );
}