import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Gift,
  Copy,
  CheckCircle,
  DollarSign,
  Users,
  TrendingUp,
  Loader2,
  Share2,
  ExternalLink,
  MousePointerClick,
  Wallet
} from 'lucide-react';
import { toast } from 'sonner';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import { generateReferralCode } from '../functions/generateReferralCode';
import { formatRelativeTime } from '../components/utils/formatters';

export default function Referrals() {
  const [copiedLink, setCopiedLink] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: referralCode, isLoading: codeLoading } = useQuery({
    queryKey: ['my-referral-code'],
    queryFn: async () => {
      try {
        const codes = await resilientAPI.filterEntity(
          'ReferralCode',
          { user_email: user?.email },
          '-created_at',
          1
        );
        return codes[0] || null;
      } catch (error) {
        console.warn('Referral code load failed:', error);
        return null;
      }
    },
    enabled: !!user,
    initialData: null,
    staleTime: 5 * 60 * 1000 // PHASE 6: Cache for 5min
  });

  // PHASE 4: Get click stats (PHASE 6: limit to recent 1000 clicks)
  const { data: clickStats } = useQuery({
    queryKey: ['referral-clicks', referralCode?.code],
    queryFn: async () => {
      if (!referralCode) return { total_clicks: 0, conversions: 0 };
      
      const clicks = await base44.entities.ReferralClick.filter({
        referral_code: referralCode.code
      }, '-timestamp', 1000);
      
      return {
        total_clicks: clicks.length,
        conversions: clicks.filter(c => c.converted).length
      };
    },
    enabled: !!referralCode,
    staleTime: 5 * 60 * 1000 // PHASE 6: Cache for 5min
  });

  // PHASE 6: Limit to 50 most recent referrals
  const { data: referrals = [] } = useQuery({
    queryKey: ['my-referrals'],
    queryFn: async () => {
      try {
        return await resilientAPI.filterEntity(
          'Referral',
          { referrer_email: user?.email },
          '-signup_date',
          50
        );
      } catch (error) {
        return [];
      }
    },
    enabled: !!user && !!referralCode,
    initialData: [],
    staleTime: 60000 // PHASE 6: Cache for 60s
  });

  const generateCodeMutation = useMutation({
    mutationFn: async () => {
      setIsGenerating(true);
      const { data } = await generateReferralCode();
      return data;
    },
    onSuccess: (data) => {
      setIsGenerating(false);
      queryClient.invalidateQueries({ queryKey: ['my-referral-code'] });
      toast.success('Referral code generated!', {
        description: 'Share your link to start earning commissions'
      });
    },
    onError: (error) => {
      setIsGenerating(false);
      toast.error('Failed to generate code: ' + error.message);
    }
  });

  const copyReferralLink = () => {
    if (!referralCode) {
      toast.error('No referral code found');
      return;
    }

    const referralLink = `https://sentinel-forensics.app/signup?ref=${referralCode.code}`;
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    toast.success('Referral link copied!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const shareReferralLink = () => {
    if (!referralCode) {
      toast.error('No referral code found');
      return;
    }

    const referralLink = `https://sentinel-forensics.app/signup?ref=${referralCode.code}`;
    const text = `Check out Sentinel Forensics - Advanced threat detection for iOS/Android. Get 10% off with my referral link: ${referralLink}`;

    if (navigator.share) {
      navigator.share({
        title: 'Sentinel Forensics Referral',
        text: text,
        url: referralLink
      }).catch(() => {
        copyReferralLink();
      });
    } else {
      copyReferralLink();
    }
  };

  const activeReferrals = referrals.filter(r => r.status === 'active').length;
  const totalEarned = referralCode?.total_earned || 0;
  const pendingPayout = referralCode?.pending_payout || 0;
  
  // PHASE 4: Calculate conversion rate from click data
  const totalClicks = clickStats?.total_clicks || 0;
  const conversions = clickStats?.conversions || 0;
  const conversionRate = totalClicks > 0 ? (conversions / totalClicks) : 0;

  // PHASE 8: Payout status with live verification
  const { data: connectStatus } = useQuery({
    queryKey: ['connect-status'],
    queryFn: async () => {
      try {
        const result = await base44.functions.invoke('getConnectStatus', {});
        return result.data;
      } catch (error) {
        console.error('Failed to fetch connect status:', error);
        return { connected: false };
      }
    },
    enabled: !!user,
    staleTime: 60000 // Cache for 1min
  });

  const payoutSetupComplete = connectStatus?.connected && connectStatus?.payouts_enabled;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Referral Program</h1>
        <p className="text-slate-400">Earn 10% recurring commission on every referral</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <DollarSign className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-3xl font-bold text-white">${totalEarned.toFixed(2)}</p>
                <p className="text-xs text-slate-400">Total Earned</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">${pendingPayout.toFixed(2)}</p>
                <p className="text-xs text-slate-400">Pending Payout</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Users className="w-10 h-10 text-purple-400" />
              <div>
                <p className="text-3xl font-bold text-white">{activeReferrals}</p>
                <p className="text-xs text-slate-400">Active Subscribers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <MousePointerClick className="w-10 h-10 text-orange-400" />
              <div>
                <p className="text-3xl font-bold text-white">{totalClicks}</p>
                <p className="text-xs text-slate-400">Total Clicks</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {referralCode && !payoutSetupComplete && (
        <Card className="bg-orange-900/20 border-orange-500/50">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Wallet className="w-8 h-8 text-orange-400 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">Setup Payout Account</h3>
                <p className="text-sm text-slate-300 mb-4">
                  Connect your Stripe account to receive monthly commission payouts automatically.
                </p>
                <Button
                  onClick={async () => {
                    try {
                      const result = await base44.functions.invoke('connectStripeForPayouts', {
                        return_url: window.location.href
                      });
                      if (result.data?.url) {
                        window.location.href = result.data.url;
                      }
                    } catch (err) {
                      toast.error('Failed to setup payout account');
                    }
                  }}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Wallet className="w-4 h-4 mr-2" />
                  Connect Stripe for Payouts
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {payoutSetupComplete && (
        <Card className="bg-green-900/20 border-green-500/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-400" />
                <div>
                  <p className="text-sm font-semibold text-white">Payout Account Connected</p>
                  <p className="text-xs text-slate-400">
                    {connectStatus?.country} • {connectStatus?.default_currency?.toUpperCase()} • Monthly payouts
                  </p>
                </div>
              </div>
              <Button
                onClick={async () => {
                  try {
                    const result = await base44.functions.invoke('connectStripeForPayouts', {
                      return_url: window.location.href
                    });
                    if (result.data?.url) {
                      window.location.href = result.data.url;
                    }
                  } catch (err) {
                    toast.error('Failed to access payout dashboard');
                  }
                }}
                variant="outline"
                size="sm"
                className="border-green-500/50"
              >
                Manage
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-blue-500/50">
        <CardHeader>
          <CardTitle className="text-white">Your Referral Link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {codeLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-400" />
              <p className="text-slate-400">Loading referral code...</p>
            </div>
          ) : !referralCode ? (
            <div className="text-center py-8">
              <Gift className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 mb-4">Generate your referral code to start earning</p>
              <Button
                onClick={() => generateCodeMutation.mutate()}
                disabled={isGenerating}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 min-h-[44px]"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Gift className="w-4 h-4 mr-2" />
                    Generate Referral Code
                  </>
                )}
              </Button>
            </div>
          ) : (
            <>
              <div className="bg-slate-800/50 p-4 rounded-lg">
                <p className="text-xs text-slate-400 mb-2">Your Referral Code:</p>
                <div className="flex items-center gap-3">
                  <code className="flex-1 text-2xl font-bold text-white bg-slate-900 px-4 py-3 rounded">
                    {referralCode.code}
                  </code>
                  <Button
                    onClick={copyReferralLink}
                    className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
                  >
                    {copiedLink ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Link
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={shareReferralLink}
                  variant="outline"
                  className="w-full border-slate-700"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share Link
                </Button>
              </div>

              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 space-y-2">
                <p className="text-sm text-blue-200">
                  <strong>How it works:</strong> Share your link. When someone signs up and subscribes, 
                  you earn 10% recurring commission for as long as they stay subscribed. 
                  Payouts happen monthly via Stripe Connect.
                </p>
                {totalClicks > 0 && (
                  <div className="text-xs text-blue-300 pt-2 border-t border-blue-500/30">
                    <strong>Performance:</strong> {totalClicks} clicks → {conversions} signups = {(conversionRate * 100).toFixed(1)}% conversion rate
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {referralCode && referrals.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Your Referrals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {referrals.map((referral, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-semibold">{referral.referee_email}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Signed up {formatRelativeTime(referral.signup_date)}
                      </p>
                      {referral.referee_tier && (
                        <Badge className="mt-2 bg-purple-500/20 text-purple-400 text-xs">
                          {referral.referee_tier} Plan
                        </Badge>
                      )}
                    </div>
                    <Badge className={
                      referral.status === 'active' ? 'bg-green-500/20 text-green-400' :
                      referral.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-gray-500/20 text-gray-400'
                    }>
                      {referral.status.toUpperCase()}
                    </Badge>
                  </div>
                  {referral.total_commission_paid > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-700">
                      <p className="text-sm text-slate-400">
                        Total commission earned: <span className="text-green-400 font-semibold">${referral.total_commission_paid.toFixed(2)}</span>
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}