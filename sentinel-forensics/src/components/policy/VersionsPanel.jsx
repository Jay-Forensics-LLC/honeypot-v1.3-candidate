import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, CheckCircle, XCircle, FileText, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { useUser } from '../hooks/useUser';

export default function VersionsPanel({ policyId, open, onClose }) {
  const { data: user } = useUser();

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['policy-versions', policyId],
    queryFn: async () => {
      return await base44.entities.PolicyVersion.filter({
        policy_id: policyId,
        organization_id: user.organization_id
      }, '-version_number');
    },
    enabled: open && !!policyId && !!user?.organization_id
  });

  const getStatusBadge = (status) => {
    const badges = {
      DRAFT: { className: 'bg-slate-500/20 text-slate-400', label: 'DRAFT' },
      PENDING_APPROVAL: { className: 'bg-yellow-500/20 text-yellow-400', label: 'PENDING APPROVAL' },
      ACTIVE: { className: 'bg-green-500/20 text-green-400', label: 'ACTIVE' },
      ARCHIVED: { className: 'bg-red-500/20 text-red-400', label: 'ARCHIVED' }
    };
    return badges[status] || badges.DRAFT;
  };

  const getStatusIcon = (status) => {
    const icons = {
      DRAFT: Clock,
      PENDING_APPROVAL: AlertTriangle,
      ACTIVE: CheckCircle,
      ARCHIVED: XCircle
    };
    const Icon = icons[status] || FileText;
    return <Icon className="w-4 h-4" />;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-400" />
            Version History
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-slate-600 border-t-blue-500 rounded-full mx-auto" />
              <p className="text-slate-400 mt-4">Loading versions...</p>
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">No versions found</p>
              <p className="text-xs text-slate-500 mt-2">This policy may need migration to the version system</p>
            </div>
          ) : (
            <div className="space-y-4">
              {versions.map((version) => {
                const statusBadge = getStatusBadge(version.status);
                const StatusIcon = getStatusIcon(version.status);
                const isRejected = version.diff_from_previous?.last_rejected_at;

                return (
                  <Card key={version.id} className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-700">
                            <span className="text-white font-bold">v{version.version_number}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <StatusIcon />
                              <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
                            </div>
                            <p className="text-xs text-slate-400">
                              Created by {version.created_by} on {format(new Date(version.created_date), 'MMM d, yyyy HH:mm')}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <span className="text-xs text-slate-400">Change Summary:</span>
                          <p className="text-sm text-white mt-1">{version.change_summary}</p>
                        </div>

                        {version.status === 'ACTIVE' && version.approved_by && (
                          <div className="bg-green-500/10 border border-green-500/30 rounded p-2">
                            <p className="text-xs text-green-300">
                              ✓ Approved by {version.approved_by} on {format(new Date(version.approved_at), 'MMM d, yyyy HH:mm')}
                            </p>
                          </div>
                        )}

                        {isRejected && (
                          <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                            <p className="text-xs text-red-300">
                              ✗ Last rejected by {version.diff_from_previous.last_rejected_by} on {format(new Date(version.diff_from_previous.last_rejected_at), 'MMM d, yyyy HH:mm')}
                            </p>
                            <p className="text-xs text-red-200 mt-1">
                              Reason: {version.diff_from_previous.last_rejection_reason}
                            </p>
                          </div>
                        )}

                        {version.status === 'ARCHIVED' && version.archived_at && (
                          <div className="bg-slate-500/10 border border-slate-500/30 rounded p-2">
                            <p className="text-xs text-slate-300">
                              Archived on {format(new Date(version.archived_at), 'MMM d, yyyy HH:mm')}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}