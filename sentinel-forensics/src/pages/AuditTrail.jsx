import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  Search,
  Filter,
  Loader2,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  User,
  Calendar,
  FileText,
  Lock
} from "lucide-react";
import { format } from "date-fns";

export default function AuditTrail() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterEventType, setFilterEventType] = useState("all");
  const [filterResource, setFilterResource] = useState("all");

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: auditLogs = [], isLoading } = useQuery({
    queryKey: ['audit-logs', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.AuditLog.filter(
        { organization_id: user.organization_id },
        '-timestamp',
        500
      );
    },
    enabled: !!user?.organization_id && user?.role === 'admin',
    staleTime: 60 * 1000
  });

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = log.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         log.user_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         log.event_type?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = filterSeverity === 'all' || log.severity === filterSeverity;
    const matchesEventType = filterEventType === 'all' || log.event_type === filterEventType;
    const matchesResource = filterResource === 'all' || log.resource_type === filterResource;
    return matchesSearch && matchesSeverity && matchesEventType && matchesResource;
  });

  const getSeverityIcon = (severity) => {
    const icons = {
      info: Info,
      warning: AlertTriangle,
      error: AlertCircle,
      critical: AlertCircle
    };
    return icons[severity] || Info;
  };

  const getSeverityColor = (severity) => {
    const colors = {
      info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      error: 'bg-red-500/20 text-red-400 border-red-500/30',
      critical: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    };
    return colors[severity] || colors.info;
  };

  const eventTypes = [...new Set(auditLogs.map(log => log.event_type))].filter(Boolean);
  const resourceTypes = [...new Set(auditLogs.map(log => log.resource_type))].filter(Boolean);

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6 flex items-center justify-center">
        <Card className="bg-red-950/20 border-red-500 max-w-md">
          <CardContent className="p-6 text-center">
            <Lock className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
            <p className="text-red-200">Only administrators can view audit logs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold text-white">Audit Trail</h1>
          </div>
          <p className="text-slate-400">
            Complete history of all actions performed in the system
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Events</p>
                  <p className="text-2xl font-bold text-white">{auditLogs.length}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Critical</p>
                  <p className="text-2xl font-bold text-purple-400">
                    {auditLogs.filter(l => l.severity === 'critical').length}
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Errors</p>
                  <p className="text-2xl font-bold text-red-400">
                    {auditLogs.filter(l => l.severity === 'error').length}
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Success</p>
                  <p className="text-2xl font-bold text-green-400">
                    {auditLogs.filter(l => l.success !== false).length}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterEventType} onValueChange={setFilterEventType}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Event Type" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Events</SelectItem>
                  {eventTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterResource} onValueChange={setFilterResource}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Resource" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Resources</SelectItem>
                  {resourceTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Audit Logs */}
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-slate-400">Loading audit logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Logs Found</h3>
              <p className="text-slate-400">
                {searchQuery || filterSeverity !== 'all' || filterEventType !== 'all' || filterResource !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Audit logs will appear here as actions are performed'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map((log) => {
              const SeverityIcon = getSeverityIcon(log.severity);
              return (
                <Card key={log.id} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${getSeverityColor(log.severity)} flex-shrink-0`}>
                        <SeverityIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 className="text-white font-medium">{log.description}</h3>
                              <Badge className={getSeverityColor(log.severity)}>
                                {log.severity}
                              </Badge>
                              {log.success === false && (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                                  Failed
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
                              <div className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                <span>{log.user_id}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>{format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}</span>
                              </div>
                              {log.event_type && (
                                <Badge variant="outline" className="border-slate-600 text-slate-300">
                                  {log.event_type.replace(/_/g, ' ')}
                                </Badge>
                              )}
                              {log.resource_type && (
                                <Badge variant="outline" className="border-slate-600 text-slate-300">
                                  {log.resource_type}
                                </Badge>
                              )}
                              {log.action_performed && (
                                <Badge variant="outline" className="border-slate-600 text-slate-300">
                                  {log.action_performed}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        {log.error_message && (
                          <div className="mt-2 p-2 bg-red-950/30 border border-red-500/30 rounded text-sm text-red-300">
                            <strong>Error:</strong> {log.error_message}
                          </div>
                        )}
                        {log.fields_changed && log.fields_changed.length > 0 && (
                          <div className="mt-2 text-sm text-slate-400">
                            <strong>Fields Changed:</strong> {log.fields_changed.join(', ')}
                          </div>
                        )}
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-300">
                              View Details
                            </summary>
                            <pre className="mt-2 p-2 bg-slate-800 rounded text-xs text-slate-300 overflow-x-auto">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}