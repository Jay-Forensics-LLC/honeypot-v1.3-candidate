import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, Radio, User, Smartphone, Wifi, MapPin, 
  Camera, FileText, Lock, Download, CheckCircle, AlertTriangle 
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '../components/common/PageHeader';
import AutomationTab from '../components/controlplane/AutomationTab';

export default function ControlPlaneSession() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(searchParams.get('plane') || 'overview');

  const { data: session, isLoading } = useQuery({
    queryKey: ['control-plane-session', sessionId],
    queryFn: async () => {
      return await base44.entities.IncidentSession.get(sessionId);
    }
  });

  const { data: indicators = [] } = useQuery({
    queryKey: ['control-plane-indicators', sessionId],
    queryFn: async () => {
      return await base44.entities.ControlPlaneIndicator.filter({
        session_id: sessionId
      }, '-detected_at');
    },
    enabled: !!sessionId
  });

  const { data: actions = [] } = useQuery({
    queryKey: ['control-plane-actions', sessionId],
    queryFn: async () => {
      return await base44.entities.ControlPlaneAction.filter({
        session_id: sessionId
      }, '-created_date');
    },
    enabled: !!sessionId
  });

  const { data: evidence = [] } = useQuery({
    queryKey: ['control-plane-evidence', sessionId],
    queryFn: async () => {
      return await base44.entities.ControlPlaneEvidence.filter({
        session_id: sessionId
      }, '-created_date');
    },
    enabled: !!sessionId
  });

  const { data: chain = [] } = useQuery({
    queryKey: ['control-plane-chain', sessionId],
    queryFn: async () => {
      return await base44.entities.ChainOfCustodyEntry.filter({
        session_id: sessionId
      }, 'created_date');
    },
    enabled: !!sessionId
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('controlPlaneSession', {
        operation: 'closeSession',
        session_id: sessionId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['control-plane-session', sessionId] });
      toast.success('Session closed');
    }
  });

  const exportMutation = useMutation({
    mutationFn: async (format) => {
      const response = await base44.functions.invoke('controlPlaneExport', {
        session_id: sessionId,
        format
      });
      return { format, data: response.data };
    },
    onSuccess: ({ format, data }) => {
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session_${sessionId}_export.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success('Export complete');
    }
  });

  if (isLoading) {
    return <div className="p-6 text-white">Loading session...</div>;
  }

  if (!session) {
    return <div className="p-6 text-white">Session not found</div>;
  }

  const planes = [
    { id: 'CARRIER', name: 'Carrier', icon: Radio, score: session.risk_summary?.carrier_score || 0 },
    { id: 'ACCOUNT', name: 'Account', icon: User, score: session.risk_summary?.account_score || 0 },
    { id: 'DEVICE', name: 'Device', icon: Smartphone, score: session.risk_summary?.device_score || 0 },
    { id: 'NETWORK', name: 'Network', icon: Wifi, score: session.risk_summary?.network_score || 0 },
    { id: 'PHYSICAL', name: 'Physical', icon: MapPin, score: session.risk_summary?.physical_score || 0 }
  ];

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PageHeader
        title={session.session_name}
        description={`Device: ${session.device_label} • Overall Risk: ${session.risk_summary?.overall_score || 0}/100`}
        icon={Shield}
        actions={[
          {
            label: 'Export JSON',
            icon: Download,
            variant: 'outline',
            onClick: () => exportMutation.mutate('json')
          },
          {
            label: session.status === 'ACTIVE' ? 'Close Session' : 'Closed',
            icon: session.status === 'ACTIVE' ? Lock : CheckCircle,
            variant: session.status === 'ACTIVE' ? 'destructive' : 'outline',
            onClick: () => session.status === 'ACTIVE' && closeMutation.mutate(),
            disabled: session.status !== 'ACTIVE'
          }
        ]}
      />

      <div className="grid grid-cols-5 gap-4 mb-6">
        {planes.map((plane) => {
          const Icon = plane.icon;
          const planeIndicators = indicators.filter(i => i.plane === plane.id);
          return (
            <Card key={plane.id} className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-white">{plane.name}</span>
                </div>
                <div className="text-2xl font-bold text-white">{plane.score}</div>
                <div className="text-xs text-slate-500">{planeIndicators.length} indicators</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-900 border-slate-800">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="indicators">Indicators ({indicators.length})</TabsTrigger>
          <TabsTrigger value="actions">Actions ({actions.length})</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="evidence">Evidence ({evidence.length})</TabsTrigger>
          <TabsTrigger value="chain">Chain of Custody ({chain.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Session Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-slate-400 text-sm">Initial Narrative:</span>
                <p className="text-white mt-1">{session.initial_narrative || 'No narrative provided'}</p>
              </div>
              {session.location && (
                <div>
                  <span className="text-slate-400 text-sm">Location:</span>
                  <p className="text-white mt-1">{session.location}</p>
                </div>
              )}
              <div>
                <span className="text-slate-400 text-sm">Status:</span>
                <div className="mt-1">
                  <Badge className={
                    session.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                    session.status === 'CONTAINED' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-slate-500/20 text-slate-400'
                  }>
                    {session.status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="indicators" className="mt-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Indicators</CardTitle>
            </CardHeader>
            <CardContent>
              {indicators.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No indicators recorded yet</p>
              ) : (
                <div className="space-y-3">
                  {indicators.map((indicator) => (
                    <div key={indicator.id} className="p-4 bg-slate-800/30 rounded border border-slate-700">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-white font-semibold">{indicator.title}</h4>
                        <Badge className={
                          indicator.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                          indicator.severity === 'HIGH' ? 'bg-orange-500/20 text-orange-400' :
                          indicator.severity === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/20 text-blue-400'
                        }>
                          {indicator.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-400 mb-2">{indicator.description}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{indicator.plane}</Badge>
                        <Badge className={
                          indicator.status === 'CONFIRMED' ? 'bg-red-500/20 text-red-400' :
                          indicator.status === 'MITIGATED' ? 'bg-green-500/20 text-green-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }>
                          {indicator.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="mt-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Mitigation Actions</CardTitle>
            </CardHeader>
            <CardContent>
              {actions.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No actions recorded yet</p>
              ) : (
                <div className="space-y-3">
                  {actions.map((action) => (
                    <div key={action.id} className="p-4 bg-slate-800/30 rounded border border-slate-700">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-white font-semibold">{action.action_title}</h4>
                        <Badge className={
                          action.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                          action.status === 'FAILED' ? 'bg-red-500/20 text-red-400' :
                          'bg-blue-500/20 text-blue-400'
                        }>
                          {action.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-400 mb-2">{action.action_description}</p>
                      {action.user_notes && (
                        <p className="text-xs text-slate-500 mt-2">Notes: {action.user_notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence" className="mt-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Evidence Artifacts</CardTitle>
            </CardHeader>
            <CardContent>
              {evidence.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No evidence captured yet</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {evidence.map((item) => (
                    <div key={item.id} className="p-4 bg-slate-800/30 rounded border border-slate-700">
                      <div className="flex items-center gap-2 mb-2">
                        {item.artifact_type === 'PHOTO' && <Camera className="w-4 h-4 text-blue-400" />}
                        {item.artifact_type === 'SCREENSHOT' && <FileText className="w-4 h-4 text-green-400" />}
                        {item.artifact_type === 'NOTE' && <FileText className="w-4 h-4 text-yellow-400" />}
                        <span className="text-white text-sm">{item.artifact_type}</span>
                      </div>
                      <p className="text-sm text-slate-400">{item.caption || 'No caption'}</p>
                      {item.sha256_hash && (
                        <p className="text-xs text-slate-600 mt-2 font-mono truncate">
                          {item.sha256_hash}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation" className="mt-6">
          <AutomationTab sessionId={sessionId} />
        </TabsContent>

        <TabsContent value="chain" className="mt-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Chain of Custody</CardTitle>
            </CardHeader>
            <CardContent>
              {chain.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No chain entries</p>
              ) : (
                <div className="space-y-3">
                  {chain.map((entry, idx) => (
                    <div key={entry.id} className="relative">
                      {idx !== chain.length - 1 && (
                        <div className="absolute left-4 top-12 bottom-0 w-0.5 bg-slate-700" />
                      )}
                      <div className="flex gap-4">
                        <div className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        </div>
                        <div className="flex-1 pb-8">
                          <div className="bg-slate-800/30 rounded border border-slate-700 p-4">
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="outline" className="text-xs">
                                {entry.entry_type}
                              </Badge>
                              <span className="text-xs text-slate-500">{entry.timestamp_local}</span>
                            </div>
                            <p className="text-sm text-white">{entry.narrative}</p>
                            <p className="text-xs text-slate-600 mt-2 font-mono truncate">
                              Hash: {entry.entry_hash}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}