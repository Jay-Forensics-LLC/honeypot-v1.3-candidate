import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Hash, Plus, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// Tag normalization and deduplication
const normalizeTag = (tag) => {
  return tag.toLowerCase().trim().replace(/\s+/g, '_');
};

// Levenshtein distance for near-duplicate detection
const levenshteinDistance = (a, b) => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

// Tag bundles (quick presets)
const TAG_BUNDLES = {
  infrastructure: ['c2', 'infrastructure', 'malicious_ip', 'investigate'],
  c2_candidates: ['c2', 'suspicious', 'needs_review', 'high_priority'],
  investigate_later: ['low_priority', 'review_later', 'backlog'],
  confirmed_threat: ['confirmed', 'malicious', 'high_priority', 'escalate'],
  false_positive: ['false_positive', 'benign', 'allowlist']
};

export default function EvidenceTags({ evidenceId, canEdit = true }) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showBundles, setShowBundles] = useState(false);
  const inputRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: existingTags = [] } = useQuery({
    queryKey: ['evidence-tags', evidenceId],
    queryFn: async () => {
      const tags = await base44.entities.EvidenceTag.filter({ evidence_id: evidenceId });
      return tags;
    }
  });

  const { data: tagCatalog = [] } = useQuery({
    queryKey: ['tag-catalog'],
    queryFn: async () => {
      const allTags = await base44.entities.EvidenceTag.list();
      // Get unique tag names with usage count
      const tagMap = {};
      allTags.forEach(tag => {
        const normalized = normalizeTag(tag.tag_name);
        if (!tagMap[normalized]) {
          tagMap[normalized] = { name: tag.tag_name, count: 0, color: tag.color };
        }
        tagMap[normalized].count++;
      });
      return Object.values(tagMap).sort((a, b) => b.count - a.count);
    }
  });

  // Filter suggestions based on input
  const suggestions = inputValue.length > 0
    ? tagCatalog
        .filter(tag => 
          tag.name.toLowerCase().includes(inputValue.toLowerCase()) &&
          !existingTags.some(et => normalizeTag(et.tag_name) === normalizeTag(tag.name))
        )
        .slice(0, 10)
    : [];

  // Check for near-duplicates
  const checkNearDuplicate = (newTag) => {
    const normalized = normalizeTag(newTag);
    for (const existing of existingTags) {
      const existingNorm = normalizeTag(existing.tag_name);
      const distance = levenshteinDistance(normalized, existingNorm);
      if (distance <= 1 && distance > 0) {
        return existing.tag_name;
      }
    }
    return null;
  };

  const addTagMutation = useMutation({
    mutationFn: async (tagName) => {
      const normalized = normalizeTag(tagName);
      
      // Check if already exists
      if (existingTags.some(t => normalizeTag(t.tag_name) === normalized)) {
        throw new Error('Tag already exists');
      }

      // Check near-duplicate
      const nearDupe = checkNearDuplicate(tagName);
      if (nearDupe) {
        const confirm = window.confirm(
          `Tag "${tagName}" is similar to existing tag "${nearDupe}". Do you want to use "${nearDupe}" instead?`
        );
        if (confirm) {
          return null; // Don't add, user will use existing
        }
      }

      return await base44.entities.EvidenceTag.create({
        evidence_id: evidenceId,
        tag_name: tagName,
        tag_category: 'custom',
        color: getRandomTagColor(),
        auto_generated: false
      });
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['evidence-tags', evidenceId] });
        queryClient.invalidateQueries({ queryKey: ['tag-catalog'] });
        setInputValue('');
        setShowSuggestions(false);
        toast.success('Tag added');
        
        // Telemetry
        window.sfTrack?.('tag_added', {
          evidence_id: evidenceId,
          tag_name: data.tag_name,
          user: user?.email
        });
      }
    },
    onError: (error) => {
      if (error.message !== 'Tag already exists') {
        toast.error('Failed to add tag');
      }
    }
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId) => {
      return await base44.entities.EvidenceTag.delete(tagId);
    },
    onSuccess: (_, tagId) => {
      queryClient.invalidateQueries({ queryKey: ['evidence-tags', evidenceId] });
      toast.success('Tag removed');
      
      // Telemetry
      window.sfTrack?.('tag_removed', {
        evidence_id: evidenceId,
        tag_id: tagId,
        user: user?.email
      });
    },
    onError: () => {
      toast.error('Failed to remove tag');
    }
  });

  const addTagBundle = async (bundleName) => {
    const tags = TAG_BUNDLES[bundleName];
    for (const tag of tags) {
      if (!existingTags.some(t => normalizeTag(t.tag_name) === normalizeTag(tag))) {
        await addTagMutation.mutateAsync(tag);
      }
    }
    setShowBundles(false);
    toast.success(`Added "${bundleName}" bundle`);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        addTagMutation.mutate(suggestions[selectedIndex].name);
      } else {
        addTagMutation.mutate(inputValue.trim());
      }
    } else if (e.key === 'Backspace' && !inputValue && existingTags.length > 0) {
      e.preventDefault();
      removeTagMutation.mutate(existingTags[existingTags.length - 1].id);
    } else if (e.key === 'ArrowDown' && showSuggestions) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && showSuggestions) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    } else if (e.key === '#') {
      setShowSuggestions(true);
    }
  };

  const getRandomTagColor = () => {
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const canUserEdit = canEdit && user && ['admin', 'editor'].includes(user.role);

  return (
    <div className="space-y-4">
      {/* Tag Chips */}
      <div 
        className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-slate-800/30 rounded-lg border border-slate-700"
        role="list"
        aria-label="Evidence tags"
      >
        {existingTags.length === 0 && (
          <p className="text-sm text-slate-400 italic flex items-center gap-2">
            <Hash className="w-4 h-4" />
            {canUserEdit ? 'Use # to add tags or choose a bundle' : 'No tags yet'}
          </p>
        )}
        
        {existingTags.map((tag) => (
          <Badge
            key={tag.id}
            className="flex items-center gap-2 px-3 py-1.5 text-sm"
            style={{ backgroundColor: tag.color || '#3b82f6' }}
            role="listitem"
          >
            <span>{tag.tag_name}</span>
            {canUserEdit && (
              <button
                onClick={() => removeTagMutation.mutate(tag.id)}
                className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                aria-label={`Remove tag ${tag.tag_name}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
            <span className="text-xs opacity-70 ml-1 border-l pl-2 border-white/20">
              {tag.created_by?.split('@')[0]} · {formatDistanceToNow(new Date(tag.created_date))} ago
            </span>
          </Badge>
        ))}
      </div>

      {/* Input + Actions */}
      {canUserEdit && (
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setShowSuggestions(e.target.value.length > 0);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => inputValue.length > 0 && setShowSuggestions(true)}
              placeholder="Type tag name or press # for suggestions..."
              className="bg-slate-800 border-slate-700 text-white"
              aria-label="Add new tag"
              aria-autocomplete="list"
              aria-controls="tag-suggestions"
              aria-expanded={showSuggestions}
            />
            
            {/* Suggestions Popover */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                id="tag-suggestions"
                role="listbox"
                className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto"
              >
                {suggestions.map((suggestion, idx) => (
                  <div
                    key={idx}
                    role="option"
                    aria-selected={idx === selectedIndex}
                    className={`px-4 py-2 cursor-pointer transition-colors ${
                      idx === selectedIndex ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                    }`}
                    onClick={() => {
                      addTagMutation.mutate(suggestion.name);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span>{suggestion.name}</span>
                      <span className="text-xs opacity-70">Used {suggestion.count}×</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Popover open={showBundles} onOpenChange={setShowBundles}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="border-slate-700">
                <TagIcon className="w-4 h-4 mr-2" />
                Bundles
              </Button>
            </PopoverTrigger>
            <PopoverContent className="bg-slate-800 border-slate-700 w-80">
              <div className="space-y-2">
                <h4 className="font-semibold text-white mb-3">Tag Bundles</h4>
                {Object.entries(TAG_BUNDLES).map(([name, tags]) => (
                  <div
                    key={name}
                    className="p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors"
                    onClick={() => addTagBundle(name)}
                  >
                    <p className="font-medium text-white capitalize mb-1">
                      {name.replace(/_/g, ' ')}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            onClick={() => inputValue.trim() && addTagMutation.mutate(inputValue.trim())}
            disabled={!inputValue.trim() || addTagMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>
        </div>
      )}
    </div>
  );
}