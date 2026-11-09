import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import MFAVerification from './MFAVerification';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Loader2 } from 'lucide-react';
import { DeviceFingerprint } from '../utils/DeviceFingerprint';

export default function MFAGate({ 
  children, 
  requireMFA = true, 
  action = 'access this page',
  sessionDuration = 30 * 60 * 1000 // 30 minutes default
}) {
  const [showMFADialog, setShowMFADialog] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [lastVerification, setLastVerification] = useState(null);
  const [checkingTrustedDevice, setCheckingTrustedDevice] = useState(true);

  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: recentMFASession } = useQuery({
    queryKey: ['mfa-session', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      
      const sessions = await base44.entities.MFASession.filter({
        user_email: user.email,
        verified: true
      }, '-verified_at', 1);
      
      return sessions[0] || null;
    },
    enabled: !!user?.email,
    refetchInterval: 60000
  });

  // Check if current device is trusted
  useEffect(() => {
    const checkTrustedDevice = async () => {
      if (!user?.email || !user?.mfa_enabled) {
        setCheckingTrustedDevice(false);
        return;
      }

      try {
        const { fingerprint } = await DeviceFingerprint.generate();
        
        const trustedDevices = await base44.entities.TrustedDevice.filter({
          user_email: user.email,
          device_fingerprint: fingerprint,
          revoked: false
        }, '-trusted_at', 1);

        if (trustedDevices && trustedDevices.length > 0) {
          const device = trustedDevices[0];
          const expiresAt = new Date(device.expires_at);
          
          if (expiresAt > new Date()) {
            // Device is trusted and hasn't expired
            setIsVerified(true);
            
            // Update last used timestamp
            await base44.entities.TrustedDevice.update(device.id, {
              last_used: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        console.error('Trusted device check error:', error);
      } finally {
        setCheckingTrustedDevice(false);
      }
    };

    if (user && requireMFA) {
      checkTrustedDevice();
    } else {
      setCheckingTrustedDevice(false);
    }
  }, [user, requireMFA]);

  useEffect(() => {
    if (!user || !requireMFA || checkingTrustedDevice) {
      return;
    }

    // If already verified by trusted device, don't continue
    if (isVerified) {
      return;
    }

    // Check if user has MFA enabled
    if (!user.mfa_enabled) {
      setIsVerified(true);
      return;
    }

    // Check if there's a recent valid MFA session
    if (recentMFASession) {
      const expiresAt = new Date(recentMFASession.expires_at);
      if (expiresAt > new Date()) {
        setIsVerified(true);
        setLastVerification(new Date(recentMFASession.verified_at));
        return;
      }
    }

    // Check if user verified recently (within session duration)
    if (user.mfa_verified_at) {
      const verifiedAt = new Date(user.mfa_verified_at);
      const now = new Date();
      if (now - verifiedAt < sessionDuration) {
        setIsVerified(true);
        setLastVerification(verifiedAt);
        return;
      }
    }

    // Require MFA verification
    setIsVerified(false);
    setShowMFADialog(true);
  }, [user, recentMFASession, requireMFA, sessionDuration, checkingTrustedDevice, isVerified]);

  // For admin users, always require MFA
  useEffect(() => {
    if (user?.role === 'admin' && user?.mfa_enabled && requireMFA && !checkingTrustedDevice) {
      if (lastVerification) {
        const timeSinceVerification = new Date() - lastVerification;
        if (timeSinceVerification > sessionDuration) {
          setIsVerified(false);
          setShowMFADialog(true);
        }
      }
    }
  }, [user, lastVerification, requireMFA, sessionDuration, checkingTrustedDevice]);

  const handleVerified = (sessionToken) => {
    setIsVerified(true);
    setLastVerification(new Date());
    setShowMFADialog(false);
  };

  if (isLoading || checkingTrustedDevice) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // If user doesn't have MFA enabled or it's not required, show content
  if (!requireMFA || !user?.mfa_enabled) {
    return <>{children}</>;
  }

  // If verified, show content
  if (isVerified) {
    return <>{children}</>;
  }

  // Show MFA verification dialog
  return (
    <>
      <div className="p-6 flex items-center justify-center min-h-[600px]">
        <Card className="max-w-md w-full bg-slate-900/50 border-slate-800">
          <CardContent className="p-12 text-center">
            <div className="mx-auto w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mb-6">
              <Shield className="w-10 h-10 text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Verification Required
            </h2>
            <p className="text-slate-400 mb-4">
              Multi-factor authentication is required to {action}
            </p>
            <p className="text-sm text-slate-500">
              Please complete MFA verification to continue
            </p>
          </CardContent>
        </Card>
      </div>

      <MFAVerification
        open={showMFADialog}
        onClose={() => setShowMFADialog(false)}
        onVerified={handleVerified}
        user={user}
        action={action}
        allowRememberDevice={true}
      />
    </>
  );
}