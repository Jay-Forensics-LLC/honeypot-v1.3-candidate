import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tag as TagIcon, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

export default function EvidenceTagging({ evidenceId, caseId }) {
  const queryClient = useQueryClient();
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Get current evidence tags
  const { data: currentTags = [] } = useQuery({
    queryKey: ['evidence-tags', evidenceId],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('evidenceTagging', {
        action: 'get',
        evidenceId
      });
      return data.tags || [];
    }
  });

  // Get all available tags
  const { data: allTags = [] } = useQuery({
    queryKey: ['tags', caseId],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('tagManagement', {
        action: 'list',
        caseId
      });
      return data.tags || [];
    }
  });

  const applyMutation = useMutation({
    mutationFn: async (tagIds) => {
      await base44.functions.invoke('evidenceTagging', {
        action: 'apply',
        evidenceId,
        tagIds
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-tags', evidenceId] });
      toast.success('Tags applied');
    }
  });

  const removeMutation = useMutation({
    mutationFn: async (tagIds) => {
      await base44.functions.invoke('evidenceTagging', {
        action: 'remove',
        evidenceId,
        tagIds
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-tags', evidenceId] });
      toast.success('Tag removed');
    }
  });

  const currentTagIds = currentTags.map(t => t.id);
  const availableTags = allTags.filter(t => 
    !currentTagIds.includes(t.id) &&
    (!searchTerm || t.display_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Tags (User Metadata)</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowTagDialog(true)}
            className="text-blue-400 hover:text-blue-300"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add
          </Button>
        </div>

        {currentTags.length === 0 ? (
          <p className="text-xs text-slate-500">No tags applied</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {currentTags.map((tag) => (
              <Badge
                key={tag.id}
                style={{
                  backgroundColor: tag.color + '20',
                  color: tag.color,
                  borderColor: tag.color + '50'
                }}
                className="flex items-center gap-1"
              >
                {tag.display_name}
                <button
                  onClick={() => removeMutation.mutate([tag.id])}
                  className="ml-1 hover:opacity-70"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-500">
          Tags are user-applied metadata and do not modify evidence integrity
        </p>
      </div>

      <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <TagIcon className="w-5 h-5 text-blue-400" />
              Apply Tags
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              placeholder="Search tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
            />

            <div className="max-h-64 overflow-y-auto space-y-2">
              {availableTags.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">
                  {searchTerm ? 'No matching tags' : 'No available tags'}
                </p>
              ) : (
                availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => {
                      applyMutation.mutate([tag.id]);
                      setShowTagDialog(false);
                      setSearchTerm('');
                    }}
                    className="w-full flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Badge
                      style={{
                        backgroundColor: tag.color + '20',
                        color: tag.color,
                        borderColor: tag.color + '50'
                      }}
                    >
                      {tag.display_name}
                    </Badge>
                    <span className="text-xs text-slate-500">{tag.scope}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}