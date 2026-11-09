import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function PaymentCancelled() {
  const navigate = useNavigate();

  useEffect(() => {
    // Log cancellation event
    base44.auth.me().then(user => {
      if (user) {
        base44.entities.AnalyticsEvent.create({
          organization_id: user.organization_id,
          event_type: 'payment_cancelled',
          user_email: user.email,
          timestamp: new Date().toISOString(),
          metadata: {}
        }).catch(err => console.error('Failed to log event:', err));
      }
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-slate-900/50 border-slate-800">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mb-4">
            <XCircle className="w-10 h-10 text-orange-400" />
          </div>
          <CardTitle className="text-2xl text-white">Payment Cancelled</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          <p className="text-slate-300">
            Your payment was cancelled. No charges were made to your account.
          </p>

          <p className="text-sm text-slate-400">
            If you experienced any issues during checkout, please contact our support team or try again.
          </p>

          <div className="flex flex-col gap-3">
            <Button
              onClick={() => navigate('/Pricing')}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              Try Again
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              className="w-full border-slate-700 hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}