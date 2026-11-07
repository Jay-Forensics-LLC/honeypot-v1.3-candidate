import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, Plus, Edit, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_PROFILES = [
  {
    profile_name: 'U.S. Federal Court Standard',
    jurisdiction: 'federal',
    court_name: 'U.S. District Court',
    exhibit_prefix: 'Exhibit',
    exhibit_format: 'numeric',
    date_format: 'MM/DD/YYYY',
    required_disclosures: [
      'All evidence collected in accordance with Federal Rules of Evidence',
      'Chain of custody maintained per 28 U.S.C. requirements',
      'Expert qualifications disclosed per Rule 702'
    ],
    formatting_rules: {
      font_family: 'Times New Roman',
      font_size: 12,
      line_spacing: 2,
      margin_inches: 1,
      page_numbers: true,
      header_footer: true
    }
  },
  {
    profile_name: 'Florida State Court',
    jurisdiction: 'state',
    court_name: 'Florida Circuit Court',
    exhibit_prefix: 'Exhibit',
    exhibit_format: 'alpha',
    date_format: 'MM/DD/YYYY',
    required_disclosures: [
      'Evidence collected per Florida Statutes Chapter 90',
      'Chain of custody documented per F.S. 90.803',
      'Digital evidence handling per Florida Supreme Court guidelines'
    ],
    formatting_rules: {
      font_family: 'Arial',
      font_size: 12,
      line_spacing: 1.5,
      margin_inches: 1,
      page_numbers: true,
      header_footer: true
    }
  }
];

export default function CourtProfileManager({ onProfileSelect }) {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [formData, setFormData] = useState({
    profile_name: '',
    jurisdiction: 'federal',
    court_name: '',
    exhibit_prefix: 'Exhibit',
    exhibit_format: 'numeric',
    date_format: 'MM/DD/YYYY',
    required_disclosures: [],
    is_default: false
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['court-profiles'],
    queryFn: async () => {
      const items = await base44.entities.CourtExportProfile.filter({});
      return items;
    }
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: async () => {
      const results = [];
      for (const profile of DEFAULT_PROFILES) {
        const created = await base44.entities.CourtExportProfile.create({
          ...profile,
          organization_id: user.organization_id,
          created_by: user.email,
          version: 1
        });
        results.push(created);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['court-profiles'] });
      toast.success('Default profiles created');
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.CourtExportProfile.create({
        ...data,
        organization_id: user.organization_id,
        created_by: user.email,
        version: 1
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['court-profiles'] });
      setShowDialog(false);
      setEditingProfile(null);
      toast.success('Profile created');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return base44.entities.CourtExportProfile.update(id, {
        ...data,
        last_modified_by: user.email,
        version: (editingProfile?.version || 1) + 1
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['court-profiles'] });
      setShowDialog(false);
      setEditingProfile(null);
      toast.success('Profile updated');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CourtExportProfile.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['court-profiles'] });
      toast.success('Profile deleted');
    }
  });

  const handleEdit = (profile) => {
    setEditingProfile(profile);
    setFormData({
      profile_name: profile.profile_name,
      jurisdiction: profile.jurisdiction,
      court_name: profile.court_name,
      exhibit_prefix: profile.exhibit_prefix,
      exhibit_format: profile.exhibit_format,
      date_format: profile.date_format,
      required_disclosures: profile.required_disclosures || [],
      is_default: profile.is_default
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (editingProfile) {
      updateMutation.mutate({ id: editingProfile.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-purple-400" />
            Court Export Profiles
          </CardTitle>
          <div className="flex gap-2">
            {profiles.length === 0 && (
              <Button
                onClick={() => seedDefaultsMutation.mutate()}
                disabled={seedDefaultsMutation.isPending}
                variant="outline"
                size="sm"
                className="border-slate-700"
              >
                {seedDefaultsMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Seed Defaults
              </Button>
            )}
            <Button
              onClick={() => {
                setEditingProfile(null);
                setFormData({
                  profile_name: '',
                  jurisdiction: 'federal',
                  court_name: '',
                  exhibit_prefix: 'Exhibit',
                  exhibit_format: 'numeric',
                  date_format: 'MM/DD/YYYY',
                  required_disclosures: [],
                  is_default: false
                });
                setShowDialog(true);
              }}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Profile
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {profiles.length === 0 ? (
          <div className="text-center py-8">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 mb-4">No court profiles configured</p>
            <p className="text-sm text-slate-500">Create profiles to format reports for specific jurisdictions</p>
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((profile) => (
              <Card key={profile.id} className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-white font-semibold">{profile.profile_name}</h3>
                        {profile.is_default && (
                          <Badge className="bg-green-500/20 text-green-300">Default</Badge>
                        )}
                        <Badge className="bg-purple-500/20 text-purple-300">v{profile.version}</Badge>
                      </div>
                      <div className="space-y-1 text-sm">
                        <p className="text-slate-400">
                          <span className="font-medium">Court:</span> {profile.court_name || profile.jurisdiction}
                        </p>
                        <p className="text-slate-400">
                          <span className="font-medium">Exhibit Format:</span> {profile.exhibit_prefix} {profile.exhibit_format}
                        </p>
                        <p className="text-slate-400">
                          <span className="font-medium">Date Format:</span> {profile.date_format}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {onProfileSelect && (
                        <Button
                          size="sm"
                          onClick={() => onProfileSelect(profile)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Select
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(profile)}
                        className="border-slate-700"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteMutation.mutate(profile.id)}
                        className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingProfile ? 'Edit' : 'Create'} Court Profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Profile Name *</Label>
                <Input
                  value={formData.profile_name}
                  onChange={(e) => setFormData({...formData, profile_name: e.target.value})}
                  placeholder="e.g., U.S. Federal Court Standard"
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Jurisdiction *</Label>
                  <Select value={formData.jurisdiction} onValueChange={(v) => setFormData({...formData, jurisdiction: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="federal">Federal</SelectItem>
                      <SelectItem value="state">State</SelectItem>
                      <SelectItem value="international">International</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Court Name</Label>
                  <Input
                    value={formData.court_name}
                    onChange={(e) => setFormData({...formData, court_name: e.target.value})}
                    placeholder="e.g., U.S. District Court, S.D.N.Y."
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Exhibit Prefix</Label>
                  <Input
                    value={formData.exhibit_prefix}
                    onChange={(e) => setFormData({...formData, exhibit_prefix: e.target.value})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>

                <div>
                  <Label>Exhibit Format</Label>
                  <Select value={formData.exhibit_format} onValueChange={(v) => setFormData({...formData, exhibit_format: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="numeric">Numeric (1, 2, 3)</SelectItem>
                      <SelectItem value="alpha">Alpha (A, B, C)</SelectItem>
                      <SelectItem value="alphanumeric">Alphanumeric (A1, A2)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Date Format</Label>
                  <Select value={formData.date_format} onValueChange={(v) => setFormData({...formData, date_format: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      <SelectItem value="ISO8601">ISO 8601</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  checked={formData.is_default}
                  onCheckedChange={(checked) => setFormData({...formData, is_default: checked})}
                />
                <Label>Set as default profile</Label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={() => setShowDialog(false)}
                  variant="outline"
                  className="flex-1 border-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!formData.profile_name || createMutation.isPending || updateMutation.isPending}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  {editingProfile ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}