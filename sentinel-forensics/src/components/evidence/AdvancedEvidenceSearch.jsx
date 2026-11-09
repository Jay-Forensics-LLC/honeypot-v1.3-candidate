import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, FileText, Hash, Calendar, HelpCircle, Eye } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DateUtils } from '../utils/DateUtils';
import { createPageUrl } from '../utils';
import { toast } from 'sonner';

export default function AdvancedEvidenceSearch({ caseId }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [caseScope, setCaseScope] = useState('ACTIVE_CASE');
  const [results, setResults] = useState(null);

  const searchMutation = useMutation({
    mutationFn: async ({ searchTerm, caseScope }) => {
      const { data } = await base44.functions.invoke('searchEvidence', {
        searchTerm,
        caseId: caseScope === 'ACTIVE_CASE' ? caseId : null,
        caseScope
      });
      return data;
    },
    onSuccess: (data) => {
      setResults(data);
      toast.success(`Found ${data.evidence?.length || 0} results`);
    },
    onError: (error) => {
      toast.error('Search failed', {
        description: error.message
      });
    }
  });

  const handleSearch = () => {
    if (!searchTerm.trim()) {
      toast.error('Please enter a search term');
      return;
    }
    searchMutation.mutate({ searchTerm, caseScope });
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Search className="w-5 h-5 text-blue-400" />
          Advanced Evidence Search
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-4 h-4 text-slate-500 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="bg-slate-800 border-slate-700 text-white max-w-sm">
                <div className="space-y-2 text-xs">
                  <p><strong>Tag Search Examples:</strong></p>
                  <p><code className="bg-slate-900 px-1 rounded">tag:apt</code> - Find evidence with "apt" tag</p>
                  <p><code className="bg-slate-900 px-1 rounded">tag:"wifi mitm"</code> - Multi-word tags (quoted)</p>
                  <p><code className="bg-slate-900 px-1 rounded">tag:apt tag:ble</code> - Multiple tags (AND/OR based on filter)</p>
                  <p className="mt-2"><strong>Text Search:</strong></p>
                  <p>Search across evidence titles and descriptions</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search evidence... Try: tag:apt or tag:&quot;wifi mitm&quot;"
            className="bg-slate-800 border-slate-700 text-white flex-1"
          />
          <Select value={caseScope} onValueChange={setCaseScope}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE_CASE">This Case</SelectItem>
              <SelectItem value="ALL_CASES">All Cases</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleSearch}
            disabled={searchMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {searchMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>

        {results?.parsedTags && results.parsedTags.length > 0 && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-xs text-blue-200 mb-2">Detected tag queries:</p>
            <div className="flex flex-wrap gap-2">
              {results.parsedTags.map((tag, idx) => (
                <Badge key={idx} className="bg-blue-500/20 text-blue-300">
                  tag:{tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {results && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">
                Found {results.count} result{results.count !== 1 ? 's' : ''}
              </p>
            </div>

            {results.evidence?.length === 0 ? (
              <div className="text-center py-8">
                <Search className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p className="text-slate-400">No evidence found matching your search</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {results.evidence?.map((item) => (
                  <Card key={item.id} className="bg-slate-800/50 border-slate-700 hover:border-blue-500/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h4 className="text-white font-medium mb-1">{item.title}</h4>
                          <p className="text-xs text-slate-400 mb-2 line-clamp-2">{item.description}</p>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <Badge className="bg-purple-500/20 text-purple-300">
                              {item.evidence_type}
                            </Badge>
                            <span className="text-slate-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {DateUtils.safeFormatDate(item.collection_timestamp || item.created_date)}
                            </span>
                            <span className="text-slate-500 flex items-center gap-1 font-mono">
                              <Hash className="w-3 h-3" />
                              {item.sha256_hash?.substring(0, 12)}...
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => window.location.href = createPageUrl(`EvidenceDetail/${item.id}`)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}