import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../components/hooks/useUser';
import { useBackgroundProcess } from '../components/background/BackgroundProcessProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  HardDrive, Brain, FileSearch, Loader2, AlertTriangle, CheckCircle, Shield,
  Search, Filter, Download, Calendar, Clock, Activity, Eye, FileText, 
  ChevronRight, TrendingUp, Scale, Users, MessageCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import IncidentTimelineReconstructor from '../components/forensics/IncidentTimelineReconstructor';
import TemporalAnalysisPanel from '../components/forensics/TemporalAnalysisPanel';
import CaseMessaging from '../components/collaboration/CaseMessaging';
import CaseWorkspace from '../components/collaboration/CaseWorkspace';
import AttorneyWorkspaceTab from '../components/collaboration/AttorneyWorkspaceTab';
import LegalAIAssistant from '../components/collaboration/LegalAIAssistant';
import CaseTaskManager from '../components/collaboration/CaseTaskManager';
import DisclosureAutomation from '../components/collaboration/DisclosureAutomation';
import EvidenceTimeline from '../components/evidence/EvidenceTimeline';
import AdvancedEvidenceSearch from '../components/evidence/AdvancedEvidenceSearch';
import GlobalEvidenceSearch from '../components/search/GlobalEvidenceSearch';
import CaseHealthDashboard from '../components/dashboard/CaseHealthDashboard';

