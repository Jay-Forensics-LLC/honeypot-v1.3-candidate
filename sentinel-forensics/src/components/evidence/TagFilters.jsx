import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, X, Tag as TagIcon } from 'lucide-react';

export default function TagFilters({ caseId, onFilterChange }) {
  const [selectedTags, setSelectedTags] = useState([]);
  const [matchMode, setMatchMode] = useState('ANY'); // ANY or ALL
  const [excludeTags, setExcludeTags] = useState([]);

  const { data: tags = [] } = useQuery({
    queryKey: ['tags', caseId],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('tagManagement', {
        action: 'list',
        caseId
      });
      return data.tags || [];
    }
  });

  const handleTagToggle = (tagId) => {
    const newSelected = selectedTags.includes(tagId)
      ? selectedTags.filter(id => id !== tagId)
      : [...selectedTags, tagId];
    
    setSelectedTags(newSelected);
    onFilterChange?.({
      tags: newSelected,
      matchMode,
      excludeTags
    });
  };

  const handleExcludeToggle = (tagId) => {
    const newExcluded = excludeTags.includes(tagId)
      ? excludeTags.filter(id => id !== tagId)
      : [...excludeTags, tagId];
    
    setExcludeTags(newExcluded);
    onFilterChange?.({
      tags: selectedTags,
      matchMode,
      excludeTags: newExcluded
    });
  };

  const handleClearFilters = () => {
    setSelectedTags([]);
    setExcludeTags([]);
    onFilterChange?.({
      tags: [],
      matchMode,
      excludeTags: []
    });
  };

  const activeFilterCount = selectedTags.length + excludeTags.length;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-white flex items-center gap-2">
            <TagIcon className="w-5 h-5 text-blue-400" />
            Tag Filters
            {activeFilterCount > 0 && (
              <Badge className="bg-blue-500/20 text-blue-300">
                {activeFilterCount}
              </Badge>
            )}
          </CardTitle>
          {activeFilterCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClearFilters}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-slate-400 mb-2">Match Mode</p>
          <Select
            value={matchMode}
            onValueChange={(value) => {
              setMatchMode(value);
              onFilterChange?.({
                tags: selectedTags,
                matchMode: value,
                excludeTags
              });
            }}
          >
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Match ANY (OR)</SelectItem>
              <SelectItem value="ALL">Match ALL (AND)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {tags.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">No tags available</p>
        ) : (
          <>
            <div>
              <p className="text-sm text-slate-400 mb-2">Include Tags</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const isSelected = selectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleTagToggle(tag.id)}
                      disabled={excludeTags.includes(tag.id)}
                    >
                      <Badge
                        style={{
                          backgroundColor: isSelected ? tag.color : tag.color + '20',
                          color: isSelected ? 'white' : tag.color,
                          borderColor: tag.color + '50',
                          opacity: excludeTags.includes(tag.id) ? 0.5 : 1
                        }}
                        className="cursor-pointer hover:opacity-80"
                      >
                        {tag.display_name}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm text-slate-400 mb-2">Exclude Tags</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const isExcluded = excludeTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleExcludeToggle(tag.id)}
                      disabled={selectedTags.includes(tag.id)}
                    >
                      <Badge
                        style={{
                          backgroundColor: isExcluded ? '#EF4444' : tag.color + '20',
                          color: isExcluded ? 'white' : tag.color,
                          borderColor: isExcluded ? '#EF4444' : tag.color + '50',
                          opacity: selectedTags.includes(tag.id) ? 0.5 : 1
                        }}
                        className="cursor-pointer hover:opacity-80"
                      >
                        {isExcluded && <X className="w-3 h-3 mr-1" />}
                        {tag.display_name}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="pt-3 border-t border-slate-700">
          <p className="text-xs text-slate-500">
            <strong>Search tip:</strong> Use <code className="bg-slate-800 px-1 rounded">tag:name</code> in search bar
          </p>
        </div>
      </CardContent>
    </Card>
  );
}