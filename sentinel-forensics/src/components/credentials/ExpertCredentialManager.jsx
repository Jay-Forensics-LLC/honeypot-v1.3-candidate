import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Award,
  Plus,
  Calendar,
  Building,
  ExternalLink,
  Trash2,
  Edit,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';
import { toast } from 'sonner';

export default function ExpertCredentialManager({ userEmail }) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCredential, setEditingCredential] = useState(null);
  const [formData, setFormData] = useState({
    credential_type: 'certification',
    credential_name: '',
    issuing_authority: '',
    issue_date: '',
    expiration_date: '',
    credential_number: '',
    jurisdiction: '',
    verification_url: '',
    document_url: '',
    notes: ''
  });

  const queryClient = useQueryClient();

  const { data: credentials = [], isLoading } = useQuery({
    queryKey: ['expert-credentials', userEmail],
    queryFn: () => base44.entities.ExpertCredential.filter({ user_email: userEmail }, '-issue_date')
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const user = await base44.auth.me();
      return base44.entities.ExpertCredential.create({
        ...data,
        organization_id: user.organization_id,
        user_email: userEmail,
        status: 'active'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expert-credentials'] });
      setShowAddDialog(false);
      setEditingCredential(null);
      resetForm();
      toast.success('Credential added');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ExpertCredential.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expert-credentials'] });
      setShowAddDialog(false);
      setEditingCredential(null);
      resetForm();
      toast.success('Credential updated');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ExpertCredential.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expert-credentials'] });
      toast.success('Credential deleted');
    }
  });

  const resetForm = () => {
    setFormData({
      credential_type: 'certification',
      credential_name: '',
      issuing_authority: '',
      issue_date: '',
      expiration_date: '',
      credential_number: '',
      jurisdiction: '',
      verification_url: '',
      document_url: '',
      notes: ''
    });
  };

  const handleEdit = (credential) => {
    setEditingCredential(credential);
    setFormData({
      credential_type: credential.credential_type,
      credential_name: credential.credential_name,
      issuing_authority: credential.issuing_authority,
      issue_date: credential.issue_date,
      expiration_date: credential.expiration_date || '',
      credential_number: credential.credential_number || '',
      jurisdiction: credential.jurisdiction || '',
      verification_url: credential.verification_url || '',
      document_url: credential.document_url || '',
      notes: credential.notes || ''
    });
    setShowAddDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingCredential) {
      updateMutation.mutate({ id: editingCredential.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getStatusIcon = (credential) => {
    if (!credential.expiration_date) return <CheckCircle className="w-5 h-5 text-green-400" />;
    
    const expiry = new Date(credential.expiration_date);
    const now = new Date();
    const daysUntilExpiry = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) return <AlertTriangle className="w-5 h-5 text-red-400" />;
    if (daysUntilExpiry < 90) return <Clock className="w-5 h-5 text-yellow-400" />;
    return <CheckCircle className="w-5 h-5 text-green-400" />;
  };

  const getTypeColor = (type) => {
    const colors = {
      certification: 'bg-blue-500/20 text-blue-300',
      license: 'bg-purple-500/20 text-purple-300',
      degree: 'bg-green-500/20 text-green-300',
      training: 'bg-yellow-500/20 text-yellow-300',
      court_qualification: 'bg-red-500/20 text-red-300'
    };
    return colors[type] || colors.certification;
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-blue-400" />
            Expert Credentials
          </CardTitle>
          <Button
            onClick={() => {
              resetForm();
              setEditingCredential(null);
              setShowAddDialog(true);
            }}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Credential
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {credentials.length === 0 ? (
          <div className="text-center py-8">
            <Award className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 mb-4">No credentials added yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {credentials.map((credential) => (
              <div
                key={credential.id}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    {getStatusIcon(credential)}
                    <div>
                      <h3 className="text-white font-semibold">{credential.credential_name}</h3>
                      <p className="text-sm text-slate-400">{credential.issuing_authority}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(credential)}
                      className="text-slate-400 hover:text-white"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(credential.id)}
                      className="text-slate-400 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge className={getTypeColor(credential.credential_type)}>
                    {credential.credential_type.replace('_', ' ')}
                  </Badge>
                  {credential.credential_number && (
                    <Badge variant="outline" className="border-slate-600 text-slate-300">
                      #{credential.credential_number}
                    </Badge>
                  )}
                  {credential.jurisdiction && (
                    <Badge variant="outline" className="border-slate-600 text-slate-300">
                      {credential.jurisdiction}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-slate-500">Issued</p>
                    <p className="text-slate-300 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {DateUtils.safeFormatDate(credential.issue_date)}
                    </p>
                  </div>
                  {credential.expiration_date && (
                    <div>
                      <p className="text-slate-500">Expires</p>
                      <p className="text-slate-300 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {DateUtils.safeFormatDate(credential.expiration_date)}
                      </p>
                    </div>
                  )}
                </div>

                {(credential.verification_url || credential.document_url) && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700">
                    {credential.verification_url && (
                      <a
                        href={credential.verification_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Verify
                      </a>
                    )}
                    {credential.document_url && (
                      <a
                        href={credential.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Certificate
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCredential ? 'Edit' : 'Add'} Credential</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={formData.credential_type}
                  onValueChange={(v) => setFormData({ ...formData, credential_type: v })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="certification">Certification</SelectItem>
                    <SelectItem value="license">License</SelectItem>
                    <SelectItem value="degree">Degree</SelectItem>
                    <SelectItem value="training">Training</SelectItem>
                    <SelectItem value="court_qualification">Court Qualification</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Credential Name *</Label>
                <Input
                  value={formData.credential_name}
                  onChange={(e) => setFormData({ ...formData, credential_name: e.target.value })}
                  placeholder="e.g., CISSP, EnCE, CFE"
                  className="bg-slate-800 border-slate-700"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Issuing Authority *</Label>
                <Input
                  value={formData.issuing_authority}
                  onChange={(e) => setFormData({ ...formData, issuing_authority: e.target.value })}
                  placeholder="e.g., ISC2, IACIS"
                  className="bg-slate-800 border-slate-700"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Credential Number</Label>
                <Input
                  value={formData.credential_number}
                  onChange={(e) => setFormData({ ...formData, credential_number: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="space-y-2">
                <Label>Issue Date *</Label>
                <Input
                  type="date"
                  value={formData.issue_date}
                  onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Expiration Date</Label>
                <Input
                  type="date"
                  value={formData.expiration_date}
                  onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="space-y-2">
                <Label>Jurisdiction</Label>
                <Input
                  value={formData.jurisdiction}
                  onChange={(e) => setFormData({ ...formData, jurisdiction: e.target.value })}
                  placeholder="e.g., Florida, Federal"
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="space-y-2">
                <Label>Verification URL</Label>
                <Input
                  type="url"
                  value={formData.verification_url}
                  onChange={(e) => setFormData({ ...formData, verification_url: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Certificate/Document URL</Label>
                <Input
                  type="url"
                  value={formData.document_url}
                  onChange={(e) => setFormData({ ...formData, document_url: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false);
                  setEditingCredential(null);
                  resetForm();
                }}
                className="border-slate-700"
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                {editingCredential ? 'Update' : 'Add'} Credential
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}