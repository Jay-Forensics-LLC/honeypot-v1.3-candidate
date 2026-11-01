import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, FileText, Database, Shield, Loader2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

/**
 * CRITICAL iOS FIX: Error-safe Global Search
 * Removes WebSocket, adds proper error handling
 */
export default function GlobalSearch({ onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const searchTimer = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [query]);

  const performSearch = async (searchQuery) => {
    setIsSearching(true);
    setError(null);
    
    try {
      const searchResults = [];

      // Search Cases
      try {
        const cases = await base44.entities.Case.filter(
          { case_number: { $regex: searchQuery, $options: 'i' } },
          '-created_date',
          5
        );
        cases.forEach(item => {
          searchResults.push({
            type: 'case',
            title: item.case_number || 'Untitled Case',
            description: item.title || 'No description',
            id: item.id,
            icon: FileText
          });
        });
      } catch (err) {
        console.warn('Case search failed:', err);
      }

      // Search Evidence
      try {
        const evidence = await base44.entities.EvidenceV2.filter(
          { title: { $regex: searchQuery, $options: 'i' } },
          '-created_date',
          5
        );
        evidence.forEach(item => {
          searchResults.push({
            type: 'evidence',
            title: item.title || 'Untitled Evidence',
            description: item.description || 'No description',
            id: item.id,
            icon: Database
          });
        });
      } catch (err) {
        console.warn('Evidence search failed:', err);
      }

      // Search Alerts
      try {
        const alerts = await base44.entities.Alert.filter(
          { title: { $regex: searchQuery, $options: 'i' } },
          '-detection_timestamp',
          5
        );
        alerts.forEach(item => {
          searchResults.push({
            type: 'alert',
            title: item.title || 'Untitled Alert',
            description: item.description || 'No description',
            id: item.id,
            severity: item.severity,
            icon: Shield
          });
        });
      } catch (err) {
        console.warn('Alert search failed:', err);
      }

      setResults(searchResults);
    } catch (err) {
      console.error('Search failed:', err);
      setError('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultClick = (result) => {
    let path = '/';
    
    switch (result.type) {
      case 'case':
        path = createPageUrl(`CaseDetail/${result.id}`);
        break;
      case 'evidence':
        path = createPageUrl(`EvidenceDetail/${result.id}`);
        break;
      case 'alert':
        path = createPageUrl('AlertManagement');
        break;
      default:
        path = createPageUrl('Dashboard');
    }

    navigate(path);
    if (onClose) onClose();
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          type="text"
          placeholder="Search cases, evidence, alerts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 pr-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
          autoFocus
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setQuery('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {error && (
        <Card className="bg-red-900/20 border-red-500/30">
          <CardContent className="p-3">
            <p className="text-red-200 text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {isSearching && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="ml-2 text-slate-400">Searching...</span>
        </div>
      )}

      {!isSearching && query.length >= 2 && results.length === 0 && (
        <div className="text-center py-8 text-slate-400">
          No results found for "{query}"
        </div>
      )}

      {!isSearching && results.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {results.map((result, index) => {
            const Icon = result.icon;
            return (
              <Card
                key={index}
                className="bg-slate-800/50 border-slate-700 hover:bg-slate-800 cursor-pointer transition-colors"
                onClick={() => handleResultClick(result)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-white truncate">{result.title}</p>
                        {result.severity && (
                          <Badge className={
                            result.severity === 'critical' ? 'bg-red-500' :
                            result.severity === 'high' ? 'bg-orange-500' :
                            result.severity === 'medium' ? 'bg-yellow-500' :
                            'bg-blue-500'
                          }>
                            {result.severity}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-400 truncate">{result.description}</p>
                      <Badge className="mt-2 bg-slate-700 text-slate-300">
                        {result.type}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}