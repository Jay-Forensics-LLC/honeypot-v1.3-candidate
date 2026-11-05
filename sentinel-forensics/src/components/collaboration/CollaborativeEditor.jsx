import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Save, History, Users as UsersIcon, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { debounce } from '../utils';

export default function CollaborativeEditor({ workProductId }) {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [lastSaved, setLastSaved] = useState(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editingUsers, setEditingUsers] = useState([]);

  const { data: workProduct } = useQuery({
    queryKey: ['work-product', workProductId],
    queryFn: async () => {
      const docs = await base44.entities.AttorneyWorkProduct.filter({ id: workProductId });
      return docs[0];
    },
    enabled: !!workProductId,
    refetchInterval: 5000,
    onSuccess: (data) => {
      if (data && !hasUnsavedChanges) {
        setContent(data.content || '');
      }
    }
  });

  const { data: versions = [] } = useQuery({
    queryKey: ['document-versions', workProductId],
    queryFn: () => base44.entities.DocumentVersion.filter({ work_product_id: workProductId }, '-version_number', 50),
    enabled: !!workProductId
  });

  const saveMutation = useMutation({
    mutationFn: async ({ content, createVersion }) => {
      const updated = await base44.entities.AttorneyWorkProduct.update(workProductId, { content });
      
      if (createVersion) {
        const versionNumber = versions.length + 1;
        await base44.entities.DocumentVersion.create({
          organization_id: user.organization_id,
          work_product_id: workProductId,
          version_number: versionNumber,
          content,
          author_email: user.email,
          author_name: user.full_name || user.email,
          content_hash: await hashContent(content)
        });
      }
      
      return updated;
    },
    onSuccess: () => {
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries(['work-product']);
      queryClient.invalidateQueries(['document-versions']);
    }
  });

  const hashContent = async (text) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const debouncedAutoSave = useCallback(
    debounce((newContent) => {
      saveMutation.mutate({ content: newContent, createVersion: false });
    }, 3000),
    [workProductId]
  );

  const handleContentChange = (newContent) => {
    setContent(newContent);
    setHasUnsavedChanges(true);
    debouncedAutoSave(newContent);
  };

  const handleManualSave = () => {
    saveMutation.mutate({ content, createVersion: true });
    toast.success('Document saved with new version');
  };

  const restoreVersion = async (version) => {
    setContent(version.content);
    setHasUnsavedChanges(true);
    toast.success(`Restored version ${version.version_number}`);
    setShowVersionHistory(false);
  };

  useEffect(() => {
    if (workProduct) {
      setContent(workProduct.content || '');
    }
  }, [workProduct]);

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              {workProduct?.title || 'Untitled Document'}
              {hasUnsavedChanges && (
                <Badge variant="outline" className="text-yellow-400 border-yellow-400">
                  Unsaved
                </Badge>
              )}
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowVersionHistory(true)}>
                <History className="w-4 h-4 mr-2" />
                History ({versions.length})
              </Button>
              <Button size="sm" onClick={handleManualSave} disabled={!hasUnsavedChanges}>
                <Save className="w-4 h-4 mr-2" />
                Save Version
              </Button>
            </div>
          </div>
          {lastSaved && (
            <p className="text-xs text-slate-400 mt-2">
              Last saved: {lastSaved.toLocaleTimeString()}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <Card className="bg-amber-900/20 border-amber-500/50 mb-4">
            <CardContent className="p-3">
              <div className="flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-amber-200 text-xs">
                  This document is protected by attorney-client privilege. Auto-save is active. 
                  Click "Save Version" to create a snapshot in version history.
                </p>
              </div>
            </CardContent>
          </Card>

          <Textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="bg-slate-800 border-slate-700 text-white min-h-[500px] font-mono"
            placeholder="Enter attorney work product content..."
          />
        </CardContent>
      </Card>

      <Dialog open={showVersionHistory} onOpenChange={setShowVersionHistory}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-white">Version History</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {versions.map((version) => (
              <div key={version.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <Badge>Version {version.version_number}</Badge>
                    <p className="text-sm text-slate-300 mt-1">
                      {version.author_name} • {new Date(version.created_date).toLocaleString()}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => restoreVersion(version)}>
                    Restore
                  </Button>
                </div>
                <p className="text-xs text-slate-400 font-mono truncate">
                  Hash: {version.content_hash}
                </p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}