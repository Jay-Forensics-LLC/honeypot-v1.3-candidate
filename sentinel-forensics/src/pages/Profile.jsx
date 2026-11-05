import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  User, 
  Mail, 
  Shield, 
  Calendar,
  Edit,
  Save,
  X,
  Lock,
  AlertTriangle,
  CreditCard,
  Crown,
  ExternalLink,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { safeString, formatEnum, safeDate } from "../components/utils/SafetyUtils";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/components/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ExpertCredentialManager from '../components/credentials/ExpertCredentialManager';

function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);

  const handleManageSubscription = async () => {
    setLoading(true);
    try {
      const result = await base44.functions.invoke('createCustomerPortalSession', {
        return_url: window.location.origin + createPageUrl('Profile')
      });

      if (result.data?.url) {
        window.location.href = result.data.url;
      } else {
        toast.error('Failed to open subscription portal');
      }
    } catch (error) {
      console.error('Portal error:', error);
      toast.error('Unable to access subscription management');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleManageSubscription}
      disabled={loading}
      variant="outline"
      className="w-full border-slate-700 hover:bg-slate-800"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Opening Portal...
        </>
      ) : (
        <>
          <ExternalLink className="w-4 h-4 mr-2" />
          Manage Subscription
        </>
      )}
    </Button>
  );
}

