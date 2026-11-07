import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, ArrowRight, Sparkles } from 'lucide-react';
import { createPageUrl } from '../components/utils';
import { toast } from 'sonner';

export default function SubscriptionSuccess() {
  const [verifying, setVerifying] = useState(true);
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  useEffect(() => {
    if (sessionId && user) {
      const verify = async () => {
        try {
          // Wait a moment for webhook to process
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Refresh user data
          await queryClient.invalidateQueries({ queryKey: ['user'] });
          await queryClient.refetchQueries({ queryKey: ['user'] });
          
          toast.success('Subscription activated successfully!');
          setVerifying(false);
          
          // Redirect after 3 seconds
          setTimeout(() => {
            window.location.href = createPageUrl('Dashboard');
          }, 3000);
        } catch (err) {
          console.error('Payment verification error:', err);
          toast.error('Verification issue - please contact support');
          setVerifying(false);
        }
      };
      
      verify();
    }
  }, [sessionId, user]);

  if (verifying) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
        <Card className="bg-slate-900/50 border-slate-800 max-w-md w-full">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-16 h-16 mx-auto mb-4 text-blue-400 animate-spin" />
            <h2 className="text-2xl font-bold text-white mb-2">
              Activating Subscription...
            </h2>
            <p className="text-slate-400">
              Please wait while we confirm your subscription
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
      <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 border-green-500/50 max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            Welcome to Sentinel Pro!
          </h2>
          <p className="text-green-200 mb-4">
            Your subscription is now active
          </p>
          <div className="flex items-center justify-center gap-2 text-green-300 mb-6">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm">All features unlocked</span>
          </div>
          <Button
            onClick={() => window.location.href = createPageUrl('Dashboard')}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}