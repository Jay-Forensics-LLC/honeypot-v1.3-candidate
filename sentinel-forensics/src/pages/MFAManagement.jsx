
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  CheckCircle,
  XCircle,
  RefreshCw,
  Key,
  Smartphone,
  Mail,
  AlertTriangle,
  Download,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';

export default function MFAManagement() {
  const queryClient = useQueryClient();
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  const { data: user, refetch: refetchUser } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  // Disable MFA
  const disableMFAMutation = useMutation({
    mutationFn: async () => {
      await base44.auth.updateMe({
        mfa_enabled: false,
        mfa_method: 'none',
        mfa_secret: null,
        mfa_backup_codes: [],
        mfa_verified_at: null
      });

      await base44.entities.AuditLog.create({
        event_type: 'mfa_disabled',
        severity: 'warning',
        description: 'MFA was disabled',
        user_id: user?.email,
        timestamp: new Date().toISOString(),
        success: true
      });
    },
    onSuccess: () => {
      refetchUser();
      queryClient.invalidateQueries({ queryKey: ['user'] });
      toast.success('MFA has been disabled');
    },
    onError: (error) => {
      console.error('Disable MFA error:', error);
      toast.error('Failed to disable MFA');
    }
  });

  // Generate new backup codes
  const generateNewBackupCodes = useMutation({
    mutationFn: async () => {
      const codes = [];
      for (let i = 0; i < 10; i++) {
        const code = Math.floor(10000000 + Math.random() * 90000000).toString();
        codes.push(code);
      }

      // Hash the codes
      const hashedCodes = await Promise.all(
        codes.map(async (code) => {
          const encoder = new TextEncoder();
          const data = encoder.encode(code);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        })
      );

      await base44.auth.updateMe({
        mfa_backup_codes: hashedCodes
      });

      await base44.entities.AuditLog.create({
        event_type: 'mfa_backup_codes_regenerated',
        severity: 'info',
        description: 'New backup codes generated',
        user_id: user?.email,
        timestamp: new Date().toISOString(),
        success: true
      });

      return codes;
    },
    onSuccess: (codes) => {
      refetchUser();
      // Download the codes immediately
      const codesText = codes.join('\n');
      const blob = new Blob([`Sentinel Forensics MFA Backup Codes\nGenerated: ${new Date().toLocaleString()}\n\n${codesText}\n\nKeep these codes safe. Each code can only be used once.`], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sentinel-backup-codes-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('New backup codes generated and downloaded');
    },
    onError: (error) => {
      console.error('Generate codes error:', error);
      toast.error('Failed to generate new backup codes');
    }
  });

  const getMethodIcon = () => {
    switch (user?.mfa_method) {
      case 'totp':
        return Smartphone;
      case 'email':
        return Mail;
      case 'sms':
        return Smartphone;
      default:
        return Shield;
    }
  };

  const getMethodLabel = () => {
    switch (user?.mfa_method) {
      case 'totp':
        return 'Authenticator App';
      case 'email':
        return 'Email';
      case 'sms':
        return 'SMS';
      default:
        return 'None';
    }
  };

  const MethodIcon = getMethodIcon();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Multi-Factor Authentication</h1>
        <p className="text-slate-400">Manage your account security settings</p>
      </div>

      {/* MFA Status Card */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5" />
              MFA Status
            </span>
            {user?.mfa_enabled ? (
              <Badge className="bg-green-500/20 text-green-400 border-0">
                <CheckCircle className="w-4 h-4 mr-1" />
                Enabled
              </Badge>
            ) : (
              <Badge className="bg-red-500/20 text-red-400 border-0">
                <XCircle className="w-4 h-4 mr-1" />
                Disabled
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {user?.mfa_enabled ? (
            <>
              <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg">
                <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <MethodIcon className="w-6 h-6 text-purple-400" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold">Current Method</p>
                  <p className="text-slate-400 text-sm">{getMethodLabel()}</p>
                </div>
              </div>

              {user?.mfa_verified_at && (
                <div className="text-sm text-slate-400">
                  <p>MFA enabled on: {new Date(user.mfa_verified_at).toLocaleDateString()}</p>
                </div>
              )}

              <Alert className="bg-blue-900/20 border-blue-500/30">
                <Shield className="h-4 w-4 text-blue-400" />
                <AlertDescription className="text-blue-200">
                  Your account is protected with multi-factor authentication. You'll be asked to verify your identity each time you log in.
                </AlertDescription>
              </Alert>

              <div className="flex gap-3">
                <Button
                  onClick={() => window.location.href = createPageUrl('mfa-setup')}
                  variant="outline"
                  className="flex-1 border-slate-700"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Change MFA Method
                </Button>
                <Button
                  onClick={() => disableMFAMutation.mutate()}
                  variant="outline"
                  className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                  disabled={disableMFAMutation.isPending}
                >
                  {disableMFAMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Disabling...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 mr-2" />
                      Disable MFA
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Alert className="bg-orange-500/10 border-orange-500/30">
                <AlertTriangle className="h-4 w-4 text-orange-400" />
                <AlertDescription className="text-orange-200">
                  <strong>Security Warning:</strong> Your account is not protected with MFA. Enable it now to secure your account.
                </AlertDescription>
              </Alert>

              <Button
                onClick={() => window.location.href = createPageUrl('mfa-setup')}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                <Shield className="w-4 h-4 mr-2" />
                Enable MFA
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Backup Codes Card */}
      {user?.mfa_enabled && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Key className="w-5 h-5" />
              Backup Codes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-slate-400 text-sm">
              Backup codes can be used to access your account if you lose access to your MFA method. Each code can only be used once.
            </p>

            <Alert className="bg-yellow-500/10 border-yellow-500/30">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <AlertDescription className="text-yellow-200">
                <strong>Important:</strong> Keep your backup codes in a secure location. If you generate new codes, the old ones will stop working.
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => generateNewBackupCodes.mutate()}
              variant="outline"
              className="w-full border-slate-700"
              disabled={generateNewBackupCodes.isPending}
            >
              {generateNewBackupCodes.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Generate New Backup Codes
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
