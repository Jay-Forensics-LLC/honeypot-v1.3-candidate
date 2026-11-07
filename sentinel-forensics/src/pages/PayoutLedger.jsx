import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DollarSign,
  Download,
  Calendar,
  Loader2,
  CheckCircle,
  AlertCircle,
  Shield,
  PlayCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function PayoutLedger() {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: ledgerEntries = [], isLoading } = useQuery({
    queryKey: ['payout-ledger'],
    queryFn: async () => {
      return await base44.entities.PayoutLedger.list('-created_date', 100);
    },
    enabled: user?.role === 'admin'
  });

  const computePayoutsMutation = useMutation({
    mutationFn: async ({ execute }) => {
      const result = await base44.functions.invoke('computeMonthlyReferralPayouts', {
        period_start: periodStart,
        period_end: periodEnd,
        execute_payouts: execute
      });
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payout-ledger'] });
      toast.success('Payout Ledger Generated', {
        description: `${data.ledger_entries} entries totaling $${data.total_amount.toFixed(2)}`
      });
    },
    onError: (error) => {
      toast.error('Failed to compute payouts', {
        description: error.message
      });
    }
  });

  const exportCSV = () => {
    if (ledgerEntries.length === 0) {
      toast.info('No ledger entries to export');
      return;
    }

    const headers = 'Referrer,Period Start,Period End,Referrals,Commission,Status,Paid At\n';
    const rows = ledgerEntries.map(entry => 
      `${entry.referrer_email},${entry.period_start},${entry.period_end},${entry.total_referrals},${entry.total_commission},${entry.status},${entry.paid_at || 'N/A'}`
    ).join('\n');

    const csv = headers + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payout-ledger-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('CSV exported successfully');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <div className="text-center text-slate-400">Loading...</div>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <Alert className="max-w-2xl mx-auto bg-red-900/20 border-red-500/50">
          <Shield className="h-5 w-5 text-red-400" />
          <AlertDescription className="text-red-200">
            <strong>Admin Access Required</strong> - This page is only accessible to administrators.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const totalPending = ledgerEntries
    .filter(e => e.status === 'pending')
    .reduce((sum, e) => sum + (e.total_commission || 0), 0);

  const totalPaid = ledgerEntries
    .filter(e => e.status === 'paid')
    .reduce((sum, e) => sum + (e.total_commission || 0), 0);

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6 pb-24 md:pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Payout Ledger</h1>
            <p className="text-slate-400">Manage referral commission payouts</p>
          </div>
          <Button
            onClick={exportCSV}
            variant="outline"
            className="border-slate-700"
            disabled={ledgerEntries.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Generate Payout Ledger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-400">Period Start</Label>
                  <Input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-400">Period End</Label>
                  <Input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => computePayoutsMutation.mutate({ execute: false })}
                  disabled={!periodStart || !periodEnd || computePayoutsMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {computePayoutsMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Computing...
                    </>
                  ) : (
                    <>
                      <Calendar className="w-4 h-4 mr-2" />
                      Generate Ledger (Dry Run)
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => {
                    if (confirm('Execute payouts? This will transfer funds to Connect accounts.')) {
                      computePayoutsMutation.mutate({ execute: true });
                    }
                  }}
                  disabled={!periodStart || !periodEnd || computePayoutsMutation.isPending}
                  variant="outline"
                  className="w-full border-green-500/50 text-green-400 hover:bg-green-900/20"
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Execute Payouts
                </Button>
              </div>

              <Alert className="bg-orange-900/20 border-orange-500/50">
                <AlertCircle className="h-4 w-4 text-orange-400" />
                <AlertDescription className="text-orange-200 text-sm">
                  Always generate a dry run first to review amounts before executing payouts.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                <span className="text-slate-400">Total Pending</span>
                <span className="text-2xl font-bold text-orange-400">${totalPending.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                <span className="text-slate-400">Total Paid</span>
                <span className="text-2xl font-bold text-green-400">${totalPaid.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                <span className="text-slate-400">Total Entries</span>
                <span className="text-2xl font-bold text-white">{ledgerEntries.length}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Ledger Entries</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
              </div>
            ) : ledgerEntries.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                No payout ledger entries yet. Generate your first ledger above.
              </div>
            ) : (
              <div className="space-y-3">
                {ledgerEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-white font-semibold">{entry.referrer_email}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {entry.period_start} → {entry.period_end}
                        </p>
                      </div>
                      <Badge className={
                        entry.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                        entry.status === 'processing' ? 'bg-blue-500/20 text-blue-400' :
                        entry.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        'bg-orange-500/20 text-orange-400'
                      }>
                        {entry.status.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500">Referrals</p>
                        <p className="text-white font-semibold">{entry.total_referrals}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Commission</p>
                        <p className="text-white font-semibold">${entry.total_commission.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Paid At</p>
                        <p className="text-white font-semibold">
                          {entry.paid_at ? format(new Date(entry.paid_at), 'MMM d, yyyy') : '—'}
                        </p>
                      </div>
                    </div>

                    {entry.referrals_included && entry.referrals_included.length > 0 && (
                      <details className="mt-3 pt-3 border-t border-slate-700">
                        <summary className="text-xs text-slate-400 cursor-pointer hover:text-white">
                          View Breakdown ({entry.referrals_included.length} referrals)
                        </summary>
                        <div className="mt-2 space-y-1 text-xs">
                          {entry.referrals_included.map((ref, idx) => (
                            <div key={idx} className="flex justify-between text-slate-400">
                              <span>{ref.referee_email}</span>
                              <span>${ref.commission_amount.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}