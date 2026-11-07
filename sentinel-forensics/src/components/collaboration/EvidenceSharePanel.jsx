import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Share2, Users, Lock, Clock, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '../hooks/useUser';

export default function EvidenceSharePanel({ evidenceId }) {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [shareDialog, setShareDialog] = useState(false);
  const [sharedWith, setSharedWith] = useState('');
  const [accessLevel, setAccessLevel] = useState('view');
  const [message, setMessage] = useState('');

  const { data: shares = [] } = useQuery({
    queryKey: ['evidence-shares', evidenceId],
    queryFn: () => base44.entities.EvidenceShare.filter({ evidence_id: evidenceId })
  });

  const shareMutation = useMutation({
    mutationFn: (data) => base44.entities.EvidenceShare.create(data),
    onSuccess: async () => {
      queryClient.invalidateQueries(['evidence-shares', evidenceId]);
      
      // Send notifications
      const emails = sharedWith.split(',').map(e => e.trim());
      await Promise.all(emails.map(email => 
        base44.entities.Notification.create({
          organization_id: user.organization_id,
          user_email: email,
          type: 'evidence_shared',
          title: 'Evidence Shared With You',
          message: message || 'New evidence has been shared with you',
          severity: 'info',
          link: `/EvidenceDetail/${evidenceId}`
        })
      ));
      
      setShareDialog(false);
      setSharedWith('');
      setMessage('');
      toast.success('Evidence shared successfully');
    }
  });

  const revokeMutation = useMutation({
    mutationFn: (id) => base44.entities.EvidenceShare.update(id, { revoked: true }),
    onSuccess: () => {
      queryClient.invalidateQueries(['evidence-shares', evidenceId]);
      toast.success('Access revoked');
    }
  });

  function handleShare() {
    if (!sharedWith.trim()) {
      toast.error('Enter at least one email');
      return;
    }

    const emails = sharedWith.split(',').map(e => e.trim());
    shareMutation.mutate({
      evidence_id: evidenceId,
      organization_id: user.organization_id,
      shared_by: user.email,
      shared_with: emails,
      access_level: accessLevel,
      message
    });
  }

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <Share2 className="w-4 h-4 text-blue-400" />
              Shared Access
            </CardTitle>
            <Button size="sm" onClick={() => setShareDialog(true)} className="bg-blue-600 hover:bg-blue-700">
              <Share2 className="w-3 h-3 mr-2" />
              Share
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {shares.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Not shared with anyone yet</p>
          ) : (
            <div className="space-y-2">
              {shares.map((share) => (
                <div key={share.id} className="flex justify-between items-center p-3 bg-slate-800/30 rounded">
                  <div>
                    <p className="text-sm text-white">{share.shared_with.join(', ')}</p>
                    <p className="text-xs text-slate-400">
                      {share.access_level} access • Shared {new Date(share.created_date).toLocaleDateString()}
                    </p>
                  </div>
                  {!share.revoked && (
                    <Button size="sm" variant="outline" onClick={() => revokeMutation.mutate(share.id)}>
                      Revoke
                    </Button>
                  )}
                  {share.revoked && (
                    <span className="text-xs text-red-400">Revoked</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={shareDialog} onOpenChange={setShareDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Share Evidence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email Addresses (comma-separated)</Label>
              <Input
                value={sharedWith}
                onChange={(e) => setSharedWith(e.target.value)}
                placeholder="user1@example.com, user2@example.com"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div>
              <Label>Access Level</Label>
              <Select value={accessLevel} onValueChange={setAccessLevel}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="view">View Only</SelectItem>
                  <SelectItem value="download">View & Download</SelectItem>
                  <SelectItem value="analyze">Full Access (Analyze)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Message (Optional)</Label>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Why you're sharing this evidence..."
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShareDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleShare} className="bg-blue-600 hover:bg-blue-700">
                Share Evidence
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}