import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Send, CheckCircle2, XCircle, Clock, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function DistributionManager({ reportRunId }) {
  const queryClient = useQueryClient();
  const [showPolicyDialog, setShowPolicyDialog] = useState(false);
  const [policyData, setPolicyData] = useState({
    policy_name: '',
    to_emails: '',
    delivery_method: 'secure_link'
  });

  // Fetch policies
  const { data: policies = [] } = useQuery({
    queryKey: ['distribution-policies'],
    queryFn: () => base44.entities.DistributionPolicy.filter({ is_active: true })
  });

  // Fetch delivery attempts
  const { data: attempts = [] } = useQuery({
    queryKey: ['delivery-attempts', reportRunId],
    queryFn: () => base44.entities.ReportDeliveryAttempt.filter({ report_run_id: reportRunId }),
    enabled: !!reportRunId
  });

  // Distribute mutation
  const distributeMutation = useMutation({
    mutationFn: async (policyId) => {
      const response = await base44.functions.invoke('distributeReport', {
        report_run_id: reportRunId,
        policy_id: policyId
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-attempts', reportRunId] });
      toast.success('Report distributed successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Distribution failed');
    }
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'delivered': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'sent': return <Mail className="w-4 h-4 text-blue-500" />;
      default: return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-white">Distribution Policies</CardTitle>
            <Button
              onClick={() => setShowPolicyDialog(true)}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Policy
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {policies.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No distribution policies configured</p>
          ) : (
            <div className="space-y-2">
              {policies.map(policy => (
                <div
                  key={policy.id}
                  className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3"
                >
                  <div>
                    <p className="text-white font-semibold">{policy.policy_name}</p>
                    <p className="text-xs text-slate-400">
                      {policy.recipients?.to?.length || 0} recipients • {policy.delivery_method}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => distributeMutation.mutate(policy.id)}
                    disabled={distributeMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Send
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {attempts.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Delivery History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {attempts.map(attempt => (
                <div
                  key={attempt.id}
                  className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(attempt.delivery_status)}
                    <div>
                      <p className="text-white">{attempt.recipient_email}</p>
                      <p className="text-xs text-slate-400">
                        {attempt.sent_at ? new Date(attempt.sent_at).toLocaleString() : 'Pending'}
                      </p>
                    </div>
                  </div>
                  <Badge className={
                    attempt.delivery_status === 'delivered' ? 'bg-green-500/20 text-green-400' :
                    attempt.delivery_status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    'bg-slate-500/20 text-slate-400'
                  }>
                    {attempt.delivery_status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Policy Creation Dialog */}
      <Dialog open={showPolicyDialog} onOpenChange={setShowPolicyDialog}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Create Distribution Policy</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-slate-400">Policy Name</Label>
              <Input
                value={policyData.policy_name}
                onChange={(e) => setPolicyData({ ...policyData, policy_name: e.target.value })}
                placeholder="e.g., Client Distribution"
                className="bg-slate-800 border-slate-700 text-white mt-2"
              />
            </div>
            <div>
              <Label className="text-slate-400">Recipient Emails (comma-separated)</Label>
              <Input
                value={policyData.to_emails}
                onChange={(e) => setPolicyData({ ...policyData, to_emails: e.target.value })}
                placeholder="client@example.com, legal@example.com"
                className="bg-slate-800 border-slate-700 text-white mt-2"
              />
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700">
              Create Policy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}