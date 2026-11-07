import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Search, Filter, Download, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function UnifiedAuditLogViewer({ logs }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 50;

  const eventTypes = useMemo(() => {
    const types = new Set(logs.map(log => log.event_type));
    return ['all', ...Array.from(types)];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = !searchTerm || 
        log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.ip_address?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
      const matchesEventType = eventTypeFilter === 'all' || log.event_type === eventTypeFilter;

      return matchesSearch && matchesSeverity && matchesEventType;
    });
  }, [logs, searchTerm, severityFilter, eventTypeFilter]);

  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * logsPerPage;
    return filteredLogs.slice(startIndex, startIndex + logsPerPage);
  }, [filteredLogs, currentPage]);

  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);

  const exportLogs = () => {
    const csvContent = [
      ['Timestamp', 'Event Type', 'Severity', 'User', 'IP Address', 'Description', 'Success'].join(','),
      ...filteredLogs.map(log => [
        log.timestamp,
        log.event_type,
        log.severity,
        log.user_id || 'N/A',
        log.ip_address || 'N/A',
        `"${log.description?.replace(/"/g, '""') || 'N/A'}"`,
        log.success
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <CardTitle className="text-white flex items-center gap-2">
            <Eye className="w-5 h-5 text-purple-400" />
            Unified Audit Logs ({filteredLogs.length})
          </CardTitle>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={eventTypeFilter} onValueChange={(v) => { setEventTypeFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Event Type" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 max-h-64">
                {eventTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {type === 'all' ? 'All Events' : type.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={exportLogs}
              className="border-slate-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {paginatedLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              No audit logs match your filters
            </div>
          ) : (
            paginatedLogs.map((log, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-800/30 border border-slate-700 rounded-lg hover:border-purple-500/50 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge className={
                        log.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        log.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        log.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-blue-500/20 text-blue-400'
                      }>
                        {log.severity}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {log.event_type.replace(/_/g, ' ')}
                      </Badge>
                      {log.success === false && (
                        <Badge className="bg-red-500/20 text-red-400 text-xs">Failed</Badge>
                      )}
                    </div>
                    <p className="text-white text-sm mb-2">{log.description}</p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-slate-400">
                      <div>
                        <span className="text-slate-500">Time:</span>{' '}
                        {format(new Date(log.timestamp), 'MMM d, HH:mm:ss')}
                      </div>
                      {log.user_id && (
                        <div className="truncate">
                          <span className="text-slate-500">User:</span> {log.user_id}
                        </div>
                      )}
                      {log.ip_address && (
                        <div>
                          <span className="text-slate-500">IP:</span> {log.ip_address}
                        </div>
                      )}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="truncate">
                          <span className="text-slate-500">Details:</span>{' '}
                          {Object.keys(log.metadata).length} fields
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800">
            <p className="text-sm text-slate-400">
              Showing {((currentPage - 1) * logsPerPage) + 1} to {Math.min(currentPage * logsPerPage, filteredLogs.length)} of {filteredLogs.length}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="border-slate-700"
              >
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = currentPage <= 3 ? i + 1 : 
                                  currentPage >= totalPages - 2 ? totalPages - 4 + i :
                                  currentPage - 2 + i;
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                      className={currentPage === pageNum ? "bg-blue-600" : "border-slate-700"}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="border-slate-700"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}