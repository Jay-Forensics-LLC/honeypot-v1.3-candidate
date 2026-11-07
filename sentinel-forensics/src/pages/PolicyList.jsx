import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, Plus, Search, Copy, Archive, Edit, 
  CheckCircle, Clock, FileText 
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '../components/common/PageHeader';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function PolicyList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [archiveTarget, setArchiveTarget] = useState(null);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['security-policies'],
    queryFn: async () => {
      const user = await base44.auth.me();
      return await base44.entities.SecurityPolicy.filter({
        organization_id: user.organization_id
      }, '-updated_date');
    }
  });

  const cloneMutation = useMutation({
    mutationFn: async (policyId) => {
      const response = await base44.functions.invoke('policyOperations', {
        operation: 'clone',
        policy_id: policyId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-policies'] });
      toast.success('Policy cloned successfully');
    },
    onError: (error) => {
      toast.error('Failed to clone policy', { description: error.message });
    }
  });

  const archiveMutation = useMutation({
    mutationFn: async (policyId) => {
      const response = await base44.functions.invoke('policyOperations', {
        operation: 'archive',
        policy_id: policyId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-policies'] });
      setArchiveTarget(null);
      toast.success('Policy archived');
    },
    onError: (error) => {
      toast.error('Failed to archive policy', { description: error.message });
    }
  });

  const filteredPolicies = policies.filter(policy => 
    policy.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status) => {
    const colors = {
      PUBLISHED: 'bg-green-500/20 text-green-400',
      DRAFT: 'bg-yellow-500/20 text-yellow-400',
      ARCHIVED: 'bg-slate-500/20 text-slate-400'
    };
    return colors[status] || colors.DRAFT;
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PageHeader
        title="Policy Management"
        description="Create, manage, and assign security policies"
        icon={Shield}
        actions={[
          {
            label: 'Create Policy',
            icon: Plus,
            variant: 'default',
            className: 'bg-blue-600 hover:bg-blue-700',
            onClick: () => navigate('/PolicyEditor/new')
          }
        ]}
      />

      <Card className="bg-slate-900/50 border-slate-800 mb-6">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search policies..."
              className="pl-10 bg-slate-800 border-slate-700 text-white"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Loading policies...</div>
      ) : filteredPolicies.length === 0 ? (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="text-center py-12">
            <Shield className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400 mb-4">
              {searchQuery ? 'No policies match your search' : 'No policies yet'}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => navigate('/PolicyEditor/new')}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create First Policy
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredPolicies.map((policy) => (
            <Card key={policy.id} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{policy.name}</h3>
                      <Badge className={getStatusColor(policy.status)}>
                        {policy.status}
                      </Badge>
                      <Badge variant="outline" className="text-slate-400">
                        v{policy.version}
                      </Badge>
                    </div>
                    
                    {policy.description && (
                      <p className="text-sm text-slate-400 mb-3">{policy.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>
                        Updated {format(new Date(policy.updated_date), 'MMM d, yyyy')}
                      </span>
                      {policy.updated_by && (
                        <span>by {policy.updated_by}</span>
                      )}
                      {policy.policy_payload_json && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {Object.keys(policy.policy_payload_json).length} domains configured
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/PolicyEditor/${policy.id}`)}
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
                        onClick={() => setArchiveTarget(policy)}
                        className="border-slate-700 text-slate-400 hover:text-red-400"
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        Archive
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!archiveTarget} onOpenChange={() => setArchiveTarget(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Archive Policy</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to archive "{archiveTarget?.name}"? Archived policies cannot be assigned but can be restored later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveMutation.mutate(archiveTarget.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Archive Policy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}