import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import { EVIDENCE_TYPES } from '../utils/constants';
import { formatEnumTitle } from '../utils/formatters';

/**
 * Evidence filters component
 * @param {Object} props - Component props
 * @param {string} props.searchTerm - Search term
 * @param {Function} props.onSearchChange - Search change handler
 * @param {string} props.filterType - Selected type filter
 * @param {Function} props.onTypeChange - Type filter change handler
 * @param {string} props.filterCase - Selected case filter
 * @param {Function} props.onCaseChange - Case filter change handler
 * @param {Array} props.cases - Array of cases for filtering
 * @returns {JSX.Element} Evidence filters
 */
export default function EvidenceFilters({
  searchTerm,
  onSearchChange,
  filterType,
  onTypeChange,
  filterCase,
  onCaseChange,
  cases = []
}) {
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardContent className="p-4">
        <div className="grid md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search evidence..."
              className="pl-10 bg-slate-800 border-slate-700"
            />
          </div>

          {/* Type Filter */}
          <Select value={filterType} onValueChange={onTypeChange}>
            <SelectTrigger className="bg-slate-800 border-slate-700">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-white">
              <SelectItem value="all">All Types</SelectItem>
              {Object.values(EVIDENCE_TYPES).map((type) => (
                <SelectItem key={type} value={type}>
                  {formatEnumTitle(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Case Filter */}
          <Select value={filterCase} onValueChange={onCaseChange}>
            <SelectTrigger className="bg-slate-800 border-slate-700">
              <SelectValue placeholder="Filter by case" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-white">
              <SelectItem value="all">All Cases</SelectItem>
              {cases.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.case_number} - {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}