import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Tag as TagIcon } from 'lucide-react';

export default function EvidenceTagPreview({ evidenceId }) {
  const { data: tags = [] } = useQuery({
    queryKey: ['evidence-tags', evidenceId],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('evidenceTagging', {
        action: 'get',
        evidenceId
      });
      return data.tags || [];
    },
    enabled: !!evidenceId,
    staleTime: 30000
  });

  if (tags.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        <TagIcon className="w-3 h-3 inline mr-1" />
        No tags applied
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="text-xs text-slate-500 flex items-center mr-1">
        <TagIcon className="w-3 h-3 mr-1" />
        Tags:
      </span>
      {tags.slice(0, 3).map((tag) => (
        <Badge
          key={tag.id}
          style={{
            backgroundColor: tag.color + '20',
            color: tag.color,
            borderColor: tag.color + '50',
            fontSize: '10px'
          }}
        >
          {tag.display_name}
        </Badge>
      ))}
      {tags.length > 3 && (
        <Badge className="bg-slate-700 text-slate-300" style={{ fontSize: '10px' }}>
          +{tags.length - 3}
        </Badge>
      )}
    </div>
  );
}