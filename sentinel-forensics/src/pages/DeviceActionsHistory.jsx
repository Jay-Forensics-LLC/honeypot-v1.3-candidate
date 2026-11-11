import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../components/hooks/useUser';
import { useOrgQuery } from '../components/hooks/useOrgQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, Search, Download, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

export default function DeviceActionsHistory() {
  const { data: user } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');

  const { data: events = [], isLoading } = useOrgQuery(
    'DeviceEvent', 
    {}, 
    '-created_date', 
    500
  );

  const actionEvents = useMemo(() => {
    return events.filter(e => 
      e.event_type === 'action_requested' || e.event_type === 'action_result'
    );
  }, [events]);

  const filteredEvents = useMemo(() => {
    return actionEvents.filter(event => {
      const matchesSearch = !searchQuery || 
        event.device_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.actor_email?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = filterStatus === 'all' || event.status === filterStatus;
      const matchesType = filterType === 'all' || event.event_type === filterType;
      
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [actionEvents, searchQuery, filterStatus, filterType]);

  const stats = useMemo(() => {
    const total = actionEvents.length;
    const success = actionEvents.filter(e => e.status === 'success').length;
    const failure = actionEvents.filter(e => e.status === 'failure').length;
    const pending = actionEvents.filter(e => e.status === 'pending').length;
    return { total, success, failure, pending };
  }, [actionEvents]);

  const exportToCSV = () => {
    const headers = ['Timestamp', 'Device ID', 'Event Type', 'Status', 'Actor', 'Correlation ID'];
    const rows = filteredEvents.map(e => [
      new Date(e.created_date).toISOString(),
      e.device_id,
      e.event_type,
      e.status || 'N/A',
      e.actor_email || e.actor,
      e.correlation_id || 'N/A'
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `device-actions-${new Date().toISOString()}.csv`;
    a.click();
    toast.success('Exported action history');
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failure': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-400" />;
      default: return <Activity className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'failure': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Actions History</h1>
            <p className="text-slate-300">Searchable ledger of all remote actions</p>
          </div>
          <Button onClick={exportToCSV} disabled={filteredEvents.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-300">Total Actions</p>
              <p className="text-2xl font-bold text-white">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-300">Success</p>
              <p className="text-2xl font-bold text-green-400">{stats.success}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-300">Failed</p>
              <p className="text-2xl font-bold text-red-400">{stats.failure}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <p className="text-sm text-slate-300">Pending</p>
              <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle className="text-white">Action Log ({filteredEvents.length})</CardTitle>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search device, user..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-slate-800 border-slate-700 text-white w-64"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white rounded-lg px-3 py-2"
                >
                  <option value="all">All Status</option>
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                  <option value="pending">Pending</option>
                </select>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white rounded-lg px-3 py-2"
                >
                  <option value="all">All Types</option>
                  <option value="action_requested">Requested</option>
                  <option value="action_result">Result</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-slate-300">Loading action history...</div>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-8 text-slate-300">No actions found</div>
            ) : (
              <div className="space-y-2">
                {filteredEvents.map(event => (
                  <div key={event.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusIcon(event.status)}
                          <h3 className="text-white font-medium">{event.event_type}</h3>
                          <Badge className={`${getStatusColor(event.status)}`}>
                            {event.status || 'unknown'}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm text-slate-400">
                          <p>Device: <span className="text-white font-mono">{event.device_id}</span></p>
                          <p>Actor: {event.actor_email || event.actor}</p>
                          {event.correlation_id && (
                            <p>Correlation: <span className="text-white font-mono text-xs">{event.correlation_id}</span></p>
                          )}
                          {event.error_message && (
                            <p className="text-red-400">Error: {event.error_message}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400 whitespace-nowrap">
                          {new Date(event.created_date).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-slate-400 whitespace-nowrap">
                          {new Date(event.created_date).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}