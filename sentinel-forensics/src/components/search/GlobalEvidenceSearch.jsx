import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { useCaseContext } from '../navigation/CaseSelectorHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Hash, FileText, Calendar, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { debounce } from '../utils';
import { createPageUrl } from '../utils';
import { Link } from 'react-router-dom';

export default function GlobalEvidenceSearch() {
  const { data: user } = useUser();
  const { activeCaseId } = useCaseContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const handler = debounce(() => setDebouncedQuery(searchQuery), 300);
    handler();
  }, [searchQuery]);

  const { data: results = [], isLoading } = useQuery({
    queryKey: ['global-evidence-search', debouncedQuery, activeCaseId, user?.organization_id],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 3) return [];

      const query = {
        organization_id: user.organization_id
      };

      // Add case filter if active case is selected
      if (activeCaseId) {
        query.case_id = activeCaseId;
      }

      const allEvidence = await base44.entities.EvidenceV2.filter(query, '-created_date', 100);

      // Search logic
      const lowerQuery = debouncedQuery.toLowerCase();
      return allEvidence.filter(evidence => {
        // Search by hash (exact or partial)
        if (evidence.file_hash_sha256?.toLowerCase().includes(lowerQuery)) return true;
        if (evidence.file_hash_md5?.toLowerCase().includes(lowerQuery)) return true;
        
        // Search by title/description
        if (evidence.title?.toLowerCase().includes(lowerQuery)) return true;
        if (evidence.description?.toLowerCase().includes(lowerQuery)) return true;
        
        // Search by evidence number
        if (evidence.evidence_number?.toLowerCase().includes(lowerQuery)) return true;
        
        // Search by tags
        if (evidence.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))) return true;
        
        // Search by metadata
        if (evidence.metadata) {
          const metadataString = JSON.stringify(evidence.metadata).toLowerCase();
          if (metadataString.includes(lowerQuery)) return true;
        }
        
        return false;
      });
    },
    enabled: !!debouncedQuery && debouncedQuery.length >= 3 && !!user?.organization_id
  });

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Search className="w-5 h-5 text-blue-400" />
          Global Evidence Search
          {activeCaseId && (
            <Badge variant="outline" className="ml-2">
              Case-scoped
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by hash, filename, tags, metadata... (min 3 chars)"
            className="pl-10 bg-slate-800 border-slate-700 text-white"
          />
        </div>

        {isLoading && (
          <div className="text-center py-8 text-slate-300 font-medium">
            Searching...
          </div>
        )}

        {!isLoading && debouncedQuery.length >= 3 && results.length === 0 && (
          <div className="text-center py-8 text-slate-300 font-medium">
            No evidence found matching "{debouncedQuery}"
          </div>
        )}

        {!isLoading && results.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-slate-300 font-medium">
              Found {results.length} result{results.length !== 1 ? 's' : ''}
            </p>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {results.map((evidence) => (
                <Link
                  key={evidence.id}
                  to={createPageUrl('EvidenceDetail', { id: evidence.id })}
                  className="block"
                >
                  <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="bg-blue-500/20 text-blue-300 shrink-0">
                            {evidence.evidence_number}
                          </Badge>
                          {evidence.is_verified && (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          )}
                          {evidence.legal_hold && (
                            <Shield className="w-4 h-4 text-amber-400" />
                          )}
                          {evidence.risk_score > 70 && (
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                          )}
                        </div>
                        <h3 className="text-white font-medium truncate">{evidence.title}</h3>
                        <p className="text-sm text-slate-400 truncate">{evidence.description}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {evidence.evidence_type}
                      </span>
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {evidence.file_hash_sha256?.substring(0, 12)}...
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(evidence.collection_timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    
                    {evidence.tags?.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {evidence.tags.slice(0, 3).map((tag, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {evidence.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{evidence.tags.length - 3} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}