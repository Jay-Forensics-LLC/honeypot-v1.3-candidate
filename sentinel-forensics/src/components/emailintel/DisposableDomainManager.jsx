import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function DisposableDomainManager({ caseId, onClose }) {
  const [domain, setDomain] = useState('');
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  const { data: domains = [] } = useQuery({
    queryKey: ['disposable-domains', caseId],
    queryFn: async () => {
      return await base44.entities.DisposableEmailDomain.filter({ case_id: caseId });
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.DisposableEmailDomain.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disposable-domains', caseId] });
      setDomain('');
      setNotes('');
      toast.success('Disposable domain added');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.DisposableEmailDomain.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disposable-domains', caseId] });
      toast.success('Disposable domain removed');
    }
  });

  const handleAdd = async () => {
    if (!domain) {
      toast.error('Domain required');
      return;
    }

    const user = await base44.auth.me();
    createMutation.mutate({
      organization_id: user.organization_id,
      case_id: caseId,
      schema_version: '1.0.0',
      domain: domain.toLowerCase().trim(),
      source: 'user_added',
      notes: notes.trim() || undefined
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Disposable Email Domains</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Add Form */}
          <div className="space-y-3">
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Domain</label>
              <Input
                placeholder="e.g., temp-mail.org"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Notes (optional)</label>
              <Textarea
                placeholder="Context for this domain..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
                rows={2}
              />
            </div>
            <Button
              onClick={handleAdd}
              disabled={createMutation.isPending}
              className="w-full bg-[#EF4444] hover:bg-[#DC2626]"
            >
              <Plus className="w-4 h-4 mr-2" />
              {createMutation.isPending ? 'Adding...' : 'Add Domain'}
            </Button>
          </div>

          {/* Domain List */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-3">Custom Domains ({domains.length})</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {domains.length === 0 ? (
                <p className="text-center text-slate-400 py-8">No custom domains added</p>
              ) : (
                domains.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex-1">
                      <p className="text-white font-mono text-sm">{d.domain}</p>
                      {d.notes && <p className="text-xs text-slate-400 mt-1">{d.notes}</p>}
                      <Badge className="mt-1 bg-blue-500/20 text-blue-400 border-blue-500/30">
                        {d.source}
                      </Badge>
                    </div>
                    {d.source === 'user_added' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(d.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}