export default function Profile() {
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    organization: ''
  });

  React.useEffect(() => {
    if (user && isEditing) {
      setEditForm({
        full_name: safeString(user.full_name, ''),
        phone: safeString(user.phone, ''),
        organization: safeString(user.organization, '')
      });
    }
  }, [user, isEditing]);

  const updateProfileMutation = useMutation({
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      setIsEditing(false);
      toast.success('Profile updated successfully');
    },
    onError: () => {
      toast.error('Failed to update profile');
    }
  });

  const validateForm = () => {
    const errors = [];
    
    if (!editForm.full_name || editForm.full_name.trim().length === 0) {
      errors.push('Full name is required');
    }
    
    if (editForm.phone && editForm.phone.length > 0) {
      const phoneRegex = /^[\d\s\-\+\(\)]+$/;
      if (!phoneRegex.test(editForm.phone)) {
        errors.push('Phone number contains invalid characters');
      }
      if (editForm.phone.replace(/\D/g, '').length < 10) {
        errors.push('Phone number must be at least 10 digits');
      }
    }
    
    return errors;
  };

  const handleSave = () => {
    const errors = validateForm();
    
    if (errors.length > 0) {
      toast.error('Validation Failed', {
        description: errors.join('. ')
      });
      return;
    }
    
    updateProfileMutation.mutate(editForm);
  };

  const getTierColor = (tier) => {
    const safeTier = safeString(tier, 'free');
    const colors = {
      free: "bg-gray-500",
      professional: "bg-blue-500",
      enterprise: "bg-purple-500",
      forensic_suite: "bg-gradient-to-r from-purple-500 to-pink-500"
    };
    return colors[safeTier] || "bg-gray-500";
  };

  const getInitials = (name) => {
    const safeName = safeString(name, 'User');
    if (!safeName || safeName === 'User') return "U";
    return safeName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <div className="text-center text-slate-400">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6 pb-24 md:pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">My Profile</h1>
            <p className="text-slate-400">Manage your account settings and preferences</p>
          </div>
          {!isEditing ? (
            <Button
              onClick={() => setIsEditing(true)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Profile
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                className="border-slate-700"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateProfileMutation.isPending}
                className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              Security Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
              <div>
                <p className="font-semibold text-white">Multi-Factor Authentication</p>
                <p className="text-sm text-slate-400">
                  {user?.mfa_enabled 
                    ? `Enabled (${user.mfa_method?.toUpperCase()})` 
                    : 'Add an extra layer of security'}
                </p>
              </div>
              <Link to={createPageUrl('MFASetup')}>
                <Button variant="outline" className="border-slate-700">
                  <Lock className="w-4 h-4 mr-2" />
                  {user?.mfa_enabled ? 'Manage' : 'Enable MFA'}
                </Button>
              </Link>
            </div>

            {user?.role === 'admin' && !user?.mfa_enabled && (
              <Alert className="bg-orange-500/10 border-orange-500/50">
                <AlertTriangle className="w-4 h-4 text-orange-400 mr-3" />
                <AlertDescription className="text-orange-200">
                  <p className="font-semibold mb-1">MFA Required</p>
                  <p className="text-sm">As an administrator, you must enable multi-factor authentication.</p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="bg-slate-900/50 border-slate-800 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-white">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center text-white font-bold text-3xl shadow-lg">
                  {getInitials(user?.full_name)}
                </div>
                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input
                        value={editForm.full_name}
                        onChange={(e) => setEditForm({...editForm, full_name: e.target.value})}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                  ) : (
                    <>
                      <h2 className="text-2xl font-bold text-white">{safeString(user?.full_name, 'User')}</h2>
                      <p className="text-slate-400">{safeString(user?.email, 'user@example.com')}</p>
                    </>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-400">Email Address</Label>
                  <div className="flex items-center gap-2 text-white">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span>{safeString(user?.email, 'N/A')}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-400">Phone</Label>
                  {isEditing ? (
                    <Input
                      value={editForm.phone}
                      onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                      placeholder="Enter phone number"
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  ) : (
                    <div className="text-white">{safeString(user?.phone, 'Not set')}</div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-400">Organization</Label>
                  {isEditing ? (
                    <Input
                      value={editForm.organization}
                      onChange={(e) => setEditForm({...editForm, organization: e.target.value})}
                      placeholder="Enter organization name"
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  ) : (
                    <div className="text-white">{safeString(user?.organization, 'Not set')}</div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-400">Role</Label>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-slate-400" />
                    <Badge className="bg-blue-500/20 text-blue-400">
                      {formatEnum(user?.role, 'USER')}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-slate-800">
                <Label className="text-slate-400">Member Since</Label>
                <div className="flex items-center gap-2 text-white">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span>{safeDate(user?.created_date, 'N/A')}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Subscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center p-6 bg-slate-800/50 rounded-lg">
                <Badge className={`${getTierColor(user?.subscription_tier)} text-white text-lg px-4 py-2 mb-4`}>
                  {formatEnum(user?.subscription_tier, 'FREE')}
                </Badge>
                <p className="text-sm text-slate-400 mb-2">
                  Status: <span className={`font-semibold ${
                    user?.subscription_status === 'active' ? 'text-green-400' :
                    user?.subscription_status === 'trialing' ? 'text-blue-400' :
                    user?.subscription_status === 'past_due' ? 'text-orange-400' :
                    user?.subscription_status === 'canceled' ? 'text-red-400' :
                    'text-slate-400'
                  }`}>{formatEnum(user?.subscription_status, 'ACTIVE')}</span>
                </p>
                {user?.subscription_expires && (
                  <p className="text-xs text-slate-500 mb-2">
                    {user.subscription_tier !== 'free' ? 'Renews: ' : 'Trial ends: '}
                    {safeDate(user.subscription_expires, 'N/A')}
                  </p>
                )}
                {user?.email && (
                  <p className="text-xs text-slate-500">
                    Billing Email: {user.email}
                  </p>
                )}
              </div>

              {user?.subscription_tier !== 'free' && user?.stripe_customer_id && (
                <ManageSubscriptionButton />
              )}

              {user?.role === 'admin' && (
                <div className="p-3 bg-amber-900/20 border border-amber-700/50 rounded-lg space-y-2">
                  <p className="text-amber-400 text-xs font-semibold flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Admin Override
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['free', 'plus', 'pro', 'forensic_suite'].map((tier) => (
                      <Button
                        key={tier}
                        size="sm"
                        variant="outline"
                        onClick={() => updateProfileMutation.mutate({ subscription_tier: tier })}
                        className={`text-xs h-7 ${
                          user.subscription_tier === tier 
                            ? 'bg-amber-600 border-amber-600 text-white' 
                            : 'border-amber-700/50 hover:bg-amber-900/30'
                        }`}
                      >
                        {tier === 'forensic_suite' ? 'Forensic' : tier.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {(safeString(user?.subscription_tier, 'free') === 'free') && (
                <Link to={createPageUrl('Subscription')}>
                  <Button className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Upgrade Plan
                  </Button>
                </Link>
              )}

              <div className="text-xs text-slate-500 space-y-1">
                <p>• Secure encrypted storage</p>
                <p>• Chain-of-custody tracking</p>
                <p>• 24/7 support access</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <ExpertCredentialManager userEmail={user?.email} />
      </div>
    </div>
  );
}