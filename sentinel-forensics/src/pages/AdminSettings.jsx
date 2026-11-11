import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Settings,
  Shield,
  Info,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff,
  Download,
  Lock,
  Unlock,
  AlertTriangle,
  Users,
  UserPlus,
  MessageSquare,
  BarChart3,
  Clock,
  Flag,
  Edit,
  Trash2,
  Mail,
  Calendar,
  Zap,
  Crown,
  XCircle,
  TestTube
} from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';
import { updateUserSubscription } from '@/functions/updateUserSubscription';
import { getSubscriptionPlans } from '@/functions/getSubscriptionPlans';

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const [aiGuardProfile, setAiGuardProfile] = useState('enterprise');
  const [searchTerm, setSearchTerm] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedCohort, setSelectedCohort] = useState('');
  const [editForm, setEditForm] = useState({
    subscription_tier: '',
    role: '',
    reason: ''
  });

  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: users = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => base44.entities.User.list('-created_date', 100),
    enabled: user?.role === 'admin'
  });

  const { data: plansData } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const response = await getSubscriptionPlans();
      return response.data;
    }
  });

  const { data: cohorts = [] } = useQuery({
    queryKey: ['beta-cohorts'],
    queryFn: () => base44.entities.BetaCohort.filter({ is_active: true })
  });

  const { data: invites = [] } = useQuery({
    queryKey: ['beta-invites'],
    queryFn: () => base44.entities.BetaInvite.filter({}, '-created_date', 50)
  });

  const { data: feedback = [] } = useQuery({
    queryKey: ['beta-feedback'],
    queryFn: () => base44.entities.BetaFeedback.filter({}, '-created_date', 50)
  });

  const { data: betaUsers = [] } = useQuery({
    queryKey: ['beta-users'],
    queryFn: () => base44.entities.UserBetaProfile.filter({})
  });

  const { data: featureFlags = [] } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => base44.entities.BetaFeatureFlag.filter({})
  });

  const plans = plansData?.plans || [];

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updates }) => {
      if (updates.subscription_tier) {
        const targetUser = users.find(u => u.id === userId);
        await updateUserSubscription({
          user_email: targetUser.email,
          subscription_tier: updates.subscription_tier,
          reason: editForm.reason
        });
      }

      if (updates.role) {
        await base44.entities.User.update(userId, { role: updates.role });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      setEditUser(null);
      setEditForm({ subscription_tier: '', role: '', reason: '' });
      toast.success('User updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update user', {
        description: error.message
      });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId) => base44.entities.User.delete(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      setDeleteConfirm(null);
      toast.success('User deleted');
    }
  });

  const inviteMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke('inviteBetaUser', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beta-invites'] });
      setShowInviteDialog(false);
      setInviteEmail('');
      toast.success('Invitation sent');
    },
    onError: (error) => {
      toast.error('Failed to send invitation', { description: error.message });
    }
  });

  const toggleFlagMutation = useMutation({
    mutationFn: ({ flagId, enabled }) => 
      base44.entities.BetaFeatureFlag.update(flagId, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
      toast.success('Feature flag updated');
    }
  });

  const updateDemoModeMutation = useMutation({
    mutationFn: async (enabled) => {
      return await base44.auth.updateMe({
        demo_mode_enabled: enabled
      });
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      
      toast.success(`Demo mode ${enabled ? 'enabled' : 'disabled'}`, {
        description: enabled 
          ? 'Evidence exports and sensitive operations are now disabled'
          : 'Full functionality is now available',
        style: {
          background: '#14532D',
          border: '1px solid #16A34A',
          color: '#D1FAE5'
        }
      });
      
      // Reload page to apply changes
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    },
    onError: (error) => {
      toast.error('Failed to update demo mode', {
        description: error.message,
        style: {
          background: '#7F1D1D',
          border: '1px solid #DC2626',
          color: '#FEE2E2'
        }
      });
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <Alert className="bg-red-500/10 border-red-500/30 max-w-2xl mx-auto mt-12">
          <Shield className="h-5 w-5 text-red-400" />
          <AlertDescription className="text-red-300">
            <strong>Access Denied</strong>
            <p className="mt-1">This page is only accessible to administrators.</p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const demoModeEnabled = user.demo_mode_enabled ?? true;

  const handleEditUser = (userToEdit) => {
    setEditUser(userToEdit);
    setEditForm({
      subscription_tier: userToEdit.subscription_tier || 'free',
      role: userToEdit.role || 'user',
      reason: ''
    });
  };

  const handleSaveUser = () => {
    const updates = {};
    
    if (editForm.subscription_tier !== editUser.subscription_tier) {
      updates.subscription_tier = editForm.subscription_tier;
    }
    
    if (editForm.role !== editUser.role) {
      updates.role = editForm.role;
    }

    if (Object.keys(updates).length === 0) {
      toast.info('No changes made');
      return;
    }

    updateUserMutation.mutate({ userId: editUser.id, updates });
  };

  const handleInvite = () => {
    if (!inviteEmail || !selectedCohort) {
      toast.error('Email and cohort required');
      return;
    }
    inviteMutation.mutate({ 
      email: inviteEmail, 
      cohort_id: selectedCohort,
      is_referral: false 
    });
  };

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTierBadge = (tier) => {
    const badges = {
      free: { color: 'bg-slate-500/20 text-slate-400', icon: Users },
      plus: { color: 'bg-blue-500/20 text-blue-400', icon: Zap },
      pro: { color: 'bg-purple-500/20 text-purple-400', icon: Crown }
    };
    const config = badges[tier] || badges.free;
    const Icon = config.icon;
    
    return (
      <Badge className={config.color}>
        <Icon className="w-3 h-3 mr-1" />
        {tier || 'free'}
      </Badge>
    );
  };

  const getStatusIcon = (status) => {
    const icons = {
      pending: <Clock className="w-4 h-4 text-yellow-400" />,
      accepted: <CheckCircle className="w-4 h-4 text-green-400" />,
      expired: <XCircle className="w-4 h-4 text-slate-500" />,
      revoked: <XCircle className="w-4 h-4 text-red-400" />
    };
    return icons[status] || icons.pending;
  };

  const getSeverityColor = (severity) => {
    const colors = {
      low: 'bg-blue-500/20 text-blue-300',
      medium: 'bg-yellow-500/20 text-yellow-300',
      high: 'bg-orange-500/20 text-orange-300',
      critical: 'bg-red-500/20 text-red-300'
    };
    return colors[severity] || colors.medium;
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Admin Settings</h1>
          <p className="text-slate-400">System configuration, user management, and beta program</p>
        </div>

        <Tabs defaultValue="settings" className="space-y-6">
          <TabsList className="bg-slate-900/50 border border-slate-800">
            <TabsTrigger value="settings" className="data-[state=active]:bg-blue-600">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-purple-600">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="beta" className="data-[state=active]:bg-green-600">
              <TestTube className="w-4 h-4 mr-2" />
              Beta Program
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-6">

        {/* Demo Mode Toggle */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-400" />
              Demo Mode Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="bg-blue-500/10 border-blue-500/30">
              <Info className="h-5 w-5 text-blue-400" />
              <AlertDescription className="text-blue-300">
                <strong className="block mb-2">What is Demo Mode?</strong>
                <p className="text-sm">
                  When enabled, Demo Mode restricts certain sensitive operations for public demonstrations:
                </p>
                <ul className="list-disc ml-6 mt-2 space-y-1 text-sm">
                  <li>Evidence exports are simulated (no actual downloads)</li>
                  <li>Agent commands are disabled</li>
                  <li>API integrations show sample data</li>
                  <li>A banner is displayed at the top of the app</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-between p-6 bg-slate-800/50 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Label htmlFor="demo-mode" className="text-lg font-semibold text-white cursor-pointer">
                    Demo Mode
                  </Label>
                  <Badge className={demoModeEnabled 
                    ? 'bg-blue-500/20 text-blue-400' 
                    : 'bg-green-500/20 text-green-400'
                  }>
                    {demoModeEnabled ? (
                      <>
                        <EyeOff className="w-3 h-3 mr-1" />
                        DEMO
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3 mr-1" />
                        PRODUCTION
                      </>
                    )}
                  </Badge>
                </div>
                <p className="text-sm text-slate-400">
                  {demoModeEnabled 
                    ? 'Demo mode is active. Exports and sensitive operations are disabled.' 
                    : 'Production mode is active. All features are fully functional.'}
                </p>
              </div>
              <Switch
                id="demo-mode"
                checked={demoModeEnabled}
                onCheckedChange={(checked) => updateDemoModeMutation.mutate(checked)}
                disabled={updateDemoModeMutation.isPending}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>

            {/* Current Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {demoModeEnabled ? (
                      <Lock className="w-5 h-5 text-orange-400 flex-shrink-0" />
                    ) : (
                      <Unlock className="w-5 h-5 text-green-400 flex-shrink-0" />
                    )}
                    <div>
                      <p className="font-semibold text-white text-sm">Evidence Exports</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {demoModeEnabled ? 'Simulated (no downloads)' : 'Fully functional'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {demoModeEnabled ? (
                      <Lock className="w-5 h-5 text-orange-400 flex-shrink-0" />
                    ) : (
                      <Unlock className="w-5 h-5 text-green-400 flex-shrink-0" />
                    )}
                    <div>
                      <p className="font-semibold text-white text-sm">Agent Commands</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {demoModeEnabled ? 'Disabled for safety' : 'Fully operational'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {demoModeEnabled ? (
                      <Eye className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    ) : (
                      <EyeOff className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    )}
                    <div>
                      <p className="font-semibold text-white text-sm">Demo Banner</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {demoModeEnabled ? 'Visible at top' : 'Hidden'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {demoModeEnabled ? (
                      <Download className="w-5 h-5 text-orange-400 flex-shrink-0" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                    )}
                    <div>
                      <p className="font-semibold text-white text-sm">PDF Reports</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {demoModeEnabled ? 'Sample data only' : 'Real data exports'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {!demoModeEnabled && (
              <Alert className="bg-green-500/10 border-green-500/30">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <AlertDescription className="text-green-300">
                  <strong>Production Mode Active</strong>
                  <p className="text-sm mt-1">
                    All features are fully functional. Evidence exports, agent commands, and API integrations are live.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {updateDemoModeMutation.isPending && (
              <Alert className="bg-yellow-500/10 border-yellow-500/30">
                <Loader2 className="h-5 w-5 text-yellow-400 animate-spin" />
                <AlertDescription className="text-yellow-300">
                  <strong>Updating settings...</strong>
                  <p className="text-sm mt-1">The page will reload to apply changes.</p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* AI Security Configuration */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              AI Security & Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-purple-500/10 border-purple-500/30">
              <Info className="h-5 w-5 text-purple-400" />
              <AlertDescription className="text-purple-300">
                <strong className="block mb-2">AI Injection Guard</strong>
                <p className="text-sm">
                  Configure how the system detects and mitigates prompt injection attempts in AI features.
                  Different profiles apply different thresholds based on your market segment and compliance needs.
                </p>
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <Label className="text-slate-300">Market/Compliance Profile</Label>
              <Select 
                value={aiGuardProfile} 
                onValueChange={async (val) => {
                  setAiGuardProfile(val);
                  await base44.auth.updateMe({ ai_guard_profile: val });
                  toast.success(`AI guard profile set to: ${val}`);
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consumer">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-500/20 text-blue-400 text-xs">Consumer</Badge>
                      <span className="text-xs">Strictest blocking, minimal logging</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="enterprise">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-500/20 text-green-400 text-xs">Enterprise</Badge>
                      <span className="text-xs">Balanced detection, standard logging</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="regulated">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-orange-500/20 text-orange-400 text-xs">Regulated</Badge>
                      <span className="text-xs">High sensitivity, minimal retention</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-800/50 rounded">
                  <p className="text-slate-400 mb-1">Block Threshold</p>
                  <p className="text-white font-mono">
                    {aiGuardProfile === 'consumer' ? '85' : aiGuardProfile === 'regulated' ? '80' : '90'}/100
                  </p>
                </div>
                <div className="p-3 bg-slate-800/50 rounded">
                  <p className="text-slate-400 mb-1">Challenge Threshold</p>
                  <p className="text-white font-mono">
                    {aiGuardProfile === 'consumer' ? '65' : aiGuardProfile === 'regulated' ? '60' : '70'}/100
                  </p>
                </div>
                <div className="p-3 bg-slate-800/50 rounded">
                  <p className="text-slate-400 mb-1">Logging Detail</p>
                  <p className="text-white capitalize">
                    {aiGuardProfile === 'enterprise' ? 'Standard' : 'Minimal'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => updateDemoModeMutation.mutate(false)}
              disabled={!demoModeEnabled || updateDemoModeMutation.isPending}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 min-h-[44px]"
            >
              <Unlock className="w-4 h-4 mr-2" />
              Enable Production Mode
            </Button>

            <Button
              onClick={() => updateDemoModeMutation.mutate(true)}
              disabled={demoModeEnabled || updateDemoModeMutation.isPending}
              variant="outline"
              className="w-full border-slate-700 text-white hover:bg-slate-800 min-h-[44px]"
            >
              <Lock className="w-4 h-4 mr-2" />
              Enable Demo Mode
            </Button>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-500/30">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-purple-400 flex-shrink-0 mt-1" />
              <div className="text-sm text-purple-200">
                <p className="font-semibold mb-2">Important Notes:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Demo Mode is designed for public demonstrations and testing</li>
                  <li>Production Mode enables all sensitive operations and real data exports</li>
                  <li>The page will automatically reload when you toggle demo mode</li>
                  <li>This setting affects all users in the application</li>
                  <li>Only administrators can change this setting</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">User Management</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-400 text-sm">Total Users</p>
                      <p className="text-3xl font-bold text-white mt-1">{users.length}</p>
                    </div>
                    <Users className="w-10 h-10 text-blue-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-400 text-sm">Free Tier</p>
                      <p className="text-3xl font-bold text-white mt-1">
                        {users.filter(u => !u.subscription_tier || u.subscription_tier === 'free').length}
                      </p>
                    </div>
                    <Users className="w-10 h-10 text-slate-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-400 text-sm">Plus Tier</p>
                      <p className="text-3xl font-bold text-white mt-1">
                        {users.filter(u => u.subscription_tier === 'plus').length}
                      </p>
                    </div>
                    <Zap className="w-10 h-10 text-blue-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-400 text-sm">Pro Tier</p>
                      <p className="text-3xl font-bold text-white mt-1">
                        {users.filter(u => u.subscription_tier === 'pro').length}
                      </p>
                    </div>
                    <Crown className="w-10 h-10 text-purple-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4">
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search users by email or name..."
                    className="pl-10 bg-slate-800 border-slate-700 text-white"
                    style={{ fontSize: '16px' }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Users ({filteredUsers.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {users.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                    <p className="text-slate-400">No users found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredUsers.map((u) => (
                      <div
                        key={u.id}
                        className="p-4 bg-slate-800/30 border border-slate-700 rounded-lg hover:border-blue-500/50 transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-semibold text-white text-lg">{u.full_name || 'No Name'}</h4>
                              {getTierBadge(u.subscription_tier)}
                              {u.role === 'admin' && (
                                <Badge className="bg-red-500/20 text-red-400">
                                  <Shield className="w-3 h-3 mr-1" />
                                  Admin
                                </Badge>
                              )}
                              {u.subscription_status === 'active' && u.subscription_tier !== 'free' && (
                                <Badge className="bg-green-500/20 text-green-400">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Active
                                </Badge>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                              <div className="flex items-center gap-2 text-slate-400">
                                <Mail className="w-4 h-4" />
                                <span className="truncate">{u.email}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-400">
                                <Calendar className="w-4 h-4" />
                                <span>
                                  Joined {u.created_date ? formatDistanceToNow(new Date(u.created_date), { addSuffix: true }) : 'unknown'}
                                </span>
                              </div>
                              {u.usage_metrics && (
                                <div className="text-slate-400">
                                  <span>Usage: {u.usage_metrics.scans_count || 0} scans, {(u.usage_metrics.evidence_mb || 0).toFixed(0)} MB</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleEditUser(u)}
                              variant="outline"
                              size="sm"
                              className="border-slate-700 min-h-[40px]"
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </Button>
                            {u.id !== user.id && (
                              <Button
                                onClick={() => setDeleteConfirm(u)}
                                variant="ghost"
                                size="icon"
                                className="text-red-400 hover:bg-red-500/10 min-h-[40px] min-w-[40px]"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="beta" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Beta Program Management</h2>
              <Button
                onClick={() => setShowInviteDialog(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Invite User
              </Button>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-400 text-sm">Active Beta Users</p>
                      <p className="text-3xl font-bold text-white mt-1">{betaUsers.length}</p>
                    </div>
                    <Users className="w-10 h-10 text-blue-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-400 text-sm">Pending Invites</p>
                      <p className="text-3xl font-bold text-white mt-1">
                        {invites.filter(i => i.status === 'pending').length}
                      </p>
                    </div>
                    <Clock className="w-10 h-10 text-yellow-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-400 text-sm">Feedback Items</p>
                      <p className="text-3xl font-bold text-white mt-1">{feedback.length}</p>
                    </div>
                    <MessageSquare className="w-10 h-10 text-purple-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-400 text-sm">Active Flags</p>
                      <p className="text-3xl font-bold text-white mt-1">
                        {featureFlags.filter(f => f.enabled).length}
                      </p>
                    </div>
                    <Flag className="w-10 h-10 text-green-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="invites" className="space-y-4">
              <TabsList className="bg-slate-800 border-slate-700">
                <TabsTrigger value="invites">Invitations ({invites.length})</TabsTrigger>
                <TabsTrigger value="feedback">Feedback ({feedback.length})</TabsTrigger>
                <TabsTrigger value="cohorts">Cohorts ({cohorts.length})</TabsTrigger>
                <TabsTrigger value="flags">Feature Flags ({featureFlags.length})</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
              </TabsList>

              <TabsContent value="invites">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white">Beta Invitations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {invites.length === 0 ? (
                      <div className="text-center py-12">
                        <UserPlus className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                        <p className="text-slate-400">No invitations yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {invites.map(invite => (
                          <Card key={invite.id} className="bg-slate-800/50 border-slate-700">
                            <CardContent className="p-4 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {getStatusIcon(invite.status)}
                                <div>
                                  <p className="text-white font-medium">{invite.email}</p>
                                  <p className="text-sm text-slate-400">
                                    Invited by {invite.invited_by} • {new Date(invite.created_date).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {invite.is_referral && (
                                  <Badge className="bg-purple-500/20 text-purple-300">Referral</Badge>
                                )}
                                <Badge className={
                                  invite.status === 'pending' ? 'bg-yellow-500/20 text-yellow-300' :
                                  invite.status === 'accepted' ? 'bg-green-500/20 text-green-300' :
                                  'bg-slate-500/20 text-slate-300'
                                }>
                                  {invite.status}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="feedback">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white">User Feedback</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {feedback.length === 0 ? (
                      <div className="text-center py-12">
                        <MessageSquare className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                        <p className="text-slate-400">No feedback yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {feedback.map(item => (
                          <Card key={item.id} className="bg-slate-800/50 border-slate-700">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <h4 className="text-white font-semibold">{item.title}</h4>
                                  <p className="text-sm text-slate-400 mt-1">{item.description}</p>
                                </div>
                                <div className="flex gap-2">
                                  <Badge className={getSeverityColor(item.severity)}>
                                    {item.severity}
                                  </Badge>
                                  <Badge className="bg-blue-500/20 text-blue-300">
                                    {item.category}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-slate-500">
                                <span>{item.user_email}</span>
                                <span>•</span>
                                <span>{new Date(item.created_date).toLocaleString()}</span>
                                {item.context?.page_route && (
                                  <>
                                    <span>•</span>
                                    <span>{item.context.page_route}</span>
                                  </>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="cohorts">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white">Beta Cohorts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      {cohorts.map(cohort => (
                        <Card key={cohort.id} className="bg-slate-800/50 border-slate-700">
                          <CardContent className="p-4">
                            <h4 className="text-white font-semibold mb-2">{cohort.name}</h4>
                            <p className="text-sm text-slate-400 mb-3">{cohort.description}</p>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">
                                {cohort.current_members} / {cohort.max_members || '∞'} members
                              </span>
                              <Badge className={cohort.is_active ? 'bg-green-500/20 text-green-300' : 'bg-slate-500/20 text-slate-300'}>
                                {cohort.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="flags">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white">Feature Flags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {featureFlags.length === 0 ? (
                      <div className="text-center py-12">
                        <Flag className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                        <p className="text-slate-400">No feature flags configured</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {featureFlags.map(flag => (
                          <Card key={flag.id} className="bg-slate-800/50 border-slate-700">
                            <CardContent className="p-4 flex items-center justify-between">
                              <div className="flex-1">
                                <h4 className="text-white font-semibold">{flag.name}</h4>
                                <p className="text-sm text-slate-400">{flag.description}</p>
                                <p className="text-xs text-slate-500 mt-1">Key: {flag.flag_key}</p>
                                {flag.rollout_percentage > 0 && (
                                  <p className="text-xs text-blue-300 mt-1">
                                    Rollout: {flag.rollout_percentage}%
                                  </p>
                                )}
                              </div>
                              <Button
                                onClick={() => toggleFlagMutation.mutate({ 
                                  flagId: flag.id, 
                                  enabled: !flag.enabled 
                                })}
                                disabled={toggleFlagMutation.isPending}
                                className={flag.enabled ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-600 hover:bg-slate-700'}
                              >
                                {flag.enabled ? 'Enabled' : 'Disabled'}
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="analytics">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white">Analytics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12">
                      <BarChart3 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                      <p className="text-slate-400">Analytics dashboard coming soon</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

        <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
            <DialogHeader>
              <DialogTitle>Edit User: {editUser?.full_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-white">Email</Label>
                <Input
                  value={editUser?.email || ''}
                  disabled
                  className="bg-slate-800 border-slate-700 text-slate-400"
                />
              </div>

              <div>
                <Label className="text-white">Subscription Tier *</Label>
                <Select
                  value={editForm.subscription_tier}
                  onValueChange={(value) => setEditForm({...editForm, subscription_tier: value})}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white min-h-[44px]">
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.slug}>
                        <div className="flex items-center gap-2">
                          <span>{plan.displayName}</span>
                          {plan.slug !== 'free' && (
                            <span className="text-xs text-slate-400">
                              ${plan.priceMonthly}/mo
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 mt-1">
                  Current: {editUser?.subscription_tier || 'free'}
                </p>
              </div>

              <div>
                <Label className="text-white">Role</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(value) => setEditForm({...editForm, role: value})}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white min-h-[44px]">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-white">Reason for Change (optional)</Label>
                <Input
                  value={editForm.reason}
                  onChange={(e) => setEditForm({...editForm, reason: e.target.value})}
                  placeholder="e.g., Beta tester assignment"
                  className="bg-slate-800 border-slate-700 text-white"
                  style={{ fontSize: '16px' }}
                />
              </div>

              {editForm.subscription_tier && plans.find(p => p.slug === editForm.subscription_tier) && (
                <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded text-sm">
                  <p className="text-blue-200 font-semibold mb-2">Plan Limits:</p>
                  <ul className="text-blue-300/80 space-y-1 text-xs">
                    <li>• Scans: {plans.find(p => p.slug === editForm.subscription_tier).limits.scansPerMonth || 'Unlimited'}/month</li>
                    <li>• Storage: {plans.find(p => p.slug === editForm.subscription_tier).limits.evidenceStorageMB || 'Unlimited'} MB</li>
                    <li>• Devices: {plans.find(p => p.slug === editForm.subscription_tier).limits.deviceLimit || 'Unlimited'}</li>
                  </ul>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={() => setEditUser(null)}
                variant="outline"
                className="border-slate-700 min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveUser}
                disabled={updateUserMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
              >
                {updateUserMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete User?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                This will permanently delete {deleteConfirm?.email}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-800 border-slate-700">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteUserMutation.mutate(deleteConfirm.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete User
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle>Invite Beta Tester</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>Email Address</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div>
                <Label>Cohort</Label>
                <Select value={selectedCohort} onValueChange={setSelectedCohort}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue placeholder="Select cohort" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    {cohorts.map(cohort => (
                      <SelectItem key={cohort.id} value={cohort.id}>
                        {cohort.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowInviteDialog(false)}
                  className="border-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleInvite}
                  disabled={inviteMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {inviteMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Send Invitation
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}