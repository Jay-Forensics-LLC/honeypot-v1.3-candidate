import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, FileText, Shield, AlertTriangle, Database, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function UnifiedSearch({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const { data: results, isLoading } = useQuery({
    queryKey: ['unified-search', query, filter],
    queryFn: async () => {
      if (query.length < 2) return { cases: [], alerts: [], devices: [], evidence: [] };

      const searches = [];
      
      if (filter === 'all' || filter === 'cases') {
        searches.push(
          base44.entities.Case.list('-created_date', 20).then(cases => 
            cases.filter(c => 
              c.case_number?.toLowerCase().includes(query.toLowerCase()) ||
              c.description?.toLowerCase().includes(query.toLowerCase())
            )
          ).catch(() => [])
        );
      } else {
        searches.push(Promise.resolve([]));
      }

      if (filter === 'all' || filter === 'alerts') {
        searches.push(
          base44.entities.Alert.list('-detection_timestamp', 20).then(alerts =>
            alerts.filter(a =>
              a.title?.toLowerCase().includes(query.toLowerCase()) ||
              a.description?.toLowerCase().includes(query.toLowerCase())
            )
          ).catch(() => [])
        );
      } else {
        searches.push(Promise.resolve([]));
      }

      if (filter === 'all' || filter === 'devices') {
        searches.push(
          base44.entities.Device.list('-last_seen_at', 20).then(devices =>
            devices.filter(d =>
              d.device_name?.toLowerCase().includes(query.toLowerCase()) ||
              d.ip_address?.toLowerCase().includes(query.toLowerCase())
            )
          ).catch(() => [])
        );
      } else {
        searches.push(Promise.resolve([]));
      }

      if (filter === 'all' || filter === 'evidence') {
        searches.push(
          base44.entities.EvidenceV2.list('-created_date', 20).then(evidence =>
            evidence.filter(e =>
              e.evidence_type?.toLowerCase().includes(query.toLowerCase()) ||
              e.description?.toLowerCase().includes(query.toLowerCase())
            )
          ).catch(() => [])
        );
      } else {
        searches.push(Promise.resolve([]));
      }

      const [cases, alerts, devices, evidence] = await Promise.all(searches);
      return { cases, alerts, devices, evidence };
    },
    enabled: query.length >= 2
  });

  const handleSelect = (type, id) => {
    if (type === 'case') navigate(createPageUrl(`CaseDetail/${id}`));
    else if (type === 'evidence') navigate(createPageUrl(`EvidenceDetail/${id}`));
    else if (type === 'alert') navigate(createPageUrl('AlertManagement'));
    else if (type === 'device') navigate(createPageUrl('Devices'));
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalResults = (results?.cases?.length || 0) + (results?.alerts?.length || 0) + 
                      (results?.devices?.length || 0) + (results?.evidence?.length || 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl p-0">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <Search className="w-5 h-5 text-slate-400" />
          <Input
            autoFocus
            placeholder="Search cases, alerts, devices, evidence..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 bg-transparent text-white placeholder:text-slate-500 focus-visible:ring-0"
          />
        </div>

        <div className="flex gap-2 px-4 py-2 border-b border-slate-800">
          {['all', 'cases', 'alerts', 'devices', 'evidence'].map(f => (
            <Badge
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setFilter(f)}
            >
              {f}
            </Badge>
          ))}
        </div>

        <div className="max-h-[400px] overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            </div>
          ) : query.length < 2 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              Type at least 2 characters to search
            </p>
          ) : totalResults === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No results found</p>
          ) : (
            <div className="space-y-4">
              {results.cases?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Cases ({results.cases.length})
                  </h3>
                  {results.cases.map(c => (
                    <div
                      key={c.id}
                      onClick={() => handleSelect('case', c.id)}
                      className="p-3 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer mb-2"
                    >
                      <p className="text-sm font-medium text-white">{c.case_number}</p>
                      <p className="text-xs text-slate-400">{c.status}</p>
                    </div>
                  ))}
                </div>
              )}

              {results.alerts?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Alerts ({results.alerts.length})
                  </h3>
                  {results.alerts.map(a => (
                    <div
                      key={a.id}
                      onClick={() => handleSelect('alert', a.id)}
                      className="p-3 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer mb-2"
                    >
                      <p className="text-sm font-medium text-white">{a.title}</p>
                      <Badge variant={a.severity === 'critical' ? 'destructive' : 'secondary'}>
                        {a.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {results.devices?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Devices ({results.devices.length})
                  </h3>
                  {results.devices.map(d => (
                    <div
                      key={d.id}
                      onClick={() => handleSelect('device', d.id)}
                      className="p-3 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer mb-2"
                    >
                      <p className="text-sm font-medium text-white">{d.device_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-400">{d.ip_address}</p>
                    </div>
                  ))}
                </div>
              )}

              {results.evidence?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Evidence ({results.evidence.length})
                  </h3>
                  {results.evidence.map(e => (
                    <div
                      key={e.id}
                      onClick={() => handleSelect('evidence', e.id)}
                      className="p-3 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer mb-2"
                    >
                      <p className="text-sm font-medium text-white">{e.evidence_type}</p>
                      <p className="text-xs text-slate-400">{e.status}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}