import React from 'react';
import { Search, X, Filter, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export default function FilterBar({ filters, onFiltersChange }) {
  const handleChange = (key, value) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleReset = () => {
    onFiltersChange({
      timeRange: '7d',
      severity: 'all',
      deviceGroup: 'all',
      search: ''
    });
  };

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'timeRange' && value === '7d') return false;
    if (value === 'all' || value === '') return false;
    return true;
  }).length;

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Time Range */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <Select value={filters.timeRange} onValueChange={(v) => handleChange('timeRange', v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Severity */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <Select value={filters.severity} onValueChange={(v) => handleChange('severity', v)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severity</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="INFO">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[200px] max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => handleChange('search', e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Active Filters Badge */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} applied
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-8"
            >
              <X className="w-4 h-4 mr-1" />
              Reset
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}