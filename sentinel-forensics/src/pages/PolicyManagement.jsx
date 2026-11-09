import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  Plus,
  Clock,
  Target,
  Activity,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { useUser } from '../components/hooks/useUser';
import { useOrgList } from '../components/hooks/useOrgQuery';

import PoliciesList from '../components/policy/PoliciesList';
import PolicyEditor from '../components/policy/PolicyEditor';
import PolicyAssignments from '../components/policy/PolicyAssignments';
import PolicyComplianceView from '../components/policy/PolicyComplianceView';
import ActionsQueue from '../components/policy/ActionsQueue';
import PolicyTemplates from '../components/policy/PolicyTemplates';

export default function PolicyManagement() {
  const { user } = useUser();
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const { data: policies = [] } = useOrgList('SecurityPolicy', '-updated_date');
  const { data: assignments = [] } = useOrgList('PolicyAssignment', '-created_date');
  const { data: evaluations = [] } = useOrgList('PolicyEvaluation', '-last_evaluated_at');
  const { data: actions = [] } = useOrgList('PolicyActionQueue', '-created_date');

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <div className="max-w-2xl mx-auto mt-12 text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-slate-600" />
          <p className="text-slate-400">Policy Management is only available to administrators</p>
        </div>
      </div>
    );
  }

  const publishedPolicies = policies.filter(p => p.status === 'PUBLISHED');
  const activeAssignments = assignments.filter(a => a.is_active);
  const pendingActions = actions.filter(a => ['QUEUED', 'PENDING_APPROVAL'].includes(a.status));
  const nonCompliantDevices = evaluations.filter(e => e.status === 'NON_COMPLIANT').length;

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <Shield className="w-8 h-8 text-[#EF4444]" />
              Policy Management
            </h1>
            <p className="text-slate-400">
              Define, version, assign, and enforce security policies across devices
            </p>
          </div>
          <Button
            onClick={() => {
              setSelectedPolicy(null);
              setEditorOpen(true);
            }}
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Policy
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Shield className="w-10 h-10 text-blue-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{publishedPolicies.length}</p>
                  <p className="text-xs text-slate-400">Published Policies</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Target className="w-10 h-10 text-purple-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{activeAssignments.length}</p>
                  <p className="text-xs text-slate-400">Active Assignments</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-10 h-10 text-green-400" />
                <div>
                  <p className="text-2xl font-bold text-white">
                    {evaluations.filter(e => e.status === 'COMPLIANT').length}
                  </p>
                  <p className="text-xs text-slate-400">Compliant Devices</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-10 h-10 text-red-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{nonCompliantDevices}</p>
                  <p className="text-xs text-slate-400">Non-Compliant</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Activity className="w-10 h-10 text-yellow-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{pendingActions.length}</p>
                  <p className="text-xs text-slate-400">Pending Actions</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="policies" className="w-full">
          <TabsList className="bg-slate-900 border-slate-800">
            <TabsTrigger value="policies" className="data-[state=active]:bg-red-600">
              <Shield className="w-4 h-4 mr-2" />
              Policies ({policies.length})
            </TabsTrigger>
            <TabsTrigger value="templates" className="data-[state=active]:bg-red-600">
              <Clock className="w-4 h-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="assignments" className="data-[state=active]:bg-red-600">
              <Target className="w-4 h-4 mr-2" />
              Assignments ({assignments.length})
            </TabsTrigger>
            <TabsTrigger value="compliance" className="data-[state=active]:bg-red-600">
              <CheckCircle className="w-4 h-4 mr-2" />
              Compliance
            </TabsTrigger>
            <TabsTrigger value="actions" className="data-[state=active]:bg-red-600">
              <Activity className="w-4 h-4 mr-2" />
              Actions Queue ({actions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="policies">
            <PoliciesList 
              policies={policies}
              onEdit={(policy) => {
                setSelectedPolicy(policy);
                setEditorOpen(true);
              }}
            />
          </TabsContent>

          <TabsContent value="templates">
            <PolicyTemplates 
              onCreateFromTemplate={(policy) => {
                setSelectedPolicy(policy);
                setEditorOpen(true);
              }}
            />
          </TabsContent>

          <TabsContent value="assignments">
            <PolicyAssignments 
              policies={policies}
              assignments={assignments}
            />
          </TabsContent>

          <TabsContent value="compliance">
            <PolicyComplianceView 
              evaluations={evaluations}
            />
          </TabsContent>

          <TabsContent value="actions">
            <ActionsQueue 
              actions={actions}
            />
          </TabsContent>
        </Tabs>

        {/* Policy Editor Dialog */}
        {editorOpen && (
          <PolicyEditor
            policy={selectedPolicy}
            onClose={() => {
              setEditorOpen(false);
              setSelectedPolicy(null);
            }}
          />
        )}
      </div>
    </div>
  );
}