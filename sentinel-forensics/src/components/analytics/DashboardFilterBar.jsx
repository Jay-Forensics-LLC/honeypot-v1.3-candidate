import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Filter, X, RotateCcw } from 'lucide-react';
import { format, subDays, subHours } from 'date-fns';

export default function DashboardFilterBar({ onFilterChange, cases = [], agents = [] }) {
  const [dateFrom, setDateFrom] = useState(subDays(new Date(), 7));
  const [dateTo, setDateTo] = useState(new Date());
  const [selectedCases, setSelectedCases] = useState([]);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [selectedSeverities, setSelectedSeverities] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedIOCMatched, setSelectedIOCMatched] = useState('all');

  const presets = [
    { label: 'Last 24h', hours: 24 },
    { label: 'Last 7d', days: 7 },
    { label: 'Last 30d', days: 30 },
    { label: 'Last 90d', days: 90 }
  ];

  const severities = ['critical', 'high', 'medium', 'low', 'info'];
  const categories = ['network', 'vulnerability', 'malware', 'process', 'system_integrity', 'behavioral'];
  const statuses = ['unreviewed', 'reviewed', 'dismissed'];

  const applyFilters = () => {
    const filters = {
      dateFrom: dateFrom?.toISOString(),
      dateTo: dateTo?.toISOString(),
      caseIds: selectedCases,
      agentIds: selectedAgents,
      severities: selectedSeverities,
      categories: selectedCategories,
      statuses: selectedStatuses,
      iocMatched: selectedIOCMatched
    };
    onFilterChange(filters);
  };

  const resetFilters = () => {
    setDateFrom(subDays(new Date(), 7));
    setDateTo(new Date());
    setSelectedCases([]);
    setSelectedAgents([]);
    setSelectedSeverities([]);
    setSelectedCategories([]);
    setSelectedStatuses([]);
    setSelectedIOCMatched('all');
  };

  useEffect(() => {
    applyFilters();
  }, []);

  const toggleSelection = (value, selectedArray, setterFn) => {
    if (selectedArray.includes(value)) {
      setterFn(selectedArray.filter(v => v !== value));
    } else {
      setterFn([...selectedArray, value]);
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800 sticky top-0 z-40">
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Date Presets */}
          <div className="flex flex-wrap gap-2">
            {presets.map(preset => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  setDateTo(now);
                  setDateFrom(preset.hours 
                    ? subHours(now, preset.hours)
                    : subDays(now, preset.days)
                  );
                }}
                className="border-slate-700"
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Custom Date Range */}
          <div className="flex flex-wrap gap-3 items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="border-slate-700">
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {dateFrom ? format(dateFrom, 'MMM d, yyyy') : 'From'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} />
              </PopoverContent>
            </Popover>

            <span className="text-slate-400">→</span>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="border-slate-700">
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {dateTo ? format(dateTo, 'MMM d, yyyy') : 'To'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Dimension Filters */}
          <div className="flex flex-wrap gap-2">
            {/* Severity */}
            <div className="flex flex-wrap gap-1">
              {severities.map(sev => (
                <Badge
                  key={sev}
                  variant={selectedSeverities.includes(sev) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleSelection(sev, selectedSeverities, setSelectedSeverities)}
                >
                  {sev}
                </Badge>
              ))}
            </div>

            {/* Category */}
            <Select onValueChange={val => toggleSelection(val, selectedCategories, setSelectedCategories)}>
              <SelectTrigger className="w-40 border-slate-700">
                <SelectValue placeholder="+ Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status */}
            <Select onValueChange={val => toggleSelection(val, selectedStatuses, setSelectedStatuses)}>
              <SelectTrigger className="w-40 border-slate-700">
                <SelectValue placeholder="+ Status" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map(st => (
                  <SelectItem key={st} value={st}>{st}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* IOC Match Filter */}
            <Select value={selectedIOCMatched} onValueChange={setSelectedIOCMatched}>
              <SelectTrigger className="w-48 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Findings</SelectItem>
                <SelectItem value="matched">Threat Intel Match</SelectItem>
                <SelectItem value="IP">IP Match Only</SelectItem>
                <SelectItem value="domain">Domain Match Only</SelectItem>
                <SelectItem value="hash">Hash Match Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Active Filters Display */}
          {(selectedCategories.length > 0 || selectedStatuses.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {selectedCategories.map(cat => (
                <Badge key={cat} variant="secondary" className="gap-1">
                  {cat}
                  <X 
                    className="w-3 h-3 cursor-pointer" 
                    onClick={() => setSelectedCategories(selectedCategories.filter(c => c !== cat))}
                  />
                </Badge>
              ))}
              {selectedStatuses.map(st => (
                <Badge key={st} variant="secondary" className="gap-1">
                  {st}
                  <X 
                    className="w-3 h-3 cursor-pointer" 
                    onClick={() => setSelectedStatuses(selectedStatuses.filter(s => s !== st))}
                  />
                </Badge>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={applyFilters} className="bg-[#EF4444] hover:bg-[#DC2626]">
              <Filter className="w-4 h-4 mr-2" />
              Apply Filters
            </Button>
            <Button onClick={resetFilters} variant="outline" className="border-slate-700">
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}