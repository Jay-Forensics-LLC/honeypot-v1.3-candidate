import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Edit2, Tag as TagIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function TagManager({ caseId }) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [newTag, setNewTag] = useState({
    name: '',
    displayName: '',
    color: '#3B82F6',
    scope: caseId ? 'CASE' : 'ORG'
  });

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags', caseId],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('tagManagement', {
        action: 'list',
        caseId
      });
      return data.tags || [];
    }
  });

  const createMutation = useMutation({
    mutationFn: async (tagData) => {
      const { data } = await base44.functions.invoke('tagManagement', {
        action: 'create',
        ...tagData,
        caseId: tagData.scope === 'CASE' ? caseId : undefined
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast.success('Tag created');
      setShowCreate(false);
      setNewTag({ name: '', displayName: '', color: '#3B82F6', scope: caseId ? 'CASE' : 'ORG' });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create tag');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ tagId, ...updates }) => {
      const { data } = await base44.functions.invoke('tagManagement', {
        action: 'update',
        tagId,
        ...updates
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast.success('Tag updated');
      setEditingTag(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (tagId) => {
      await base44.functions.invoke('tagManagement', {
        action: 'delete',
        tagId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast.success('Tag deleted');
    }
  });

  const colors = [
    { value: '#3B82F6', label: 'Blue' },
    { value: '#10B981', label: 'Green' },
    { value: '#F59E0B', label: 'Orange' },
    { value: '#EF4444', label: 'Red' },
    { value: '#8B5CF6', label: 'Purple' },
    { value: '#EC4899', label: 'Pink' },
    { value: '#6B7280', label: 'Gray' }
  ];

  return (
    <>
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-white flex items-center gap-2">
              <TagIcon className="w-5 h-5 text-blue-400" />
              Tag Manager
            </CardTitle>
            <Button
              onClick={() => setShowCreate(true)}
              className="bg-blue-600 hover:bg-blue-700"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Tag
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-slate-400 text-sm">Loading tags...</p>
          ) : tags.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">No tags created yet</p>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div key={tag.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge style={{ backgroundColor: tag.color + '20', color: tag.color, borderColor: tag.color + '50' }}>
                      {tag.display_name}
                    </Badge>
                    <span className="text-xs text-slate-500">{tag.scope}</span>
                    <span className="text-xs text-slate-500">Used {tag.usage_count || 0}x</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingTag(tag)}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(tag.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Tag Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Create New Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Tag Name *</Label>
              <Input
                value={newTag.name}
                onChange={(e) => setNewTag({ ...newTag, name: e.target.value })}
                placeholder="e.g., apt, wifi-mitm"
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">2-32 chars, lowercase recommended</p>
            </div>
            <div>
              <Label className="text-slate-300">Display Name</Label>
              <Input
                value={newTag.displayName}
                onChange={(e) => setNewTag({ ...newTag, displayName: e.target.value })}
                placeholder="Optional: APT, WiFi MITM"
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Color</Label>
              <Select
                value={newTag.color}
                onValueChange={(value) => setNewTag({ ...newTag, color: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colors.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: c.value }} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Scope</Label>
              <Select
                value={newTag.scope}
                onValueChange={(value) => setNewTag({ ...newTag, scope: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {caseId && <SelectItem value="CASE">Case Only</SelectItem>}
                  <SelectItem value="ORG">Organization</SelectItem>
                  <SelectItem value="USER">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => createMutation.mutate(newTag)}
              disabled={!newTag.name || createMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Create Tag
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Tag Dialog */}
      {editingTag && (
        <Dialog open={!!editingTag} onOpenChange={() => setEditingTag(null)}>
          <DialogContent className="bg-slate-900 border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white">Edit Tag</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300">Display Name</Label>
                <Input
                  defaultValue={editingTag.display_name}
                  onChange={(e) => setEditingTag({ ...editingTag, display_name: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-slate-300">Color</Label>
                <Select
                  value={editingTag.color}
                  onValueChange={(value) => setEditingTag({ ...editingTag, color: value })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {colors.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: c.value }} />
                          {c.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => updateMutation.mutate({
                  tagId: editingTag.id,
                  displayName: editingTag.display_name,
                  color: editingTag.color
                })}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Update Tag
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}