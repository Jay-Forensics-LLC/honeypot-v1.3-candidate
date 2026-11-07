import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Shield, Loader2, Key } from 'lucide-react';
import { toast } from 'sonner';
import { DeviceFingerprint } from '../utils/DeviceFingerprint';

/**
 * PRODUCTION: Unified MFA Gate Component
 * Consolidates MFAGate, MFAVerification, and MFAEnforcement
 * Handles trusted devices, session management, and verification flow
 */
export default function UnifiedMFAGate({ 
  children,
  requireMFA = true,
  action = 'access this feature',
  sessionDuration = 30 * 60 * 1000
}) {
  const [showMFADialog, setShowMFADialog] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [checkingTrustedDevice, setCheckingTrustedDevice] = useState(true);

  const { data: user, isLoading } = useUser();

  // Check trusted device on mount
  useEffect(() => {
    const checkTrustedDevice = async () => {
      if (!user?.email || !user?.mfa_enabled || !requireMFA) {
        setCheckingTrustedDevice(false);
        setIsVerified(!requireMFA || !user?.mfa_enabled);
        return;
      }

      try {
        const { fingerprint } = await DeviceFingerprint.generate();
        const trustedDevices = await base44.entities.TrustedDevice.filter({
          user_email: user.email,
          device_fingerprint: fingerprint,
          revoked: false
        }, '-trusted_at', 1);

        if (trustedDevices?.length > 0) {
          const device = trustedDevices[0];
          const expiresAt = new Date(device.expires_at);
          
          if (expiresAt > new Date()) {
            setIsVerified(true);
            await base44.entities.TrustedDevice.update(device.id, {
              last_used: new Date().toISOString()
            });
          } else {
            setShowMFADialog(true);
          }
        } else {
          setShowMFADialog(true);
        }
      } catch (error) {
        console.error('Trusted device check failed:', error);
        setShowMFADialog(true);
      } finally {
        setCheckingTrustedDevice(false);
      }
    };

    checkTrustedDevice();
  }, [user, requireMFA]);

  const handleVerify = async () => {
    if (!verificationCode || verificationCode.length < 6) {
      toast.error('Please enter a valid code');
      return;
    }

    setIsVerifying(true);

    try {
      const response = await base44.functions.invoke('verifyMFA', {
        user_email: user.email,
        code: verificationCode,
        secret: user.mfa_secret,
        method: isBackupCode ? 'backup_code' : user.mfa_method,
        backup_codes: user.mfa_backup_codes
      });

      if (!response.data.valid) {
        throw new Error('Invalid verification code');
      }

      // Create MFA session
      const expiresAt = new Date(Date.now() + sessionDuration);
      await base44.entities.MFASession.create({
        user_email: user.email,
        session_token: `MFA-${Date.now()}`,
        verified: true,
        method_used: isBackupCode ? 'backup_code' : user.mfa_method,
        expires_at: expiresAt.toISOString(),
        verified_at: new Date().toISOString()
      });

      await base44.auth.updateMe({
        mfa_verified_at: new Date().toISOString()
      });

      // Remember device if requested
      if (rememberDevice) {
        const { fingerprint } = await DeviceFingerprint.generate();
        const trustExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await base44.entities.TrustedDevice.create({
          user_email: user.email,
          device_fingerprint: fingerprint,
          device_name: DeviceFingerprint.getDeviceName(),
          trusted_at: new Date().toISOString(),
          expires_at: trustExpiresAt.toISOString(),
          last_used: new Date().toISOString(),
          revoked: false
        });
      }

      setIsVerified(true);
      setShowMFADialog(false);
      setVerificationCode('');
      toast.success('Verification successful');
    } catch (error) {
      toast.error(error.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  if (isLoading || checkingTrustedDevice) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!requireMFA || !user?.mfa_enabled || isVerified) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="p-6 flex items-center justify-center min-h-[600px]">
        <Card className="max-w-md w-full bg-slate-900/50 border-slate-800">
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 text-blue-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Verification Required</h2>
            <p className="text-slate-400">MFA required to {action}</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showMFADialog} onOpenChange={setShowMFADialog}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              Enter Verification Code
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-white mb-2">
                {isBackupCode ? 'Backup Code' : 'Verification Code'}
              </Label>
              <Input
                type="text"
                inputMode={isBackupCode ? 'text' : 'numeric'}
                maxLength={isBackupCode ? 8 : 6}
                placeholder={isBackupCode ? 'XXXXXXXX' : '000000'}
                value={verificationCode}
                onChange={(e) => setVerificationCode(
                  isBackupCode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '')
                )}
                className="bg-slate-800 border-slate-700 text-white text-center text-xl tracking-widest"
                onKeyPress={(e) => e.key === 'Enter' && handleVerify()}
                autoFocus
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                checked={rememberDevice}
                onCheckedChange={(checked) => setRememberDevice(checked)}
              />
              <Label htmlFor="remember" className="text-sm text-slate-300 cursor-pointer">
                Remember this device for 30 days
              </Label>
            </div>

            <Button
              variant="link"
              onClick={() => {
                setIsBackupCode(!isBackupCode);
                setVerificationCode('');
              }}
              className="text-blue-400 text-sm p-0 h-auto"
            >
              <Key className="w-3 h-3 mr-1" />
              {isBackupCode ? 'Use authentication code' : 'Use backup code instead'}
            </Button>
          </div>
          <DialogFooter>
            <Button
              onClick={handleVerify}
              disabled={verificationCode.length < 6 || isVerifying}
              className="bg-blue-600 hover:bg-blue-700 w-full"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}