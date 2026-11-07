import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Shield, Mail, Globe, Link2, FileText, Smartphone } from 'lucide-react';
import { format } from 'date-fns';

const typeIcons = {
  ip: Shield,
  email: Mail,
  domain: Globe,
  url: Link2,
  hash_sha256: FileText,
  device_id: Smartphone,
  user_agent: Smartphone,
  custom: FileText
};

const typeColors = {
  ip: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  email: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  domain: 'bg-green-500/20 text-green-400 border-green-500/30',
  url: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  hash_sha256: 'bg-red-500/20 text-red-400 border-red-500/30',
  device_id: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  user_agent: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  custom: 'bg-slate-500/20 text-slate-400 border-slate-500/30'
};

export default function IndicatorTable({ indicators, caseId }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = indicators.filter(ind => {
    const matchesSearch = ind.value.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || ind.indicator_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const types = [...new Set(indicators.map(i => i.indicator_type))];

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white">Indicators</CardTitle>
          <div className="flex items-center gap-2">
            {['all', ...types].map(type => (
              <Badge
                key={type}
                className={`cursor-pointer ${
                  typeFilter === type
                    ? 'bg-[#EF4444] text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
                onClick={() => setTypeFilter(type)}
              >
                {type === 'all' ? 'All' : type}
              </Badge>
            ))}
          </div>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search indicators..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-slate-800 border-slate-700 text-white"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400">No indicators found</p>
              <p className="text-sm text-slate-500 mt-1">
                Click "Extract Indicators" to start
              </p>
            </div>
          ) : (
            filtered.map((indicator) => {
              const Icon = typeIcons[indicator.indicator_type] || FileText;
              return (
                <div
                  key={indicator.id}
                  className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Icon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-mono text-sm truncate">
                        {indicator.value}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={typeColors[indicator.indicator_type]}>
                          {indicator.indicator_type}
                        </Badge>
                        {indicator.derived_from?.source_event_ids?.length > 0 && (
                          <span className="text-xs text-slate-500">
                            {indicator.derived_from.source_event_ids.length} events
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-xs text-slate-400">
                      First: {format(new Date(indicator.first_seen_at), 'MMM d, HH:mm')}
                    </p>
                    <p className="text-xs text-slate-400">
                      Last: {format(new Date(indicator.last_seen_at), 'MMM d, HH:mm')}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}