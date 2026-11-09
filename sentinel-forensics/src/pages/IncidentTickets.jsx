import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Plus,
  CheckCircle,
  Loader2,
  Shield
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { DateUtils } from '../components/utils/DateUtils';
import { resilientAPI } from '../components/utils/ResilientAPIClient';

export default function IncidentTickets() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const queryClient = useQueryClient();

  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    severity: 'medium',
    assigned_to: '',
    incident_type: 'data_breach'
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: incidents = [], isLoading, refetch } = useQuery({
    queryKey: ['incident-tickets', filterStatus],
    queryFn: async () => {
      const filter = {};
      
      if (filterStatus !== 'all') filter.status = filterStatus;

      try {
        return await resilientAPI.filterEntity('IncidentResponse', filter, '-detected_at', 50, 0, 15000);
      } catch (error) {
        console.warn('Incident load failed:', error);
        return [];
      }
    },
    initialData: []
  });

  const createIncidentMutation = useMutation({
    mutationFn: async (ticketData) => {
      if (!ticketData.title.trim()) {
        throw new Error('Title is required');
      }

      return await base44.entities.IncidentResponse.create({
        incident_id: `INC-${Date.now()}`,
        incident_type: ticketData.incident_type,
        severity: ticketData.severity,
        status: 'detected',
        detected_at: new Date().toISOString(),
        detected_by: user?.email || 'system',
        description: ticketData.description,
        assigned_to: ticketData.assigned_to || user?.email,
        timeline: [{
          timestamp: new Date().toISOString(),
          event: 'Incident ticket created',
          actor: user?.email || 'system',
          details: 'Initial incident report filed'
        }],
        response_actions: [],
        evidence_collected: [],
        affected_systems: [],
        affected_users: []
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-tickets'] });
      setCreateDialogOpen(false);
      setNewTicket({
        title: '',
        description: '',
        severity: 'medium',
        assigned_to: '',
        incident_type: 'data_breach'
      });
      toast.success('Incident ticket created!');
    },
    onError: (error) => {
      toast.error('Failed to create ticket: ' + error.message);
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      return await base44.entities.IncidentResponse.update(id, {
        status,
        timeline: [
          ...(incidents.find(i => i.id === id)?.timeline || []),
          {
            timestamp: new Date().toISOString(),
            event: `Status changed to ${status}`,
            actor: user?.email,
            details: `Incident status updated`
          }
        ],
        ...(status === 'closed' ? { closed_at: new Date().toISOString(), closed_by: user?.email } : {})
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-tickets'] });
      toast.success('Status updated');
    },
    onError: (error) => {
      toast.error('Update failed: ' + error.message);
    }
  });

  const getSeverityBadge = (severity) => {
    const badges = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/50',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      low: 'bg-blue-500/20 text-blue-400 border-blue-500/50'
    };
    return badges[severity] || badges.medium;
  };

  const getStatusBadge = (status) => {
    const badges = {
      detected: 'bg-red-500/20 text-red-400',
      investigating: 'bg-orange-500/20 text-orange-400',
      contained: 'bg-yellow-500/20 text-yellow-400',
      eradicated: 'bg-blue-500/20 text-blue-400',
      recovered: 'bg-green-500/20 text-green-400',
      closed: 'bg-gray-500/20 text-gray-400'
    };
    return badges[status] || badges.detected;
  };

  const openIncidents = incidents.filter(i => i.status !== 'closed').length;
  const criticalIncidents = incidents.filter(i => i.severity === 'critical' && i.status !== 'closed').length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Incident Response Tickets</h1>
          <p className="text-slate-400">Track security incidents from detection to resolution</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => refetch()}
            variant="outline"
            className="border-blue-500/50 text-blue-400 min-h-[44px]"
          >
            <Loader2 className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 min-h-[44px]"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Incident
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">{openIncidents}</p>
                <p className="text-xs text-slate-400">Open Incidents</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Shield className="w-10 h-10 text-red-400" />
              <div>
                <p className="text-3xl font-bold text-white">{criticalIncidents}</p>
                <p className="text-xs text-slate-400">Critical</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {incidents.filter(i => i.status === 'closed').length}
                </p>
                <p className="text-xs text-slate-400">Resolved</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white min-h-[44px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-white">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="detected">Detected</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="contained">Contained</SelectItem>
              <SelectItem value="eradicated">Eradicated</SelectItem>
              <SelectItem value="recovered">Recovered</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Incident List */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Active Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-400" />
              <p className="text-slate-400">Loading incidents...</p>
            </div>
          ) : incidents.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 mb-4">No incident tickets found</p>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="bg-red-600 hover:bg-red-700 min-h-[44px]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create First Incident
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.map((incident) => (
                <div
                  key={incident.id}
                  className={`p-4 rounded-lg border ${
                    incident.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                    incident.severity === 'high' ? 'bg-orange-500/10 border-orange-500/30' :
                    'bg-slate-800/50 border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <code className="text-xs text-slate-500">{incident.incident_id}</code>
                        <Badge className={getSeverityBadge(incident.severity)}>
                          {incident.severity.toUpperCase()}
                        </Badge>
                        <Badge className={getStatusBadge(incident.status)}>
                          {incident.status.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                      </div>

                      <p className="font-semibold text-white mb-2">{incident.description || 'Untitled Incident'}</p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                        <div>
                          <p className="text-slate-500">Type</p>
                          <p className="text-white capitalize">{incident.incident_type.replace(/_/g, ' ')}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Detected</p>
                          <p className="text-white">{DateUtils.safeRelativeTime(incident.detected_at)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Assigned To</p>
                          <p className="text-white truncate">{incident.assigned_to || 'Unassigned'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Evidence</p>
                          <p className="text-white">{incident.evidence_collected?.length || 0} items</p>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        {incident.status !== 'closed' && (
                          <>
                            <Button
                              onClick={() => updateStatusMutation.mutate({ 
                                id: incident.id, 
                                status: incident.status === 'detected' ? 'investigating' : 
                                        incident.status === 'investigating' ? 'contained' :
                                        incident.status === 'contained' ? 'eradicated' :
                                        incident.status === 'eradicated' ? 'recovered' : 'closed'
                              })}
                              disabled={updateStatusMutation.isPending}
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 min-h-[40px]"
                            >
                              {updateStatusMutation.isPending ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <>Advance Status →</>
                              )}
                            </Button>
                            <Button
                              onClick={() => {
                                if (confirm('Close this incident?')) {
                                  updateStatusMutation.mutate({ id: incident.id, status: 'closed' });
                                }
                              }}
                              size="sm"
                              variant="outline"
                              className="border-green-500/50 text-green-400 min-h-[40px]"
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Close
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Incident Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Incident Title *</Label>
              <Input
                value={newTicket.title}
                onChange={(e) => setNewTicket({...newTicket, title: e.target.value})}
                placeholder="Brief description of the incident"
                className="bg-slate-800 border-slate-700 text-white min-h-[44px]"
                style={{ fontSize: '16px' }}
              />
            </div>

            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                value={newTicket.description}
                onChange={(e) => setNewTicket({...newTicket, description: e.target.value})}
                placeholder="Detailed incident description..."
                className="bg-slate-800 border-slate-700 text-white min-h-[120px]"
                style={{ fontSize: '16px' }}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Incident Type</Label>
                <Select value={newTicket.incident_type} onValueChange={(val) => setNewTicket({...newTicket, incident_type: val})}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="data_breach">Data Breach</SelectItem>
                    <SelectItem value="ransomware">Ransomware</SelectItem>
                    <SelectItem value="ddos">DDoS Attack</SelectItem>
                    <SelectItem value="unauthorized_access">Unauthorized Access</SelectItem>
                    <SelectItem value="malware_outbreak">Malware Outbreak</SelectItem>
                    <SelectItem value="insider_threat">Insider Threat</SelectItem>
                    <SelectItem value="api_compromise">API Compromise</SelectItem>
                    <SelectItem value="credential_theft">Credential Theft</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Severity</Label>
                <Select value={newTicket.severity} onValueChange={(val) => setNewTicket({...newTicket, severity: val})}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assign To (Optional)</Label>
              <Input
                value={newTicket.assigned_to}
                onChange={(e) => setNewTicket({...newTicket, assigned_to: e.target.value})}
                placeholder={user?.email || "analyst@company.com"}
                className="bg-slate-800 border-slate-700 text-white min-h-[44px]"
                style={{ fontSize: '16px' }}
              />
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-700">
              <Button
                onClick={() => setCreateDialogOpen(false)}
                variant="outline"
                className="flex-1 border-slate-700 min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                onClick={() => createIncidentMutation.mutate(newTicket)}
                disabled={!newTicket.title || !newTicket.description || createIncidentMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 min-h-[44px]"
              >
                {createIncidentMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Incident
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}