import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/components/utils';
import canvasConfetti from 'canvas-confetti';
import SubscriptionStatusBadge from '../components/subscription/SubscriptionStatusBadge';

export default function PaymentSuccess() {
  const [confettiTriggered, setConfettiTriggered] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [pollingComplete, setPollingComplete] = useState(false);
  const [subscriptionConfirmed, setSubscriptionConfirmed] = useState(false);

  // Poll user profile with exponential backoff
  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  // PHASE 8: Poll for subscription update (up to 15 seconds)
  useEffect(() => {
    if (!user || pollingComplete) return;

    // Check if subscription is properly set (not free and status is active/trialing)
    const hasActiveSubscription = 
      user.subscription_tier && 
      user.subscription_tier !== 'free' &&
      (user.subscription_status === 'active' || user.subscription_status === 'trialing');

    if (hasActiveSubscription) {
      setSubscriptionConfirmed(true);
      setPollingComplete(true);
      return;
    }

    // Poll with exponential backoff: 500ms, 1s, 2s, 4s, 8s (total ~15.5s)
    if (pollAttempts < 5) {
      const delay = 500 * Math.pow(2, pollAttempts);
      const timeoutId = setTimeout(() => {
        refetch();
        setPollAttempts(prev => prev + 1);
      }, delay);
      return () => clearTimeout(timeoutId);
    } else {
      // Max attempts reached
      setPollingComplete(true);
    }
  }, [user, pollAttempts, pollingComplete, refetch]);

  useEffect(() => {
    if (subscriptionConfirmed && !confettiTriggered) {
      const confetti = canvasConfetti.create(undefined, { resize: true });
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
      setConfettiTriggered(true);
    }
  }, [subscriptionConfirmed, confettiTriggered]);

  // Show loading while polling
  if (isLoading || (!pollingComplete && !subscriptionConfirmed)) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
        <Card className="bg-slate-900/50 border-slate-800 max-w-md w-full">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">
              {pollAttempts === 0 ? 'Processing payment...' : 'Finalizing subscription...'}
            </h2>
            <p className="text-slate-400 text-sm">
              Please wait while we confirm your subscription
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error if subscription not confirmed after polling
  if (pollingComplete && !subscriptionConfirmed) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
        <Card className="bg-slate-900/50 border-slate-800 max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Subscription Pending</h2>
            <p className="text-slate-400 text-sm mb-6">
              Your payment was received, but we're still processing your subscription. 
              This may take a few minutes.
            </p>
            <div className="space-y-3">
              <Button
                onClick={() => {
                  setPollAttempts(0);
                  setPollingComplete(false);
                  refetch();
                }}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Check Again
              </Button>
              <Link to={createPageUrl('Profile')}>
                <Button variant="outline" className="w-full border-slate-700">
                  View Profile
                </Button>
              </Link>
            </div>
            <p className="text-xs text-slate-500 mt-4">
              If this persists, contact support with ID: {new Date().getTime()}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
      <Card className="bg-slate-900/50 border-slate-800 max-w-md w-full">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <CardTitle className="text-2xl text-white mb-4">Payment Successful!</CardTitle>
          <div className="flex items-center justify-center gap-2">
            <span className="text-slate-400">Welcome to</span>
            <SubscriptionStatusBadge user={user} variant="detailed" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-slate-400 text-center">
            Your subscription has been activated successfully. You now have access to all premium features.
          </p>
          
          <div className="flex flex-col gap-2 pt-4">
            <Link to={createPageUrl('Dashboard')}>
              <Button className="w-full bg-green-600 hover:bg-green-700">
                Go to Dashboard
              </Button>
            </Link>
            <Link to={createPageUrl('Profile')}>
              <Button variant="outline" className="w-full border-slate-700">
                View Subscription Details
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}