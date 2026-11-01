
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Mail,
  MessageSquare,
  Send,
  CheckCircle,
  XCircle,
  Loader2,
  Info,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { sendEmailNotification } from '../functions/sendEmailNotification';
import { sendSlackNotification } from '../functions/sendSlackNotification';

export default function NotificationSettings() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['notification-settings', user?.email],
    queryFn: async () => {
      const results = await base44.entities.NotificationSettings.filter({
        user_email: user.email
      });
      return results[0] || null;
    },
    enabled: !!user
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['notification-logs'],
    queryFn: () => base44.entities.NotificationLog.list('-sent_at', 50),
    enabled: user?.role === 'admin',
    staleTime: 30000
  });

  const [formData, setFormData] = useState({
    email_enabled: false,
    email_from_address: 'alerts@sentinel-forensics.com',
    email_to_address_default: '',
    slack_enabled: false,
    slack_webhook_url: '',
    slack_channel: '#security-alerts'
  });

  React.useEffect(() => {
    if (settings) {
      setFormData({
        email_enabled: settings.email_enabled || false,
        email_from_address: settings.email_from_address || 'alerts@sentinel-forensics.com',
        email_to_address_default: settings.email_to_address_default || user?.email || '',
        slack_enabled: settings.slack_enabled || false,
        slack_webhook_url: settings.slack_webhook_url || '',
        slack_channel: settings.slack_channel || '#security-alerts'
      });
    }
  }, [settings, user]); // Added user to dependencies as per outline

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (settings) {
        return await base44.entities.NotificationSettings.update(settings.id, {
          ...formData,
          smtp_configured: false // Changed as per outline
        });
      } else {
        return await base44.entities.NotificationSettings.create({
          user_email: user.email,
          ...formData,
          smtp_configured: false
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success('Settings saved');
    },
    onError: (error) => {
      toast.error('Failed to save settings', { description: error.message });
    }
  });

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await sendEmailNotification({
        recipient: formData.email_to_address_default || user.email,
        test_mode: true
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      
      if (settings) {
        base44.entities.NotificationSettings.update(settings.id, {
          test_last_run_at: new Date().toISOString(),
          test_email_last_success: data.success,
          test_last_error_message: data.error || null
        }).catch(console.error);
      }

      if (data.simulated) {
        toast.info('Email simulated (SMTP not configured)', {
          description: 'Configure SMTP environment variables for real email sending'
        });
      } else {
        toast.success('Test email sent successfully!');
      }
    },
    onError: (error) => {
      toast.error('Test email failed', { description: error.message });
    }
  });

  const testSlackMutation = useMutation({
    mutationFn: async () => {
      const response = await sendSlackNotification({
        webhook_url: formData.slack_webhook_url,
        channel: formData.slack_channel,
        test_mode: true
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      
      if (settings) {
        base44.entities.NotificationSettings.update(settings.id, {
          test_last_run_at: new Date().toISOString(),
          test_slack_last_success: data.success,
          test_last_error_message: data.error || null
        }).catch(console.error);
      }

      if (data.simulated) {
        toast.info('Slack message simulated', {
          description: 'Provide a valid webhook URL for real Slack integration'
        });
      } else {
        toast.success('Test Slack message sent!');
      }
    },
    onError: (error) => {
      toast.error('Test Slack failed', { description: error.message });
    }
  });

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Notification Settings</h1>
          <p className="text-slate-400">Configure email and Slack alert notifications</p>
        </div>

        <Alert className="bg-blue-900/20 border-blue-500/30">
          <Info className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-200 text-sm">
            <strong>SMTP Configuration:</strong> Set environment variables SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD for real email sending.
            Without configuration, emails will be simulated and logged only.
          </AlertDescription>
        </Alert>

        {/* Email Settings */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-400" />
              Email Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-white">Enable Email Alerts</p>
                <p className="text-xs text-slate-400">Send security alerts via email</p>
              </div>
              <Switch
                checked={formData.email_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, email_enabled: checked })}
              />
            </div>

            {formData.email_enabled && (
              <>
                <div>
                  <Label className="text-white">From Address</Label>
                  <Input
                    value={formData.email_from_address}
                    onChange={(e) => setFormData({ ...formData, email_from_address: e.target.value })}
                    placeholder="alerts@sentinel-forensics.com"
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>

                <div>
                  <Label className="text-white">Default Recipient</Label>
                  <Input
                    value={formData.email_to_address_default}
                    onChange={(e) => setFormData({ ...formData, email_to_address_default: e.target.value })}
                    placeholder={user?.email}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>

                <Button
                  onClick={() => testEmailMutation.mutate()}
                  disabled={testEmailMutation.isPending}
                  variant="outline"
                  className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                >
                  {testEmailMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Test Email
                    </>
                  )}
                </Button>

                {settings?.test_email_last_success !== undefined && (
                  <div className="flex items-center gap-2">
                    {settings.test_email_last_success ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-green-400">Last test successful</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-red-400" />
                        <span className="text-sm text-red-400">Last test failed</span>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Slack Settings */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-400" />
              Slack Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-white">Enable Slack Alerts</p>
                <p className="text-xs text-slate-400">Send security alerts to Slack channel</p>
              </div>
              <Switch
                checked={formData.slack_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, slack_enabled: checked })}
              />
            </div>

            {formData.slack_enabled && (
              <>
                <div>
                  <Label className="text-white">Webhook URL</Label>
                  <Input
                    value={formData.slack_webhook_url}
                    onChange={(e) => setFormData({ ...formData, slack_webhook_url: e.target.value })}
                    placeholder="https://hooks.slack.com/services/..."
                    className="bg-slate-800 border-slate-700 text-white font-mono text-sm"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Get webhook URL from Slack: Workspace Settings → Apps → Incoming Webhooks
                  </p>
                </div>

                <div>
                  <Label className="text-white">Channel</Label>
                  <Input
                    value={formData.slack_channel}
                    onChange={(e) => setFormData({ ...formData, slack_channel: e.target.value })}
                    placeholder="#security-alerts"
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>

                <Button
                  onClick={() => testSlackMutation.mutate()}
                  disabled={testSlackMutation.isPending}
                  variant="outline"
                  className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                >
                  {testSlackMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Test Message
                    </>
                  )}
                </Button>

                {settings?.test_slack_last_success !== undefined && (
                  <div className="flex items-center gap-2">
                    {settings.test_slack_last_success ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-green-400">Last test successful</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-red-400" />
                        <span className="text-sm text-red-400">Last test failed</span>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Button
          onClick={() => saveSettingsMutation.mutate()}
          disabled={saveSettingsMutation.isPending}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 min-h-[44px]"
        >
          {saveSettingsMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Shield className="w-4 h-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>

        {/* Notification Logs */}
        {user?.role === 'admin' && logs.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Recent Notification Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {logs.slice(0, 10).map(log => (
                  <div key={log.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg text-sm">
                    <div className="flex items-center gap-3">
                      {log.notification_type === 'email' ? (
                        <Mail className="w-4 h-4 text-blue-400" />
                      ) : (
                        <MessageSquare className="w-4 h-4 text-purple-400" />
                      )}
                      <div>
                        <p className="text-white">{log.destination}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(log.sent_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Badge className={
                      log.status === 'success' ? 'bg-green-500/20 text-green-400' :
                      'bg-red-500/20 text-red-400'
                    }>
                      {log.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
