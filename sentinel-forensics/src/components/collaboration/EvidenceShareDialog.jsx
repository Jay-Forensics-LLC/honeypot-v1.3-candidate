import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Share2, Check, X, Download, Eye, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '../hooks/useUser';

export default function EvidenceShareDialog({ evidence, open, onClose }) {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [permissions, setPermissions] = useState({
    can_view: true,
    can_download: false,
    can_analyze: false
  });
  const queryClient = useQueryClient();
  const { data: user } = useUser();

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => base44.entities.User.list(),
    enabled: open
  });

  const { data: existingShares = [] } = useQuery({
    queryKey: ['evidence-shares', evidence?.id],
    queryFn: () => base44.entities.EvidenceShare.filter({
      evidence_id: evidence.id,
      organization_id: user.organization_id
    }),
    enabled: !!evidence?.id && !!user?.organization_id && open
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      return base44.entities.EvidenceShare.create({
        organization_id: user.organization_id,
        evidence_id: evidence.id,
        case_id: evidence.case_id,
        shared_by: user.email,
        shared_with: selectedUsers,
        permissions,
        is_active: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-shares'] });
      toast.success('Evidence shared successfully');
      onClose();
    }
  });

  const revokeMutation = useMutation({
    mutationFn: (shareId) => base44.entities.EvidenceShare.delete(shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-shares'] });
      toast.success('Access revoked');
    }
  });

  function handleToggleUser(userId) {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  }

  const availableUsers = teamMembers.filter(u => u.email !== user?.email);

  if (!evidence) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Share Evidence: {evidence.title || evidence.filename}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing Shares */}
          {existingShares.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-300">Currently Shared With</Label>
              {existingShares.map(share => (
                <div key={share.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded">
                  <div>
                    <p className="text-sm text-white">{share.shared_with?.join(', ')}</p>
                    <div className="flex gap-2 mt-1">
                      {share.permissions?.can_view && (
                        <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Badge>
                      )}
                      {share.permissions?.can_download && (
                        <Badge variant="outline" className="text-xs text-green-400 border-green-500/30">
                          <Download className="w-3 h-3 mr-1" />
                          Download
                        </Badge>
                      )}
                      {share.permissions?.can_analyze && (
                        <Badge variant="outline" className="text-xs text-purple-400 border-purple-500/30">
                          <Search className="w-3 h-3 mr-1" />
                          Analyze
                        </Badge>
                      )}
                    </div>
                  </div>
                  {share.shared_by === user?.email && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revokeMutation.mutate(share.id)}
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Team Members */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-300">Share With Team Members</Label>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {availableUsers.map(member => (
                <div
                  key={member.id}
                  onClick={() => handleToggleUser(member.email)}
                  className="flex items-center justify-between p-3 bg-slate-800/30 rounded cursor-pointer hover:bg-slate-800/50 transition-colors"
                >
                  <div>
                    <p className="text-sm text-white">{member.full_name || member.email}</p>
                    <p className="text-xs text-slate-500">{member.email}</p>
                  </div>
                  {selectedUsers.includes(member.email) && (
                    <Check className="w-5 h-5 text-green-400" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Permissions */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-300">Permissions</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={permissions.can_view}
                  onChange={(e) => setPermissions({...permissions, can_view: e.target.checked})}
                  className="w-4 h-4"
                />
                <Label className="text-sm text-slate-300">Can view evidence</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={permissions.can_download}
                  onChange={(e) => setPermissions({...permissions, can_download: e.target.checked})}
                  className="w-4 h-4"
                />
                <Label className="text-sm text-slate-300">Can download files</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={permissions.can_analyze}
                  onChange={(e) => setPermissions({...permissions, can_analyze: e.target.checked})}
                  className="w-4 h-4"
                />
                <Label className="text-sm text-slate-300">Can run analysis</Label>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => shareMutation.mutate()}
              disabled={selectedUsers.length === 0 || shareMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Share Evidence
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}