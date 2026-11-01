import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, Radio, User, Smartphone, Wifi, MapPin, Plus, AlertTriangle, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SessionCreationDialog from '../components/controlplane/SessionCreationDialog';
import PageHeader from '../components/common/PageHeader';

export default function ControlPlaneDefense() {
  const navigate = useNavigate();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: sessions = [] } = useQuery({
    queryKey: ['control-plane-sessions'],
    queryFn: async () => {
      const user = await base44.auth.me();
      return await base44.entities.IncidentSession.filter({
        organization_id: user.organization_id
      }, '-created_date');
    }
  });

  const activeSessions = sessions.filter(s => s.status === 'ACTIVE');
  const latestSession = activeSessions[0];

  const planes = [
    {
      id: 'CARRIER',
      name: 'Carrier Layer',
      icon: Radio,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      description: 'SIM swap, eSIM reprovision, port-out abuse',
      score: latestSession?.risk_summary?.carrier_score || 0
    },
    {
      id: 'ACCOUNT',
      name: 'Account Layer',
      icon: User,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      description: 'Google session/token compromise, OAuth hijacking',
      score: latestSession?.risk_summary?.account_score || 0
    },
    {
      id: 'DEVICE',
      name: 'Device Layer',
      icon: Smartphone,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      description: 'MDM, Device Admin, Accessibility RAT, sideloaded malware',
      score: latestSession?.risk_summary?.device_score || 0
    },
    {
      id: 'NETWORK',
      name: 'Network Layer',
      icon: Wifi,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      description: 'Rogue Wi-Fi, DNS poisoning, proxy/VPN misuse',
      score: latestSession?.risk_summary?.network_score || 0
    },
    {
      id: 'PHYSICAL',
      name: 'Physical Layer',
      icon: MapPin,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
      description: 'Local access, proximity exploitation, shoulder surfing',
      score: latestSession?.risk_summary?.physical_score || 0
    }
  ];

  const getRiskLevel = (score) => {
    if (score >= 70) return { color: 'text-red-400', bg: 'bg-red-500/20', label: 'HIGH' };
    if (score >= 40) return { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'MEDIUM' };
    return { color: 'text-green-400', bg: 'bg-green-500/20', label: 'LOW' };
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PageHeader
        title="Control Plane Defense"
        description="Systematic incident response framework for persistent adversary scenarios"
        icon={Shield}
        actions={[
          {
            label: 'Start Incident Session',
            icon: Plus,
            variant: 'default',
            className: 'bg-red-600 hover:bg-red-700',
            onClick: () => setCreateDialogOpen(true)
          }
        ]}
      />

      {/* Active Session Banner */}
      {latestSession && (
        <Card className="bg-slate-900/50 border-slate-800 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">{latestSession.session_name}</h3>
                <p className="text-sm text-slate-400">
                  Device: {latestSession.device_label} • Overall Risk: {latestSession.risk_summary?.overall_score || 0}/100
                </p>
              </div>
              <Button
                onClick={() => navigate(`/ControlPlaneSession/${latestSession.id}`)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Open Session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5 Control Planes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {planes.map((plane) => {
          const risk = getRiskLevel(plane.score);
          const Icon = plane.icon;

          return (
            <Card
              key={plane.id}
              className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
              onClick={() => latestSession && navigate(`/ControlPlaneSession/${latestSession.id}?plane=${plane.id}`)}
            >
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-3 rounded-lg ${plane.bgColor}`}>
                    <Icon className={`w-6 h-6 ${plane.color}`} />
                  </div>
                  <Badge className={`${risk.bg} ${risk.color}`}>
                    {risk.label}
                  </Badge>
                </div>
                <CardTitle className="text-white text-lg">{plane.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-400 mb-4">{plane.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Risk Score</span>
                  <span className={`text-2xl font-bold ${risk.color}`}>{plane.score}</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full ${risk.bg}`}
                    style={{ width: `${plane.score}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Session History */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Session History</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 mb-4">No incident sessions yet</p>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="bg-red-600 hover:bg-red-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Start First Session
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="p-4 bg-slate-800/30 rounded-lg border border-slate-700 flex items-center justify-between cursor-pointer hover:border-slate-600"
                  onClick={() => navigate(`/ControlPlaneSession/${session.id}`)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-white font-semibold">{session.session_name}</h4>
                      <Badge className={
                        session.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                        session.status === 'CONTAINED' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-slate-500/20 text-slate-400'
                      }>
                        {session.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-400">
                      Device: {session.device_label} • Risk: {session.risk_summary?.overall_score || 0}/100
                    </p>
                  </div>
                  {session.status === 'CLOSED' ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SessionCreationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}