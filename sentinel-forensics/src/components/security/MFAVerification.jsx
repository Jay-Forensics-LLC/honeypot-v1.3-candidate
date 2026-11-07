import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Shield, Key, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DeviceFingerprint } from '../utils/DeviceFingerprint';

export default function MFAVerification({ 
  open, 
  onClose, 
  onVerified, 
  user,
  action = 'access this feature',
  allowRememberDevice = true
}) {
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);

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
      const sessionToken = `MFA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      await base44.entities.MFASession.create({
        user_email: user.email,
        session_token: sessionToken,
        verified: true,
        method_used: isBackupCode ? 'backup_code' : user.mfa_method,
        ip_address: 'browser',
        user_agent: navigator.userAgent,
        expires_at: expiresAt.toISOString(),
        verified_at: new Date().toISOString()
      });

      // Update user's last verification time
      await base44.auth.updateMe({
        mfa_verified_at: new Date().toISOString()
      });

      // If remember device is checked, create trusted device record
      if (rememberDevice && allowRememberDevice) {
        const { fingerprint, components } = await DeviceFingerprint.generate();
        const deviceName = DeviceFingerprint.getDeviceName();
        const trustExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await base44.entities.TrustedDevice.create({
          user_email: user.email,
          device_fingerprint: fingerprint,
          device_name: deviceName,
          device_info: {
            user_agent: components.userAgent,
            platform: components.platform,
            browser: navigator.userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)/)?.[1] || 'Unknown',
            screen_resolution: components.screenResolution
          },
          ip_address: 'browser',
          trusted_at: new Date().toISOString(),
          expires_at: trustExpiresAt.toISOString(),
          last_used: new Date().toISOString(),
          revoked: false
        });

        toast.success('Device trusted for 30 days');
      }

      // Log verification
      await base44.entities.AuditLog.create({
        event_type: 'mfa_verified',
        severity: 'info',
        description: `MFA verification successful for ${action}`,
        user_id: user.email,
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          method: isBackupCode ? 'backup_code' : user.mfa_method,
          action,
          device_remembered: rememberDevice
        }
      });

      // If backup code was used, remove it from user's backup codes
      if (isBackupCode && response.data.remaining_codes) {
        await base44.auth.updateMe({
          mfa_backup_codes: response.data.remaining_codes
        });
        
        if (response.data.remaining_codes.length < 3) {
          toast.warning(`Only ${response.data.remaining_codes.length} backup codes remaining`, {
            description: 'Consider generating new backup codes'
          });
        }
      }

      toast.success('Verification successful');
      onVerified?.(sessionToken);
      onClose();
      setVerificationCode('');
    } catch (error) {
      console.error('MFA verification error:', error);
      toast.error(error.message || 'Invalid code, please try again');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Multi-Factor Authentication Required
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Alert className="bg-blue-500/10 border-blue-500/50">
            <Shield className="w-4 h-4 text-blue-400" />
            <AlertDescription className="text-blue-200">
              <p className="text-sm">Enter your authentication code to {action}</p>
            </AlertDescription>
          </Alert>

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
            <p className="text-xs text-slate-500 mt-2">
              {isBackupCode 
                ? 'Enter one of your backup codes' 
                : user.mfa_method === 'totp'
                  ? 'Enter the 6-digit code from your authenticator app'
                  : user.mfa_method === 'email'
                    ? 'Enter the code sent to your email'
                    : 'Enter the code sent via SMS'}
            </p>
          </div>

          {allowRememberDevice && (
            <div className="flex items-center space-x-2 p-3 bg-slate-800/50 rounded-lg">
              <Checkbox
                id="remember"
                checked={rememberDevice}
                onCheckedChange={(checked) => setRememberDevice(checked)}
                className="border-slate-600"
              />
              <Label
                htmlFor="remember"
                className="text-sm font-normal text-slate-300 cursor-pointer"
              >
                Remember this device for 30 days
              </Label>
            </div>
          )}

          <Button
            variant="link"
            onClick={() => {
              setIsBackupCode(!isBackupCode);
              setVerificationCode('');
            }}
            className="text-blue-400 hover:text-blue-300 text-sm p-0 h-auto"
          >
            <Key className="w-3 h-3 mr-1" />
            {isBackupCode ? 'Use authentication code' : 'Use backup code instead'}
          </Button>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              setVerificationCode('');
            }}
            className="border-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleVerify}
            disabled={verificationCode.length < 6 || isVerifying}
            className="bg-blue-600 hover:bg-blue-700"
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
  );
}