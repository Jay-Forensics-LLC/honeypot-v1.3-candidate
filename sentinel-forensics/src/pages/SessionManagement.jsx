import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Monitor,
  Smartphone,
  Tablet,
  CheckCircle,
  Trash2,
  Shield,
  MapPin,
  Clock,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { DateUtils } from '../components/utils/DateUtils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function SessionManagement() {
  const [revokeTarget, setRevokeTarget] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: trustedDevices = [] } = useQuery({
    queryKey: ['trusted-devices'],
    queryFn: () => base44.entities.TrustedDevice.filter({ user_email: user?.email }),
    enabled: !!user,
    initialData: []
  });

  const { data: recentLogins = [] } = useQuery({
    queryKey: ['recent-logins'],
    queryFn: () => base44.entities.LoginAttempt.filter(
      { user_email: user?.email, success: true },
      '-timestamp',
      20
    ),
    enabled: !!user,
    initialData: []
  });

  const { data: webauthnCredentials = [] } = useQuery({
    queryKey: ['webauthn-credentials'],
    queryFn: async () => {
      const currentUser = await base44.auth.me();
      return currentUser?.webauthn_credentials || [];
    },
    enabled: !!user,
    initialData: []
  });

  const revokeDeviceMutation = useMutation({
    mutationFn: async (deviceId) => {
      await base44.entities.TrustedDevice.update(deviceId, {
        revoked: true
      });

      // Audit log
      await base44.entities.AuditLog.create({
        event_type: 'trusted_device_revoked',
        severity: 'warning',
        description: 'User revoked a trusted device',
        user_id: user?.email,
        timestamp: new Date().toISOString(),
        success: true,
        metadata: { device_id: deviceId }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trusted-devices'] });
      setRevokeTarget(null);
      toast.success('Device revoked successfully');
    },
    onError: (error) => {
      toast.error('Failed to revoke device');
      console.error(error);
    }
  });

  const getDeviceIcon = (userAgent) => {
    const ua = (userAgent || '').toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return Smartphone;
    }
    if (ua.includes('ipad') || ua.includes('tablet')) {
      return Tablet;
    }
    return Monitor;
  };

  const activeDevices = trustedDevices.filter(d => !d.revoked && new Date(d.expires_at) > new Date());

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Session & Device Management</h1>
        <p className="text-slate-400">Manage your active sessions and trusted devices</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Shield className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-3xl font-bold text-white">{activeDevices.length}</p>
                <p className="text-sm text-slate-400">Active Trusted Devices</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">{webauthnCredentials.length}</p>
                <p className="text-sm text-slate-400">Registered Passkeys</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Clock className="w-10 h-10 text-purple-400" />
              <div>
                <p className="text-3xl font-bold text-white">{recentLogins.length}</p>
                <p className="text-sm text-slate-400">Recent Logins (30 days)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trusted Devices */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Trusted Devices</CardTitle>
        </CardHeader>
        <CardContent>
          {activeDevices.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Monitor className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p>No trusted devices found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeDevices.map((device) => {
                const DeviceIcon = getDeviceIcon(device.device_info?.user_agent);
                return (
                  <div
                    key={device.id}
                    className="p-4 bg-slate-800/30 border border-slate-700 rounded-lg flex items-start justify-between"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                        <DeviceIcon className="w-6 h-6 text-blue-400" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-white mb-1">{device.device_name || 'Unknown Device'}</h4>
                        <div className="space-y-1 text-sm text-slate-400">
                          <p className="flex items-center gap-2">
                            <MapPin className="w-3 h-3" />
                            {device.ip_address || 'Unknown IP'}
                          </p>
                          <p className="flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            Trusted {DateUtils.safeRelativeTime(device.trusted_at, 'recently')}
                          </p>
                          <p className="flex items-center gap-2">
                            <CheckCircle className="w-3 h-3" />
                            Last used {DateUtils.safeRelativeTime(device.last_used, 'never')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRevokeTarget(device)}
                      className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Revoke
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Registered Passkeys */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Registered Passkeys (WebAuthn)</CardTitle>
        </CardHeader>
        <CardContent>
          {webauthnCredentials.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 mb-4">No passkeys registered</p>
              <Button className="bg-blue-600 hover:bg-blue-700">
                Register Your First Passkey
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {webauthnCredentials.map((cred, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-slate-800/30 border border-slate-700 rounded-lg flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                      <Shield className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">{cred.device_name}</h4>
                      <p className="text-sm text-slate-400">
                        Registered {DateUtils.safeRelativeTime(cred.registered_at, 'recently')}
                      </p>
                      <p className="text-xs text-slate-500 font-mono">
                        {cred.credential_id.substring(0, 32)}...
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-green-500/20 text-green-400">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Active
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Login Activity */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Recent Login Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLogins.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p>No recent login activity</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentLogins.map((login) => (
                <div
                  key={login.id}
                  className={`p-3 rounded-lg flex items-center justify-between ${
                    login.is_suspicious
                      ? 'bg-red-500/10 border border-red-500/30'
                      : 'bg-slate-800/30 border border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${login.is_suspicious ? 'bg-red-400' : 'bg-green-400'}`} />
                    <div>
                      <p className="text-sm text-white">
                        {DateUtils.safeFormatDateTime(login.timestamp, 'Unknown time')}
                      </p>
                      <p className="text-xs text-slate-400">
                        {login.ip_address} • {login.mfa_method_used || 'No MFA'}
                      </p>
                    </div>
                  </div>
                  {login.is_suspicious && (
                    <Badge className="bg-red-500/20 text-red-400">
                      Risk Score: {login.risk_score}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revoke Dialog */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Trusted Device?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will remove "{revokeTarget?.device_name}" from your trusted devices. You'll need to verify with MFA the next time you log in from this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeTarget && revokeDeviceMutation.mutate(revokeTarget.id)}
              className="bg-red-600 hover:bg-red-700"
              disabled={revokeDeviceMutation.isPending}
            >
              {revokeDeviceMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Revoking...
                </>
              ) : (
                'Revoke Device'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}