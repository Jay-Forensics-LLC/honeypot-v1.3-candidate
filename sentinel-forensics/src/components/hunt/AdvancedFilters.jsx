import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Filter, X } from 'lucide-react';

export default function AdvancedFilters({ onApplyFilters }) {
  const [filters, setFilters] = useState({
    minRiskScore: 0,
    maxRiskScore: 100,
    minConfidence: 0,
    categories: [],
    severities: [],
    statuses: [],
    searchTerm: ''
  });

  const categories = ['unpatched_exposure', 'network_exposure', 'behavioral_drift', 'lateral_movement', 'shadow_it', 'threat_intel_match'];
  const severities = ['critical', 'high', 'medium', 'low'];
  const statuses = ['new', 'investigating', 'contained', 'false_positive', 'closed'];

  const toggleFilter = (type, value) => {
    setFilters(prev => ({
      ...prev,
      [type]: prev[type].includes(value)
        ? prev[type].filter(v => v !== value)
        : [...prev[type], value]
    }));
  };

  const clearFilters = () => {
    setFilters({
      minRiskScore: 0,
      maxRiskScore: 100,
      minConfidence: 0,
      categories: [],
      severities: [],
      statuses: [],
      searchTerm: ''
    });
    onApplyFilters({});
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Advanced Filters
          </span>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="w-4 h-4 mr-2" />
            Clear
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-xs text-slate-400 mb-2 block">Search</label>
          <Input
            placeholder="Search findings..."
            value={filters.searchTerm}
            onChange={(e) => setFilters({...filters, searchTerm: e.target.value})}
            className="bg-slate-800 border-slate-700 text-white"
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-2 block">
            Risk Score: {filters.minRiskScore} - {filters.maxRiskScore}
          </label>
          <Slider
            value={[filters.minRiskScore, filters.maxRiskScore]}
            onValueChange={([min, max]) => setFilters({...filters, minRiskScore: min, maxRiskScore: max})}
            min={0}
            max={100}
            step={5}
            className="mt-2"
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-2 block">Severity</label>
          <div className="flex flex-wrap gap-2">
            {severities.map(severity => (
              <Badge
                key={severity}
                className={`cursor-pointer ${
                  filters.severities.includes(severity)
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
                onClick={() => toggleFilter('severities', severity)}
              >
                {severity}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-2 block">Status</label>
          <div className="flex flex-wrap gap-2">
            {statuses.map(status => (
              <Badge
                key={status}
                className={`cursor-pointer ${
                  filters.statuses.includes(status)
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
                onClick={() => toggleFilter('statuses', status)}
              >
                {status.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
        </div>

        <Button
          onClick={() => onApplyFilters(filters)}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          Apply Filters
        </Button>
      </CardContent>
    </Card>
  );
}