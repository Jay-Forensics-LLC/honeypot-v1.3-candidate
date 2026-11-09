
import { useState } from 'react';
import ProtectedRoute from '../components/security/ProtectedRoute';
import MFAGate from '../components/security/MFAGate';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  Search,
  Calendar,
  User,
  AlertTriangle,
  CheckCircle,
  Info,
  XCircle,
  Download
} from 'lucide-react';
import { DateUtils } from '../components/utils/DateUtils';

export default function AuditLog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterUser, setFilterUser] = useState('all');

  const { data: user, isLoading: isUserLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  // Only enable audit log queries if user is an admin and user data is loaded
  const isEnabled = user?.role === 'admin' && !isUserLoading;

  const { data: logs, isLoading: isLogsLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      return await base44.entities.AuditLog.list('-timestamp', 500);
    },
    enabled: isEnabled
  });

  const { data: users, isLoading: isUsersLoading } = useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      return await base44.entities.User.list();
    },
    enabled: isEnabled
  });

  // The ProtectedRoute component will handle the admin check and loading states
  // if (user?.role !== 'admin') {
  //   return (
  //     <div className="p-6">
  //       <Card className="bg-red-900/20 border-red-500/30">
  //         <CardContent className="p-12 text-center">
  //           <Shield className="w-16 h-16 mx-auto mb-4 text-red-400" />
  //           <h2 className="text-xl font-bold text-red-300 mb-2">Admin Access Required</h2>
  //           <p className="text-red-200">Audit logs are only accessible to administrators.</p>
  //         </CardContent>
  //       </Card>
  //     </div>
  //   );
  // }

  const filteredLogs = (logs || []).filter(log => {
    const matchesSearch = !searchTerm ||
      log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.event_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user_id?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSeverity = filterSeverity === 'all' || log.severity === filterSeverity;
    const matchesUser = filterUser === 'all' || log.user_id === filterUser;

    return matchesSearch && matchesSeverity && matchesUser;
  });

  const getSeverityIcon = (severity) => {
    switch(severity) {
      case 'critical':
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'info':
        return <Info className="w-4 h-4 text-blue-400" />;
      default:
        return <CheckCircle className="w-4 h-4 text-green-400" />;
    }
  };

  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'critical':
      case 'error':
        return 'bg-red-500/20 text-red-400';
      case 'warning':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'info':
        return 'bg-blue-500/20 text-blue-400';
      default:
        return 'bg-green-500/20 text-green-400';
    }
  };

  const exportLogs = () => {
    const csv = [
      ['Timestamp', 'Event Type', 'Severity', 'User', 'Description', 'Success'].join(','),
      ...filteredLogs.map(log => [
        log.timestamp,
        log.event_type,
        log.severity,
        log.user_id,
        `"${log.description ? log.description.replace(/"/g, '""') : ''}"`, // Handle quotes in description
        log.success
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <ProtectedRoute
      adminOnly={true}
      featureName="Audit Log"
    >
      <MFAGate
        requireMFA={true}
        action="view audit logs"
        sessionDuration={15 * 60 * 1000} // 15 minutes for sensitive pages
      >
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-slate-600 to-slate-700 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Audit Log</h1>
                <p className="text-slate-400">System-wide activity and security events</p>
              </div>
            </div>

            <Button
              onClick={exportLogs}
              variant="outline"
              className="border-slate-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>

          {/* Filters */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search logs..."
                    className="pl-10 bg-slate-800 border-slate-700"
                  />
                </div>

                <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue placeholder="All Severities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterUser} onValueChange={setFilterUser}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue placeholder="All Users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {users?.map(u => (
                      <SelectItem key={u.id} value={u.email}>{u.full_name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-white">{filteredLogs.length}</p>
                <p className="text-xs text-slate-400">Total Entries</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-red-400">
                  {filteredLogs.filter(l => l.severity === 'critical' || l.severity === 'error').length}
                </p>
                <p className="text-xs text-slate-400">Errors</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-yellow-400">
                  {filteredLogs.filter(l => l.severity === 'warning').length}
                </p>
                <p className="text-xs text-slate-400">Warnings</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-green-400">
                  {filteredLogs.filter(l => l.success === true).length}
                </p>
                <p className="text-xs text-slate-400">Successful</p>
              </CardContent>
            </Card>
          </div>

          {/* Log Entries */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-slate-800/50 rounded-lg p-4 hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {getSeverityIcon(log.severity)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge className={getSeverityColor(log.severity)}>
                            {log.severity}
                          </Badge>
                          <span className="text-sm font-semibold text-white">
                            {log.event_type}
                          </span>
                          {log.success === false && (
                            <Badge className="bg-red-500/20 text-red-400">
                              Failed
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-300 mb-2">{log.description}</p>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {log.user_id || 'System'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {DateUtils.safeFormatDateTime(log.timestamp)}
                          </span>
                        </div>
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                              View Metadata
                            </summary>
                            <pre className="mt-2 bg-slate-900 rounded p-2 text-xs text-slate-300 overflow-x-auto">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </MFAGate>
    </ProtectedRoute>
  );
}
