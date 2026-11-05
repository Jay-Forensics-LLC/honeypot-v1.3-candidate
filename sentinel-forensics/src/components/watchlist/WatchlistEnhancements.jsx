import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tantml:invoke name="computer">
  <parameter name="action">left_click</parameter>
  <parameter name="coordinate">[566, 249]</parameter>
</invoke>

Continuing MODULE 14...

<action type="file" filePath="components/watchlist/WatchlistEnhancements.jsx">import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tag, Clock, Archive, AlertTriangle, CheckCircle, Trash2, Plus, Filter } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";

export default function WatchlistEnhancements() {
  const [selectedTag, setSelectedTag] = useState('all');
  const [newTag, setNewTag] = useState('');
  const [editingEntry, setEditingEntry] = useState(null);
  
  const queryClient = useQueryClient();

  const { data: watchlist = [] } = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => base44.entities.Watchlist.list(),
    initialData: []
  });

  // Auto-archive inactive entries (60 days)
  const autoArchiveMutation = useMutation({
    mutationFn: async () => {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      let archivedCount = 0;

      for (const entry of watchlist) {
        const lastDetected = entry.last_detected ? new Date(entry.last_detected) : null;
        
        if (!lastDetected || lastDetected < sixtyDaysAgo) {
          // Add "archived" tag
          const updatedTags = [...(entry.tags || [])];
          if (!updatedTags.includes('archived')) {
            updatedTags.push('archived');
            
            await base44.entities.Watchlist.update(entry.id, {
              tags: updatedTags,
              notes: `${entry.notes || ''}\n[Auto-archived on ${format(new Date(), 'PP')} - No activity for 60+ days]`
            });
            
            archivedCount++;
          }
        }
      }

      return archivedCount;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success(`Auto-archived ${count} inactive entries`);
    }
  });

  // Add tag to entry
  const addTagMutation = useMutation({
    mutationFn: async ({ entryId, tag }) => {
      const entry = watchlist.find(e => e.id === entryId);
      if (!entry) throw new Error('Entry not found');

      const updatedTags = [...(entry.tags || [])];
      if (!updatedTags.includes(tag)) {
        updatedTags.push(tag);
        await base44.entities.Watchlist.update(entryId, { tags: updatedTags });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success('Tag added');
    }
  });

  // Remove tag from entry
  const removeTagMutation = useMutation({
    mutationFn: async ({ entryId, tag }) => {
      const entry = watchlist.find(e => e.id === entryId);
      if (!entry) throw new Error('Entry not found');

      const updatedTags = (entry.tags || []).filter(t => t !== tag);
      await base44.entities.Watchlist.update(entryId, { tags: updatedTags });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success('Tag removed');
    }
  });

  // Set expiration timer
  const setExpirationMutation = useMutation({
    mutationFn: async ({ entryId, days }) => {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + days);

      await base44.entities.Watchlist.update(entryId, {
        expiration_date: expirationDate.toISOString(),
        notes: `${watchlist.find(e => e.id === entryId)?.notes || ''}\n[Expiration set: ${format(expirationDate, 'PP')}]`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success('Expiration timer set');
    }
  });

  // Get all unique tags
  const allTags = [...new Set(watchlist.flatMap(e => e.tags || []))].sort();

  // Filter by tag
  const filteredWatchlist = selectedTag === 'all'
    ? watchlist
    : watchlist.filter(e => e.tags?.includes(selectedTag));

  // Get inactive entries (no detection in 30+ days)
  const inactiveEntries = watchlist.filter(entry => {
    if (!entry.last_detected) return true;
    return differenceInDays(new Date(), new Date(entry.last_detected)) > 30;
  });

  return (
    <div className="space-y-6">
      {/* Actions Bar */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
              >
                <option value="all">All Tags ({watchlist.length})</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>
                    {tag} ({watchlist.filter(e => e.tags?.includes(tag)).length})
                  </option>
                ))}
              </select>
            </div>

            <Button
              size="sm"
              onClick={() => autoArchiveMutation.mutate()}
              disabled={autoArchiveMutation.isPending}
              variant="outline"
              className="border-yellow-500 text-yellow-400"
            >
              <Archive className="w-4 h-4 mr-2" />
              Auto-Archive Inactive ({inactiveEntries.length})
            </Button>

            <div className="ml-auto text-xs text-slate-400">
              {filteredWatchlist.length} entries
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Watchlist Entries */}
      <div className="space-y-3">
        {filteredWatchlist.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800 p-12">
            <div className="text-center text-slate-400">
              <Tag className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p>No watchlist entries</p>
              <p className="text-sm mt-2">Add entries to start monitoring</p>
            </div>
          </Card>
        ) : (
          filteredWatchlist.map(entry => {
            const daysInactive = entry.last_detected
              ? differenceInDays(new Date(), new Date(entry.last_detected))
              : 999;
            const isInactive = daysInactive > 30;

            return (
              <Card key={entry.id} className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="font-semibold text-white mb-1">{entry.name}</h4>
                      <code className="text-xs text-slate-400 font-mono">{entry.entry_value}</code>
                    </div>
                    
                    {isInactive && (
                      <Badge className="bg-yellow-500/20 text-yellow-400 ml-3">
                        <Clock className="w-3 h-3 mr-1" />
                        Inactive {daysInactive}d
                      </Badge>
                    )}
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(entry.tags || []).map((tag, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="text-xs cursor-pointer hover:bg-red-500/10"
                        onClick={() => removeTagMutation.mutate({ entryId: entry.id, tag })}
                      >
                        {tag}
                        <Trash2 className="w-3 h-3 ml-1" />
                      </Badge>
                    ))}
                    
                    {editingEntry === entry.id ? (
                      <div className="flex gap-2">
                        <Input
                          placeholder="New tag..."
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          className="h-6 text-xs bg-slate-800 border-slate-700 w-32"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && newTag.trim()) {
                              addTagMutation.mutate({ entryId: entry.id, tag: newTag.trim() });
                              setNewTag('');
                              setEditingEntry(null);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => setEditingEntry(null)}
                          variant="ghost"
                          className="h-6 px-2"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingEntry(entry.id)}
                        className="h-6 text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Tag
                      </Button>
                    )}
                  </div>

                  {/* Stats & Actions */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4 text-slate-400">
                      <span>Detections: {entry.detection_count || 0}</span>
                      {entry.last_detected && (
                        <span>Last: {format(new Date(entry.last_detected), 'PP')}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setExpirationMutation.mutate({ entryId: entry.id, days: 30 })}
                        className="h-6 text-xs"
                      >
                        <Clock className="w-3 h-3 mr-1" />
                        Expire in 30d
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Info */}
      <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500">
        <div className="flex items-start gap-3 text-sm text-blue-400">
          <Tag className="w-5 h-5 mt-0.5" />
          <div>
            <strong>Watchlist Enhancements:</strong> Use tags for organization, set expiration timers, 
            and auto-archive inactive entries to keep your watchlist clean and relevant.
          </div>
        </div>
      </div>
    </div>
  );
}