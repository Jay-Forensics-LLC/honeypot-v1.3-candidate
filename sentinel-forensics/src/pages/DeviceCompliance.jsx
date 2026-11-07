import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../components/hooks/useUser';
import { useOrgQuery } from '../components/hooks/useOrgQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../components/utils';
import { AlertTriangle, Shield, CheckCircle, RefreshCw, Monitor, Search, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { requestPolicyRefresh } from '@/functions/requestPolicyRefresh';
import { evaluateDeviceCompliance } from '@/functions/evaluateDeviceCompliance';

export default function DeviceCompliance() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [policyFilter, setPolicyFilter] = useState('all');
  const [sortBy, setSortBy] = useState('severity');

  const { data: devices = [], isLoading } = useOrgQuery('Device', {}, '-risk_score', 1000);
  const { data: policyViolationEvents = [] } = useOrgQuery(
    'DeviceEvent', 
    { event_type: 'policy_violation' }, 
    '-created_date', 
    1000
  );

  const failingDevices = useMemo(() => {
    return devices.filter(d => d.compliance_status === 'fail').sort((a, b) => b.risk_score - a.risk_score);
  }, [devices]);

  const warnDevices = useMemo(() => {
    return devices.filter(d => d.compliance_status === 'warn');
  }, [devices]);

  const topViolations = useMemo(() => {
    const counts = {
      disk_encryption: 0,
      firewall: 0,
      secure_boot: 0,
      edr: 0,
      agent_stale: 0
    };
    
    devices.forEach(d => {
      if (!d.disk_encryption_enabled) counts.disk_encryption++;
      if (!d.firewall_enabled) counts.firewall++;
      if (!d.secure_boot_enabled) counts.secure_boot++;
      if (!d.edr_present) counts.edr++;
      if (d.agent_status === 'stale' || d.agent_status === 'offline') counts.agent_stale++;
    });

    return Object.entries(counts)
      .map(([key, count]) => ({ violation: key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [devices]);

  // Group violations by device
  const violationsByDevice = useMemo(() => {
    const grouped = {};
    
    policyViolationEvents.forEach(v => {
      const deviceId = v.device_id;
      if (!grouped[deviceId]) {
        grouped[deviceId] = [];
      }
      grouped[deviceId].push(v);
    });

    return grouped;
  }, [policyViolationEvents]);

  // Get non-compliant devices with violations
  const nonCompliantDevices = useMemo(() => {
    return devices
      .filter(d => d.compliance_status === 'fail' || d.compliance_status === 'warn')
      .map(device => {
        const deviceViolations = violationsByDevice[device.id] || [];
        
        return {
          ...device,
          violations: deviceViolations,
          violationCount: deviceViolations.length,
          highestSeverity: deviceViolations.reduce((max, v) => {
            const severities = { critical: 4, high: 3, medium: 2, low: 1 };
            const vSev = severities[v.payload?.severity] || 0;
            return vSev > max ? vSev : max;
          }, 0),
          latestViolation: deviceViolations[0]?.created_date || device.updated_date
        };
      });
  }, [devices, violationsByDevice]);

  // Apply filters and sorting
  const filteredNonCompliant = useMemo(() => {
    let filtered = nonCompliantDevices;

    if (searchQuery) {
      filtered = filtered.filter(d => 
        d.hostname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.device_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.user?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (severityFilter !== 'all') {
      filtered = filtered.filter(d => {
        const severityMap = { 4: 'critical', 3: 'high', 2: 'medium', 1: 'low' };
        return severityMap[d.highestSeverity] === severityFilter;
      });
    }

    if (policyFilter !== 'all') {
      filtered = filtered.filter(d => 
        d.violations.some(v => v.payload?.policy === policyFilter)
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'severity':
          return b.highestSeverity - a.highestSeverity;
        case 'violations':
          return b.violationCount - a.violationCount;
        case 'risk':
          return (b.risk_score || 0) - (a.risk_score || 0);
        case 'recent':
          return new Date(b.latestViolation) - new Date(a.latestViolation);
        default:
          return 0;
      }
    });

    return filtered;
  }, [nonCompliantDevices, searchQuery, severityFilter, policyFilter, sortBy]);

  const queueStats = useMemo(() => {
    const critical = filteredNonCompliant.filter(d => d.highestSeverity === 4).length;
    const high = filteredNonCompliant.filter(d => d.highestSeverity === 3).length;
    const medium = filteredNonCompliant.filter(d => d.highestSeverity === 2).length;
    const low = filteredNonCompliant.filter(d => d.highestSeverity === 1).length;

    return { critical, high, medium, low, total: filteredNonCompliant.length };
  }, [filteredNonCompliant]);

  const uniquePolicies = useMemo(() => {
    const policies = new Set();
    policyViolationEvents.forEach(v => {
      if (v.payload?.policy) {
        policies.add(v.payload.policy);
      }
    });
    return Array.from(policies);
  }, [policyViolationEvents]);

  const recheckMutation = useMutation({
    mutationFn: (device_id) => evaluateDeviceCompliance({ device_id }),
    onSuccess: () => {
      queryClient.invalidateQueries(['Device']);
      queryClient.invalidateQueries(['DeviceEvent']);
      toast.success('Compliance recheck completed');
    }
  });

  const bulkPolicyRefreshMutation = useMutation({
    mutationFn: (device_ids) => 
      Promise.all(device_ids.map(id => 
        requestPolicyRefresh({ device_id: id })
      )),
    onSuccess: () => {
      queryClient.invalidateQueries(['DeviceEvent']);
      setSelectedDevices([]);
      toast.success('Policy refresh requested for selected devices');
    }
  });

  const toggleDevice = (deviceId) => {
    setSelectedDevices(prev => 
      prev.includes(deviceId) ? prev.filter(id => id !== deviceId) : [...prev, deviceId]
    );
  };

  const getSeverityBadge = (severity) => {
    const map = {
      4: { label: 'Critical', class: 'bg-red-500/20 text-red-400 border-red-500/50' },
      3: { label: 'High', class: 'bg-orange-500/20 text-orange-400 border-orange-500/50' },
      2: { label: 'Medium', class: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' },
      1: { label: 'Low', class: 'bg-blue-500/20 text-blue-400 border-blue-500/50' }
    };
    const config = map[severity] || map[2];
    return <Badge className={config.class}>{config.label}</Badge>;
  };

  const exportQueue = () => {
    const headers = ['Device', 'User', 'OS', 'Violations', 'Highest Severity', 'Risk Score', 'Latest Violation'];
    const rows = filteredNonCompliant.map(d => [
      d.hostname || d.device_id,
      d.user || 'Unassigned',
      `${d.os_family} ${d.os_version}`,
      d.violationCount,
      ['', 'Low', 'Medium', 'High', 'Critical'][d.highestSeverity],
      d.risk_score || 0,
      new Date(d.latestViolation).toLocaleString()
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `non-compliant-queue-${new Date().toISOString()}.csv`;
    a.click();
    toast.success('Queue exported');
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Device Compliance</h1>
            <p className="text-slate-300">Monitor and remediate non-compliant devices</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <p className="text-sm text-slate-300">Failing</p>
              </div>
              <p className="text-3xl font-bold text-red-400">{failingDevices.length}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <p className="text-sm text-slate-300">Warning</p>
              </div>
              <p className="text-3xl font-bold text-yellow-400">{warnDevices.length}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <p className="text-sm text-slate-300">Compliant</p>
              </div>
              <p className="text-3xl font-bold text-green-400">
                {devices.filter(d => d.compliance_status === 'pass').length}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-blue-400" />
                <p className="text-sm text-slate-300">Compliance Rate</p>
              </div>
              <p className="text-3xl font-bold text-blue-400">
                {devices.length > 0 
                  ? Math.round((devices.filter(d => d.compliance_status === 'pass').length / devices.length) * 100)
                  : 0}%
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-slate-900">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="queue">Non-Compliant Queue</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Top Violations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topViolations.map(({ violation, count }) => (
                    <div key={violation} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <span className="text-white capitalize">{violation.replace(/_/g, ' ')}</span>
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/50">{count} devices</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

        {selectedDevices.length > 0 && (
          <Card className="bg-blue-900/20 border-blue-500/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">{selectedDevices.length} devices selected</span>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={() => bulkPolicyRefreshMutation.mutate(selectedDevices)}
                    disabled={bulkPolicyRefreshMutation.isPending}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Request Policy Refresh
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Failing Devices ({failingDevices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-slate-300">Loading devices...</div>
            ) : failingDevices.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <p className="text-white font-medium">All devices compliant</p>
                <p className="text-slate-400 text-sm">No failing devices found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {failingDevices.map(device => (
                  <div key={device.id} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-red-500/50 transition-colors">
                    <Checkbox 
                      checked={selectedDevices.includes(device.id)} 
                      onCheckedChange={() => toggleDevice(device.id)} 
                    />
                    <Monitor className="w-5 h-5 text-slate-400" />
                    <div className="flex-1">
                      <Link to={createPageUrl('DeviceDetail', { id: device.id })}>
                        <h3 className="text-white font-medium hover:text-blue-400 transition-colors">
                          {device.hostname || device.device_id}
                        </h3>
                      </Link>
                      <p className="text-sm text-slate-400">
                        {device.user || 'Unassigned'} • {device.os_family}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
                        Risk: {device.risk_score}
                      </Badge>
                      {device.critical_findings_count > 0 && (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
                          {device.critical_findings_count} violations
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

            {warnDevices.length > 0 && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    Warning Devices ({warnDevices.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {warnDevices.map(device => (
                      <div key={device.id} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                        <Monitor className="w-5 h-5 text-slate-400" />
                        <div className="flex-1">
                          <Link to={createPageUrl('DeviceDetail', { id: device.id })}>
                            <h3 className="text-white font-medium hover:text-blue-400 transition-colors">
                              {device.hostname || device.device_id}
                            </h3>
                          </Link>
                          <p className="text-sm text-slate-400">{device.user || 'Unassigned'}</p>
                        </div>
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">
                          {device.compliance_status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="queue" className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-red-900/20 border-red-500/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                    <p className="text-sm text-slate-300">Critical</p>
                  </div>
                  <p className="text-3xl font-bold text-red-400">{queueStats.critical}</p>
                </CardContent>
              </Card>

              <Card className="bg-orange-900/20 border-orange-500/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-orange-400" />
                    <p className="text-sm text-slate-300">High</p>
                  </div>
                  <p className="text-3xl font-bold text-orange-400">{queueStats.high}</p>
                </CardContent>
              </Card>

              <Card className="bg-yellow-900/20 border-yellow-500/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    <p className="text-sm text-slate-300">Medium</p>
                  </div>
                  <p className="text-3xl font-bold text-yellow-400">{queueStats.medium}</p>
                </CardContent>
              </Card>

              <Card className="bg-blue-900/20 border-blue-500/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-blue-400" />
                    <p className="text-sm text-slate-300">Low</p>
                  </div>
                  <p className="text-3xl font-bold text-blue-400">{queueStats.low}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search devices..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger className="w-full lg:w-40 bg-slate-800 border-slate-700">
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={policyFilter} onValueChange={setPolicyFilter}>
                    <SelectTrigger className="w-full lg:w-48 bg-slate-800 border-slate-700">
                      <SelectValue placeholder="Policy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Policies</SelectItem>
                      {uniquePolicies.map(policy => (
                        <SelectItem key={policy} value={policy}>{policy}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-full lg:w-40 bg-slate-800 border-slate-700">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="severity">By Severity</SelectItem>
                      <SelectItem value="violations">By Violations</SelectItem>
                      <SelectItem value="risk">By Risk Score</SelectItem>
                      <SelectItem value="recent">Most Recent</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={exportQueue} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800">
                        <TableHead className="text-slate-300">Device</TableHead>
                        <TableHead className="text-slate-300">User</TableHead>
                        <TableHead className="text-slate-300">Violations</TableHead>
                        <TableHead className="text-slate-300">Severity</TableHead>
                        <TableHead className="text-slate-300">Risk</TableHead>
                        <TableHead className="text-slate-300">Last Violation</TableHead>
                        <TableHead className="text-slate-300">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredNonCompliant.map((device) => (
                        <TableRow key={device.id} className="border-slate-800">
                          <TableCell>
                            <div>
                              <p className="text-white font-medium">{device.hostname || device.device_id}</p>
                              <p className="text-xs text-slate-400">{device.os_family} {device.os_version}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-300">{device.user || 'Unassigned'}</TableCell>
                          <TableCell>
                            <Badge className="bg-slate-800 text-white border-slate-700">
                              {device.violationCount} policies
                            </Badge>
                          </TableCell>
                          <TableCell>{getSeverityBadge(device.highestSeverity)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-12 h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-red-500" 
                                  style={{ width: `${device.risk_score || 0}%` }}
                                />
                              </div>
                              <span className="text-white text-sm">{device.risk_score || 0}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-300 text-sm">
                            {new Date(device.latestViolation).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Link to={createPageUrl('DeviceDetail', { id: device.id })}>
                                <Button size="sm" variant="outline">
                                  <ExternalLink className="w-3 h-3" />
                                </Button>
                              </Link>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => recheckMutation.mutate(device.id)}
                                disabled={recheckMutation.isPending}
                              >
                                <RefreshCw className={`w-3 h-3 ${recheckMutation.isPending ? 'animate-spin' : ''}`} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredNonCompliant.length === 0 && (
                    <div className="text-center py-12">
                      <Shield className="w-16 h-16 text-green-400 mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-white mb-2">All Clear!</h3>
                      <p className="text-slate-400">No non-compliant devices found</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}