import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Search,
  RefreshCw,
  Loader2,
  ExternalLink,
  TrendingUp
} from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';
import { toast } from 'sonner';

export default function ThreatIntelligencePanel({ caseId, compact = false }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterThreat, setFilterThreat] = useState('all');
  const queryClient = useQueryClient();

  const { data: iocs = [], isLoading } = useQuery({
    queryKey: ['iocs', caseId],
    queryFn: () => base44.entities.IOCIndicator.filter({ case_id: caseId }, '-confidence_score')
  });

  const { data: enrichments = [] } = useQuery({
    queryKey: ['enrichments', caseId],
    queryFn: async () => {
      // Get all evidence for case
      const evidence = await base44.entities.EvidenceV2.filter({ case_id: caseId });
      const evidenceIds = evidence.map(e => e.id);
      
      if (evidenceIds.length === 0) return [];
      
      // Get enrichments for all evidence
      const allEnrichments = [];
      for (const evidenceId of evidenceIds) {
        const results = await base44.entities.EnrichmentResult.filter({ evidence_id: evidenceId });
        allEnrichments.push(...results);
      }
      return allEnrichments;
    }
  });

  const enrichMutation = useMutation({
    mutationFn: async (evidenceId) => {
      const response = await base44.functions.invoke('enrichEvidence', { evidence_id: evidenceId });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['iocs', caseId] });
      queryClient.invalidateQueries({ queryKey: ['enrichments', caseId] });
      toast.success(`Found ${data.threats_detected} threats in ${data.iocs_extracted} IOCs`);
    },
    onError: () => {
      toast.error('Enrichment failed');
    }
  });

  const getTypeIcon = (type) => {
    const icons = {
      file_hash: Shield,
      ip_address: TrendingUp,
      domain: ExternalLink,
      url: ExternalLink,
      email: '@'
    };
    return icons[type] || Shield;
  };

  const getThreatColor = (classification) => {
    const colors = {
      malicious: 'bg-red-500/20 text-red-400 border-red-500/50',
      suspicious: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      benign: 'bg-green-500/20 text-green-400 border-green-500/50',
      unknown: 'bg-slate-500/20 text-slate-400 border-slate-500/50'
    };
    return colors[classification] || colors.unknown;
  };

  const filteredIOCs = iocs.filter(ioc => {
    const matchesSearch = searchTerm === '' || 
      ioc.indicator_value.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ioc.threat_names?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesType = filterType === 'all' || ioc.indicator_type === filterType;
    const matchesThreat = filterThreat === 'all' || ioc.threat_classification === filterThreat;

    return matchesSearch && matchesType && matchesThreat;
  });

  const stats = {
    total: iocs.length,
    malicious: iocs.filter(i => i.threat_classification === 'malicious').length,
    suspicious: iocs.filter(i => i.threat_classification === 'suspicious').length,
    enrichments: enrichments.length
  };

  if (compact) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">Threat Intelligence</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-red-400">{stats.malicious}</p>
              <p className="text-xs text-slate-500">Malicious</p>
            </div>
            <div>
              <p className="text-xl font-bold text-yellow-400">{stats.suspicious}</p>
              <p className="text-xs text-slate-500">Suspicious</p>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-400">{stats.total}</p>
              <p className="text-xs text-slate-500">Total IOCs</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Threat Intelligence ({stats.total} IOCs)
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Statistics */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-white">{stats.total}</p>
            <p className="text-xs text-slate-400">Total IOCs</p>
          </div>
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{stats.malicious}</p>
            <p className="text-xs text-red-300">Malicious</p>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{stats.suspicious}</p>
            <p className="text-xs text-yellow-300">Suspicious</p>
          </div>
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{stats.enrichments}</p>
            <p className="text-xs text-blue-300">Enrichments</p>
          </div>
        </div>

        {/* Filters */}
        <div className="grid md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search IOCs..."
              className="pl-10 bg-slate-800 border-slate-700"
            />
          </div>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="bg-slate-800 border-slate-700">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-white">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="file_hash">File Hashes</SelectItem>
              <SelectItem value="ip_address">IP Addresses</SelectItem>
              <SelectItem value="domain">Domains</SelectItem>
              <SelectItem value="url">URLs</SelectItem>
              <SelectItem value="email">Emails</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterThreat} onValueChange={setFilterThreat}>
            <SelectTrigger className="bg-slate-800 border-slate-700">
              <SelectValue placeholder="Filter by threat" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-white">
              <SelectItem value="all">All Threats</SelectItem>
              <SelectItem value="malicious">Malicious Only</SelectItem>
              <SelectItem value="suspicious">Suspicious Only</SelectItem>
              <SelectItem value="benign">Benign Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* IOC List */}
        {filteredIOCs.length === 0 ? (
          <div className="text-center py-8">
            <Shield className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400">No IOCs found</p>
            <p className="text-sm text-slate-500 mt-2">
              Upload evidence to automatically extract and enrich IOCs
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredIOCs.map((ioc) => {
              const Icon = getTypeIcon(ioc.indicator_type);

              return (
                <Card key={ioc.id} className="bg-slate-800/50 border-slate-700 hover:border-blue-500/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 text-blue-400" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-white font-mono text-sm truncate">
                              {ioc.indicator_value}
                            </p>
                            <Badge className={getThreatColor(ioc.threat_classification)}>
                              {ioc.threat_classification}
                            </Badge>
                            <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">
                              {ioc.indicator_type.replace('_', ' ')}
                            </Badge>
                          </div>

                          {ioc.threat_names?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {ioc.threat_names.slice(0, 3).map((name, idx) => (
                                <Badge key={idx} className="bg-red-500/20 text-red-300 text-xs">
                                  {name}
                                </Badge>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center gap-4 text-xs text-slate-400">
                            <span>Confidence: {ioc.confidence_score}%</span>
                            <span>First seen: {DateUtils.safeRelativeTime(ioc.first_seen)}</span>
                            <span>{ioc.sources?.length || 0} sources</span>
                          </div>

                          {ioc.mitre_techniques?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {ioc.mitre_techniques.map((tech, idx) => (
                                <Badge key={idx} variant="outline" className="border-purple-500/50 text-purple-300 text-xs">
                                  {tech}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}