export default function ForensicModule() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const { startProcess } = useBackgroundProcess();
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  
  // Log Analyzer state
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedIncident, setSelectedIncident] = useState(null);
  
  // Legal Case state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const [newCaseData, setNewCaseData] = useState({
    matter_title: '',
    case_type: 'criminal_defense',
    case_number: ''
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices', user?.organization_id],
    queryFn: () => base44.entities.Device.filter({ organization_id: user.organization_id }),
    enabled: !!user?.organization_id
  });

  const { data: collections = [] } = useQuery({
    queryKey: ['forensic-collections', user?.organization_id],
    queryFn: () => base44.entities.ForensicCollection.filter({ organization_id: user.organization_id }, '-created_date', 50),
    enabled: !!user?.organization_id,
    refetchInterval: 5000
  });

  const { data: forensicLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['forensic-logs', startDate, endDate, severityFilter, eventTypeFilter, sourceFilter],
    queryFn: async () => {
      try {
        const filters = {};
        
        if (startDate) filters.timestamp = { $gte: new Date(startDate).toISOString() };
        if (endDate) {
          filters.timestamp = { 
            ...filters.timestamp,
            $lte: new Date(endDate).toISOString() 
          };
        }
        if (severityFilter !== 'all') filters.severity = severityFilter;
        if (eventTypeFilter !== 'all') filters.event_type = eventTypeFilter;

        const logs = await base44.entities.AuditLog.filter(filters, '-timestamp', 1000);
        return logs;
      } catch (error) {
        console.warn('Failed to fetch forensic logs:', error);
        return [];
      }
    },
    enabled: !!user,
    retry: 1,
    initialData: []
  });

  const { data: securityEvents = [] } = useQuery({
    queryKey: ['security-events-forensic'],
    queryFn: async () => {
      try {
        return await base44.entities.SecurityEvent.list('-timestamp', 500);
      } catch (error) {
        return [];
      }
    },
    enabled: !!user,
    initialData: []
  });

  const { data: legalCases = [] } = useQuery({
    queryKey: ['legal-cases', user?.organization_id],
    queryFn: () => base44.entities.LegalCase.filter({ organization_id: user.organization_id }),
    enabled: !!user?.organization_id
  });

  const { data: exhibits = [] } = useQuery({
    queryKey: ['court-exhibits', selectedCase?.id],
    queryFn: () => base44.entities.CourtExhibit.filter({ legal_case_id: selectedCase.id }),
    enabled: !!selectedCase?.id
  });

  const diskImageMutation = useMutation({
    mutationFn: ({ device_id, case_id }) => {
      const processId = startProcess({
        type: 'disk_imaging',
        name: `Disk Imaging: ${device_id}`,
        executor: async (updateProgress) => {
          updateProgress(10, { status: 'Connecting...' });
          await new Promise(r => setTimeout(r, 2000));
          
          updateProgress(30, { status: 'Imaging disk...' });
          const result = await base44.functions.invoke('remoteDiskImaging', { device_id, case_id });
          
          updateProgress(80, { status: 'Computing hash...' });
          await new Promise(r => setTimeout(r, 1000));
          
          updateProgress(100, { status: 'Complete', result });
          return result;
        }
      });
      return { processId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['forensic-collections']);
      toast.success('Disk imaging started in background');
    }
  });

  const memoryAnalysisMutation = useMutation({
    mutationFn: async ({ device_id, case_id }) => {
      const result = await base44.functions.invoke('memoryDumpAnalysis', { device_id, case_id });
      setAnalysisResults(result);
      setShowResults(true);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['forensic-collections']);
      toast.success('Memory analysis complete');
    }
  });

  const artifactCollectionMutation = useMutation({
    mutationFn: async ({ device_id, case_id }) => {
      const result = await base44.functions.invoke('collectForensicArtifacts', { 
        device_id, 
        case_id,
        artifact_types: ['process', 'network', 'registry', 'file']
      });
      setAnalysisResults(result);
      setShowResults(true);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['forensic-collections']);
      toast.success('Artifact collection complete');
    }
  });

  const activeCollections = collections.filter(c => c.status === 'collecting');
  const completedCollections = collections.filter(c => c.status === 'completed');

  const eventTypes = useMemo(() => {
    const types = new Set(forensicLogs.map(log => log.event_type));
    return ['all', ...Array.from(types).sort()];
  }, [forensicLogs]);

  const filteredLogs = useMemo(() => {
    if (!searchTerm && sourceFilter === 'all') return forensicLogs;
    
    return forensicLogs.filter(log => {
      const searchMatch = !searchTerm || 
        log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.ip_address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        JSON.stringify(log.metadata || {}).toLowerCase().includes(searchTerm.toLowerCase());

      const sourceMatch = sourceFilter === 'all' || 
        log.metadata?.source === sourceFilter ||
        log.event_type.includes(sourceFilter);

      return searchMatch && sourceMatch;
    });
  }, [forensicLogs, searchTerm, sourceFilter]);

  const stats = useMemo(() => {
    return {
      total: filteredLogs.length,
      critical: filteredLogs.filter(l => l.severity === 'critical').length,
      high: filteredLogs.filter(l => l.severity === 'high').length,
      warning: filteredLogs.filter(l => l.severity === 'warning').length,
      failed: filteredLogs.filter(l => l.success === false).length
    };
  }, [filteredLogs]);

  const exportMutation = useMutation({
    mutationFn: async (format) => {
      const exportData = {
        generated_at: new Date().toISOString(),
        generated_by: user.email,
        filters: { startDate, endDate, severityFilter, eventTypeFilter, sourceFilter },
        total_logs: filteredLogs.length,
        integrity_hash: await generateIntegrityHash(filteredLogs),
        logs: filteredLogs.map(log => ({
          ...log,
          _immutable: true,
          _export_timestamp: new Date().toISOString()
        }))
      };

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        downloadFile(blob, `forensic-logs-${Date.now()}.json`);
      } else if (format === 'csv') {
        const csv = convertToCSV(filteredLogs);
        const blob = new Blob([csv], { type: 'text/csv' });
        downloadFile(blob, `forensic-logs-${Date.now()}.csv`);
      }

      await base44.entities.AuditLog.create({
        event_type: 'forensic_export',
        severity: 'info',
        user_id: user.email,
        description: `Exported ${filteredLogs.length} forensic logs`,
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          format,
          log_count: filteredLogs.length,
          filters: { startDate, endDate, severityFilter, eventTypeFilter }
        }
      });
    },
    onSuccess: () => {
      toast.success('Forensic logs exported with integrity hash');
      queryClient.invalidateQueries({ queryKey: ['forensic-logs'] });
    }
  });

  const createCaseMutation = useMutation({
    mutationFn: (caseData) => base44.entities.LegalCase.create({
      ...caseData,
      organization_id: user.organization_id,
      procedural_status: 'investigation'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['legal-cases']);
      setShowCreateDialog(false);
      toast.success('Legal case created');
    }
  });

  const validateChainMutation = useMutation({
    mutationFn: ({ evidence_id }) => base44.functions.invoke('validateChainOfCustody', { evidence_id }),
    onSuccess: (data) => {
      if (data.valid) {
        toast.success(`Chain validated: ${data.score}/100`);
      } else {
        toast.error(`Chain validation failed: ${data.score}/100`);
      }
    }
  });

  const generateExhibitNumberMutation = useMutation({
    mutationFn: ({ legal_case_id, numbering_scheme }) =>
      base44.functions.invoke('generateExhibitNumber', { legal_case_id, numbering_scheme }),
    onSuccess: (data) => {
      toast.success(`Next exhibit: ${data.exhibit_number}`);
    }
  });

  async function generateIntegrityHash(logs) {
    const data = JSON.stringify(logs.map(l => ({ id: l.id, timestamp: l.timestamp })));
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function convertToCSV(logs) {
    const headers = ['Timestamp', 'Event Type', 'Severity', 'User', 'IP Address', 'Description', 'Success', 'Metadata'];
    const rows = logs.map(log => [
      log.timestamp,
      log.event_type,
      log.severity,
      log.user_id || '',
      log.ip_address || '',
      `"${(log.description || '').replace(/"/g, '""')}"`,
      log.success,
      `"${JSON.stringify(log.metadata || {}).replace(/"/g, '""')}"`
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Forensic Investigation & Legal Module</h1>
          <p className="text-slate-400">Collection, analysis, log review, and court-ready case building</p>
        </div>

        <Tabs defaultValue="collection" className="space-y-4">
          <TabsList className="bg-slate-900/50 border border-slate-800">
            <TabsTrigger value="collection" className="data-[state=active]:bg-blue-600">
              <HardDrive className="w-4 h-4 mr-2" />
              Collection
            </TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-purple-600">
              <Eye className="w-4 h-4 mr-2" />
              Log Analysis
            </TabsTrigger>
            <TabsTrigger value="legal" className="data-[state=active]:bg-orange-600">
              <Scale className="w-4 h-4 mr-2" />
              Legal & Court
            </TabsTrigger>
          </TabsList>

          <TabsContent value="collection" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Active Collections</p>
                      <p className="text-2xl font-bold text-white">{activeCollections.length}</p>
                    </div>
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Completed</p>
                      <p className="text-2xl font-bold text-white">{completedCollections.length}</p>
                    </div>
                    <CheckCircle className="w-8 h-8 text-green-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Threats Found</p>
                      <p className="text-2xl font-bold text-white">
                        {completedCollections.filter(c => c.analysis_results?.malware_detected).length}
                      </p>
                    </div>
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Devices</p>
                      <p className="text-2xl font-bold text-white">{devices.length}</p>
                    </div>
                    <Shield className="w-8 h-8 text-purple-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="collect" className="space-y-4">
              <TabsList className="bg-slate-800 border-slate-700">
                <TabsTrigger value="collect">Start Collection</TabsTrigger>
                <TabsTrigger value="active">Active ({activeCollections.length})</TabsTrigger>
                <TabsTrigger value="completed">Completed ({completedCollections.length})</TabsTrigger>
              </TabsList>

          <TabsContent value="collect">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Forensic Collection Tools</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-400 mb-2">Select Device</label>
                  <select
                    className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
                    value={selectedDevice || ''}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                  >
                    <option value="">Choose a device...</option>
                    {devices.map(device => (
                      <option key={device.id} value={device.id}>
                        {device.device_name || device.id} - {device.ip_address}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-slate-800/50 border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer"
                    onClick={() => selectedDevice && diskImageMutation.mutate({ device_id: selectedDevice })}>
                    <CardContent className="p-6 text-center">
                      <HardDrive className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                      <h3 className="text-lg font-semibold text-white mb-2">Remote Disk Imaging</h3>
                      <p className="text-sm text-slate-400 mb-4">Create forensically sound disk image</p>
                      <Badge className="bg-blue-500/20 text-blue-300">Bit-by-bit copy</Badge>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/50 border-slate-700 hover:border-purple-500/50 transition-colors cursor-pointer"
                    onClick={() => selectedDevice && memoryAnalysisMutation.mutate({ device_id: selectedDevice })}>
                    <CardContent className="p-6 text-center">
                      <Brain className="w-12 h-12 text-purple-400 mx-auto mb-3" />
                      <h3 className="text-lg font-semibold text-white mb-2">Memory Dump Analysis</h3>
                      <p className="text-sm text-slate-400 mb-4">Analyze RAM for malware</p>
                      <Badge className="bg-purple-500/20 text-purple-300">AI-Powered</Badge>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/50 border-slate-700 hover:border-green-500/50 transition-colors cursor-pointer"
                    onClick={() => selectedDevice && artifactCollectionMutation.mutate({ device_id: selectedDevice })}>
                    <CardContent className="p-6 text-center">
                      <FileSearch className="w-12 h-12 text-green-400 mx-auto mb-3" />
                      <h3 className="text-lg font-semibold text-white mb-2">Artifact Collection</h3>
                      <p className="text-sm text-slate-400 mb-4">Collect processes, network, files</p>
                      <Badge className="bg-green-500/20 text-green-300">Comprehensive</Badge>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="active">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Active Collections</CardTitle>
              </CardHeader>
              <CardContent>
                {activeCollections.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">No active collections</p>
                ) : (
                  <div className="space-y-3">
                    {activeCollections.map(collection => (
                      <div key={collection.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h3 className="text-white font-medium">{collection.collection_type}</h3>
                            <p className="text-sm text-slate-400">{collection.device_id}</p>
                          </div>
                          <Badge className="bg-blue-500/20 text-blue-300">
                            {collection.progress}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="completed">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Completed Collections</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {completedCollections.map(collection => (
                    <div key={collection.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-white font-medium">{collection.collection_type}</h3>
                            {collection.analysis_results?.malware_detected && (
                              <Badge className="bg-red-500/20 text-red-300">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Threat Detected
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-400 mb-2">{collection.device_id}</p>
                          {collection.analysis_results?.ai_insights && (
                            <p className="text-sm text-slate-300">{collection.analysis_results.ai_insights}</p>
                          )}
                          {collection.analysis_results?.suspicious_indicators && (
                            <div className="mt-2 space-y-1">
                              {collection.analysis_results.suspicious_indicators.map((indicator, idx) => (
                                <div key={idx} className="text-xs text-orange-300 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  {indicator}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <Badge variant="outline">
                            Threat: {collection.analysis_results?.threat_score || 0}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="logs" className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <h2 className="text-2xl font-bold text-white">Forensic Log Analyzer</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => exportMutation.mutate('json')}
                  disabled={exportMutation.isPending}
                  className="border-slate-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  JSON
                </Button>
                <Button
                  variant="outline"
                  onClick={() => exportMutation.mutate('csv')}
                  disabled={exportMutation.isPending}
                  className="border-slate-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-blue-400" />
                    <div>
                      <p className="text-2xl font-bold text-white">{stats.total}</p>
                      <p className="text-xs text-slate-400">Total Logs</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-red-950/20 border-red-500/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                    <div>
                      <p className="text-2xl font-bold text-white">{stats.critical}</p>
                      <p className="text-xs text-red-300">Critical</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Shield className="w-8 h-8 text-orange-400" />
                    <div>
                      <p className="text-2xl font-bold text-white">{stats.high}</p>
                      <p className="text-xs text-slate-400">High</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Activity className="w-8 h-8 text-yellow-400" />
                    <div>
                      <p className="text-2xl font-bold text-white">{stats.warning}</p>
                      <p className="text-xs text-slate-400">Warnings</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                    <div>
                      <p className="text-2xl font-bold text-white">{stats.failed}</p>
                      <p className="text-xs text-slate-400">Failed Events</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Filter className="w-5 h-5 text-purple-400" />
                  Advanced Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-3">
                    <Label className="text-slate-300 mb-2 block">Search Logs</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder="Search by user, IP, description, metadata..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-slate-300 mb-2 block">Start Date</Label>
                    <Input
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>

                  <div>
                    <Label className="text-slate-300 mb-2 block">End Date</Label>
                    <Input
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>

                  <div>
                    <Label className="text-slate-300 mb-2 block">Severity</Label>
                    <Select value={severityFilter} onValueChange={setSeverityFilter}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="all">All Severities</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-slate-300 mb-2 block">Event Type</Label>
                    <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 max-h-64">
                        {eventTypes.map(type => (
                          <SelectItem key={type} value={type}>
                            {type === 'all' ? 'All Events' : type.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-slate-300 mb-2 block">Source</Label>
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="all">All Sources</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="user">User Actions</SelectItem>
                        <SelectItem value="api">API</SelectItem>
                        <SelectItem value="webhook">Webhooks</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="logview" className="space-y-4">
              <TabsList className="bg-slate-800 border-slate-700">
                <TabsTrigger value="logview">Forensic Logs</TabsTrigger>
                <TabsTrigger value="timeline">Timeline Reconstruction</TabsTrigger>
                <TabsTrigger value="temporal">Temporal Analysis</TabsTrigger>
              </TabsList>

              <TabsContent value="logview">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white">
                      Immutable Forensic Logs ({filteredLogs.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                      {logsLoading ? (
                        <div className="text-center py-12 text-slate-400">Loading logs...</div>
                      ) : filteredLogs.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">No logs match your filters</div>
                      ) : (
                        filteredLogs.map((log) => (
                          <div
                            key={log.id}
                            className="p-4 bg-slate-800/30 border border-slate-700 rounded-lg hover:border-purple-500/50 transition-all cursor-pointer"
                            onClick={() => setSelectedIncident(log)}
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
                                  <Badge variant="outline" className="text-xs text-green-400 border-green-500/30">
                                    Immutable
                                  </Badge>
                                </div>
                                <p className="text-white text-sm mb-2">{log.description}</p>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-slate-400">
                                  <div>
                                    <Clock className="w-3 h-3 inline mr-1" />
                                    {format(parseISO(log.timestamp), 'MMM d, HH:mm:ss.SSS')}
                                  </div>
                                  {log.user_id && (
                                    <div className="truncate">User: {log.user_id}</div>
                                  )}
                                  {log.ip_address && (
                                    <div>IP: {log.ip_address}</div>
                                  )}
                                  <div className="text-slate-500">
                                    {formatDistanceToNow(parseISO(log.timestamp), { addSuffix: true })}
                                  </div>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="timeline">
                <IncidentTimelineReconstructor 
                  logs={filteredLogs}
                  securityEvents={securityEvents}
                />
              </TabsContent>

              <TabsContent value="temporal">
                <TemporalAnalysisPanel logs={filteredLogs} />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="legal" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Legal Case Construction</h2>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Scale className="w-4 h-4 mr-2" />
                New Legal Case
              </Button>
            </div>

            <Card className="bg-amber-900/20 border-amber-500/50">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-amber-300 font-semibold mb-1">Legal Notice</h3>
                    <p className="text-amber-200 text-sm">
                      This system facilitates evidence organization and does not constitute legal advice. 
                      All legal conclusions must be made by licensed counsel. Ensure compliance with applicable 
                      discovery rules, privilege protections, and spoliation prevention measures.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <p className="text-sm text-slate-400">Active Cases</p>
                  <p className="text-2xl font-bold text-white">{legalCases.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <p className="text-sm text-slate-400">Court Exhibits</p>
                  <p className="text-2xl font-bold text-white">{exhibits.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <p className="text-sm text-slate-400">Chain Validated</p>
                  <p className="text-2xl font-bold text-green-400">
                    {exhibits.filter(e => e.chain_of_custody_verified).length}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="cases">
              <TabsList className="bg-slate-800 border-slate-700 grid grid-cols-3 lg:grid-cols-10 gap-1">
                <TabsTrigger value="cases">Cases</TabsTrigger>
                <TabsTrigger value="health">Health</TabsTrigger>
                <TabsTrigger value="search">Search</TabsTrigger>
                <TabsTrigger value="exhibits">Exhibits</TabsTrigger>
                <TabsTrigger value="workspace">Workspace</TabsTrigger>
                <TabsTrigger value="workproduct">Work Product</TabsTrigger>
                <TabsTrigger value="ai">AI</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="disclosure">Disclosure</TabsTrigger>
                <TabsTrigger value="messaging">Messages</TabsTrigger>
              </TabsList>

              <TabsContent value="cases">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white">Legal Matters</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {legalCases.map(legalCase => (
                        <div key={legalCase.id} 
                          className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer"
                          onClick={() => setSelectedCase(legalCase)}>
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="text-white font-semibold">{legalCase.matter_title}</h3>
                              <p className="text-sm text-slate-400">
                                {legalCase.case_number && `Case No. ${legalCase.case_number}`}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Badge variant={
                                legalCase.case_type.includes('defense') ? 'default' : 
                                legalCase.case_type.includes('prosecution') ? 'destructive' : 'secondary'
                              }>
                                {legalCase.case_type.replace(/_/g, ' ')}
                              </Badge>
                              <Badge variant="outline">{legalCase.procedural_status}</Badge>
                            </div>
                          </div>
                          {legalCase.jurisdiction && (
                            <p className="text-xs text-slate-400">
                              {legalCase.jurisdiction.court_name} • {legalCase.jurisdiction.state}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="health">
                {selectedCase ? (
                  <CaseHealthDashboard />
                ) : (
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-8 text-center">
                      <p className="text-slate-400">Select a legal case to view health metrics</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="search">
                <GlobalEvidenceSearch />
              </TabsContent>

              <TabsContent value="exhibits">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white">Court Exhibits</CardTitle>
                      {selectedCase && (
                        <Button 
                          size="sm"
                          onClick={() => generateExhibitNumberMutation.mutate({
                            legal_case_id: selectedCase.id,
                            numbering_scheme: 'letter'
                          })}
                        >
                          Generate Next Number
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {selectedCase ? (
                      <div className="space-y-3">
                        {exhibits.map(exhibit => (
                          <div key={exhibit.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <Badge className="bg-blue-500/20 text-blue-300">
                                    {exhibit.exhibit_number}
                                  </Badge>
                                  <h3 className="text-white font-medium">{exhibit.description}</h3>
                                </div>
                                <div className="flex gap-2 mb-2">
                                  {exhibit.chain_of_custody_verified ? (
                                    <Badge className="bg-green-500/20 text-green-300">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Chain Verified
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-red-500/20 text-red-300">
                                      <AlertTriangle className="w-3 h-3 mr-1" />
                                      Chain Unverified
                                    </Badge>
                                  )}
                                  <Badge variant="outline">{exhibit.admissibility_status}</Badge>
                                </div>
                                <p className="text-xs text-slate-400">{exhibit.authentication_method}</p>
                              </div>
                              <Button size="sm" variant="outline" 
                                onClick={() => validateChainMutation.mutate({ evidence_id: exhibit.evidence_source_id })}>
                                Validate Chain
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400 text-center py-8">Select a legal case to view exhibits</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="workspace">
                {selectedCase ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <EvidenceTimeline caseId={selectedCase.forensic_case_ids?.[0]} />
                      <AdvancedEvidenceSearch caseId={selectedCase.forensic_case_ids?.[0]} />
                    </div>
                    <CaseWorkspace legalCaseId={selectedCase.id} />
                  </div>
                ) : (
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-8 text-center">
                      <p className="text-slate-400">Select a legal case to access the workspace</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="workproduct">
                {selectedCase ? (
                  <AttorneyWorkspaceTab legalCaseId={selectedCase.id} />
                ) : (
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-8 text-center">
                      <p className="text-slate-400">Select a legal case to manage work product</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="ai">
                {selectedCase ? (
                  <LegalAIAssistant legalCaseId={selectedCase.id} />
                ) : (
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-8 text-center">
                      <p className="text-slate-400">Select a legal case to use AI assistant</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="tasks">
                {selectedCase ? (
                  <CaseTaskManager legalCaseId={selectedCase.id} />
                ) : (
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-8 text-center">
                      <p className="text-slate-400">Select a legal case to manage tasks</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="disclosure">
                {selectedCase ? (
                  <DisclosureAutomation legalCaseId={selectedCase.id} />
                ) : (
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-8 text-center">
                      <p className="text-slate-400">Select a legal case to manage disclosures</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="messaging">
                {selectedCase ? (
                  <CaseMessaging legalCaseId={selectedCase.id} />
                ) : (
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-8 text-center">
                      <p className="text-slate-400">Select a legal case to view messages</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Analysis Results</DialogTitle>
          </DialogHeader>
          {analysisResults && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <h3 className="text-white font-semibold mb-2">AI Insights</h3>
                <p className="text-slate-300">{analysisResults.analysis?.ai_insights}</p>
              </div>
              <pre className="text-sm text-slate-300 bg-slate-950 p-4 rounded-lg overflow-x-auto">
                {JSON.stringify(analysisResults, null, 2)}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Create Legal Case</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Matter title"
              value={newCaseData.matter_title}
              onChange={(e) => setNewCaseData({ ...newCaseData, matter_title: e.target.value })}
              className="bg-slate-800 border-slate-700 text-white"
            />
            <select
              value={newCaseData.case_type}
              onChange={(e) => setNewCaseData({ ...newCaseData, case_type: e.target.value })}
              className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
            >
              <option value="criminal_prosecution">Criminal Prosecution</option>
              <option value="criminal_defense">Criminal Defense</option>
              <option value="civil_plaintiff">Civil Plaintiff</option>
              <option value="civil_defendant">Civil Defendant</option>
              <option value="investigation">Investigation</option>
            </select>
            <Input
              placeholder="Case number (optional)"
              value={newCaseData.case_number}
              onChange={(e) => setNewCaseData({ ...newCaseData, case_number: e.target.value })}
              className="bg-slate-800 border-slate-700 text-white"
            />
            <Button onClick={() => createCaseMutation.mutate(newCaseData)} disabled={!newCaseData.matter_title}>
              Create Case
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}