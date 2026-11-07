import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Shield, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function PolicyCenter() {
  const { id: caseId } = useParams();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [listType, setListType] = useState('allow');
  const [indicatorType, setIndicatorType] = useState('ip');
  const [pattern, setPattern] = useState('');
  const [reason, setReason] = useState('');

  const { data: policies = [] } = useQuery({
    queryKey: ['policy-entries', caseId],
    queryFn: async () => {
      return await base44.entities.PolicyListEntry.filter({ case_id: caseId });
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.PolicyListEntry.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-entries', caseId] });
      setShowAdd(false);
      setPattern('');
      setReason('');
      toast.success('Policy entry created');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.PolicyListEntry.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy-entries', caseId] });
      toast.success('Policy entry deleted');
    }
  });

  const handleCreate = async () => {
    if (!pattern || !reason) {
      toast.error('Pattern and reason required');
      return;
    }

    const user = await base44.auth.me();
    createMutation.mutate({
      case_id: caseId,
      organization_id: user.organization_id,
      schema_version: '1.0.0',
      list_type: listType,
      indicator_type: indicatorType,
      pattern: pattern.trim(),
      reason: reason.trim(),
      created_by_user_id: user.id
    });
  };

  const allowlist = policies.filter(p => p.list_type === 'allow');
  const blocklist = policies.filter(p => p.list_type === 'block');

  return (
    <>
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Policy Center</h1>
              <p className="text-slate-400">Manage allowlists and blocklists</p>
            </div>
            <Button
              onClick={() => setShowAdd(true)}
              className="bg-[#EF4444] hover:bg-[#DC2626]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Policy Entry
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">Allowlist Entries</p>
                <p className="text-3xl font-bold text-green-400 mt-1">{allowlist.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">Blocklist Entries</p>
                <p className="text-3xl font-bold text-red-400 mt-1">{blocklist.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Allowlist */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-400" />
                Allowlist
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {allowlist.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">No allowlist entries</p>
                ) : (
                  allowlist.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-mono">{entry.pattern}</span>
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                            {entry.indicator_type}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-400">{entry.reason}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Created: {format(new Date(entry.created_date), 'MMM d, yyyy HH:mm')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(entry.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Blocklist */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-400" />
                Blocklist
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {blocklist.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">No blocklist entries</p>
                ) : (
                  blocklist.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-mono">{entry.pattern}</span>
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                            {entry.indicator_type}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-400">{entry.reason}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Created: {format(new Date(entry.created_date), 'MMM d, yyyy HH:mm')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(entry.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Add Policy Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm text-slate-400 mb-2 block">List Type</label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={listType === 'allow' ? 'default' : 'outline'}
                  onClick={() => setListType('allow')}
                  className={listType === 'allow' ? 'bg-green-600' : 'border-slate-700'}
                >
                  Allowlist
                </Button>
                <Button
                  size="sm"
                  variant={listType === 'block' ? 'default' : 'outline'}
                  onClick={() => setListType('block')}
                  className={listType === 'block' ? 'bg-red-600' : 'border-slate-700'}
                >
                  Blocklist
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Indicator Type</label>
              <div className="flex gap-2">
                {['ip', 'domain', 'email'].map(t => (
                  <Button
                    key={t}
                    size="sm"
                    variant={indicatorType === t ? 'default' : 'outline'}
                    onClick={() => setIndicatorType(t)}
                    className={indicatorType === t ? 'bg-blue-600' : 'border-slate-700'}
                  >
                    {t.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Pattern</label>
              <Input
                placeholder="e.g., 192.168.1.0/24, example.com"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500 mt-1">
                Supports exact match and CIDR for IPs
              </p>
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Reason</label>
              <Textarea
                placeholder="Justification for this entry..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
                rows={3}
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="w-full bg-[#EF4444] hover:bg-[#DC2626]"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Entry'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}