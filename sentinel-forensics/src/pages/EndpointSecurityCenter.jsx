import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../components/hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Shield, AlertTriangle, Activity, Terminal, FolderOpen, Trash2, Lock, Unlock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function EndpointSecurityCenter() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showInvestigation, setShowInvestigation] = useState(false);
  const [investigationResult, setInvestigationResult] = useState(null);

  const { data: devices = [] } = useQuery({
    queryKey: ['devices', user?.organization_id],
    queryFn: () => base44.entities.Device.filter({ organization_id: user.organization_id }),
    enabled: !!user?.organization_id
  });

  const { data: analyses = [] } = useQuery({
    queryKey: ['endpoint-analyses', user?.organization_id],
    queryFn: () => base44.entities.EndpointBehaviorAnalysis.filter({ organization_id: user.organization_id }, '-created_date', 50),
    enabled: !!user?.organization_id
  });

  const isolateMutation = useMutation({
    mutationFn: ({ device_id, reason }) => base44.functions.invoke('isolateEndpoint', { device_id, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries(['devices']);
      toast.success('Endpoint isolated successfully');
    }
  });

  const investigateMutation = useMutation({
    mutationFn: ({ device_id, operation, parameters }) => 
      base44.functions.invoke('remoteEndpointInvestigation', { device_id, operation, parameters }),
    onSuccess: (data) => {
      setInvestigationResult(data);
    }
  });

  const threatDevices = devices.filter(d => 
    analyses.some(a => a.device_id === d.id && a.threat_detected)
  );

  const isolatedDevices = devices.filter(d => d.status === 'isolated');

  const getThreatColor = (score) => {
    if (score >= 80) return 'text-red-400';
    if (score >= 50) return 'text-orange-400';
    return 'text-yellow-400';
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Endpoint Security Center</h1>
            <p className="text-slate-400">Real-time behavioral analysis and remote investigation</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Endpoints</p>
                  <p className="text-2xl font-bold text-white">{devices.length}</p>
                </div>
                <Shield className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Threats Detected</p>
                  <p className="text-2xl font-bold text-white">{threatDevices.length}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Isolated</p>
                  <p className="text-2xl font-bold text-white">{isolatedDevices.length}</p>
                </div>
                <Lock className="w-8 h-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Analyses Run</p>
                  <p className="text-2xl font-bold text-white">{analyses.length}</p>
                </div>
                <Activity className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="threats" className="space-y-4">
          <TabsList className="bg-slate-900/50 border-slate-800">
            <TabsTrigger value="threats">Threat Analysis</TabsTrigger>
            <TabsTrigger value="devices">All Devices</TabsTrigger>
            <TabsTrigger value="investigation">Remote Investigation</TabsTrigger>
          </TabsList>

          <TabsContent value="threats">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Behavioral Threat Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                {analyses.filter(a => a.threat_detected).length === 0 ? (
                  <p className="text-slate-400 text-center py-8">No threats detected</p>
                ) : (
                  <div className="space-y-3">
                    {analyses.filter(a => a.threat_detected).map(analysis => (
                      <div key={analysis.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold text-white">{analysis.device_name || analysis.device_id}</h3>
                              <Badge className={`${getThreatColor(analysis.threat_score)} bg-opacity-20`}>
                                Threat Score: {analysis.threat_score}
                              </Badge>
                              {analysis.auto_isolated && (
                                <Badge className="bg-yellow-500/20 text-yellow-300">Auto-Isolated</Badge>
                              )}
                            </div>
                            {analysis.indicators?.map((indicator, idx) => (
                              <p key={idx} className="text-sm text-slate-400">{indicator}</p>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedDevice(analysis.device_id);
                                setShowInvestigation(true);
                              }}
                            >
                              Investigate
                            </Button>
                            {!analysis.auto_isolated && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => isolateMutation.mutate({
                                  device_id: analysis.device_id,
                                  reason: `Threat score: ${analysis.threat_score}`
                                })}
                              >
                                Isolate
                              </Button>
                            )}
                          </div>
                        </div>

                        {analysis.suspicious_processes?.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-semibold text-slate-400">Suspicious Processes:</p>
                            {analysis.suspicious_processes.map((proc, idx) => (
                              <div key={idx} className="p-2 bg-slate-900/50 rounded text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-white font-mono">{proc.name} (PID: {proc.pid})</span>
                                  <Badge variant="outline" className="text-xs">{proc.risk_level}</Badge>
                                </div>
                                <p className="text-slate-400 mt-1">{proc.behavior}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="devices">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">All Endpoints</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {devices.map(device => (
                    <div key={device.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 flex items-center justify-between">
                      <div>
                        <h3 className="text-white font-medium">{device.device_name || device.id}</h3>
                        <p className="text-sm text-slate-400">{device.ip_address}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={device.status === 'isolated' ? 'destructive' : 'secondary'}>
                          {device.status}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedDevice(device.id);
                            setShowInvestigation(true);
                          }}
                        >
                          <Terminal className="w-4 h-4 mr-2" />
                          Investigate
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="investigation">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Remote Endpoint Investigation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Button
                    variant="outline"
                    className="h-24 flex flex-col gap-2"
                    onClick={() => investigateMutation.mutate({
                      device_id: selectedDevice || devices[0]?.id,
                      operation: 'list_processes'
                    })}
                    disabled={!selectedDevice && devices.length === 0}
                  >
                    <Activity className="w-6 h-6" />
                    List Processes
                  </Button>
                  <Button
                    variant="outline"
                    className="h-24 flex flex-col gap-2"
                    onClick={() => investigateMutation.mutate({
                      device_id: selectedDevice || devices[0]?.id,
                      operation: 'list_files',
                      parameters: { path: 'C:\\' }
                    })}
                    disabled={!selectedDevice && devices.length === 0}
                  >
                    <FolderOpen className="w-6 h-6" />
                    Browse Files
                  </Button>
                  <Button
                    variant="outline"
                    className="h-24 flex flex-col gap-2"
                    onClick={() => investigateMutation.mutate({
                      device_id: selectedDevice || devices[0]?.id,
                      operation: 'capture_memory'
                    })}
                    disabled={!selectedDevice && devices.length === 0}
                  >
                    <Shield className="w-6 h-6" />
                    Capture Memory
                  </Button>
                  <Button
                    variant="outline"
                    className="h-24 flex flex-col gap-2"
                    onClick={() => investigateMutation.mutate({
                      device_id: selectedDevice || devices[0]?.id,
                      operation: 'run_command',
                      parameters: { command: 'netstat -ano' }
                    })}
                    disabled={!selectedDevice && devices.length === 0}
                  >
                    <Terminal className="w-6 h-6" />
                    Run Command
                  </Button>
                </div>

                {investigationResult && (
                  <div className="mt-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <h3 className="text-white font-semibold mb-3">Investigation Result</h3>
                    <pre className="text-sm text-slate-300 overflow-x-auto">
                      {JSON.stringify(investigationResult.result, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showInvestigation} onOpenChange={setShowInvestigation}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-white">Remote Investigation: {selectedDevice}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Button onClick={() => investigateMutation.mutate({
                device_id: selectedDevice,
                operation: 'list_processes'
              })}>
                <Activity className="w-4 h-4 mr-2" />
                List Processes
              </Button>
              <Button onClick={() => investigateMutation.mutate({
                device_id: selectedDevice,
                operation: 'list_files',
                parameters: { path: 'C:\\' }
              })}>
                <FolderOpen className="w-4 h-4 mr-2" />
                Browse Files
              </Button>
            </div>
            {investigationResult && (
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <pre className="text-sm text-slate-300 overflow-x-auto">
                  {JSON.stringify(investigationResult.result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}