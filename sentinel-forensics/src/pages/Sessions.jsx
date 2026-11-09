import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Shield, 
  Activity, 
  Wifi, 
  Radio, 
  Network,
  Search,
  Calendar,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Eye
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { safeString, formatEnumTitle } from "../components/utils/SafetyUtils";

export default function Sessions() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState("-start_timestamp");
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['scan-sessions', sortBy],
    queryFn: () => base44.entities.ScanSession.list(sortBy, 100),
    initialData: []
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId) => {
      // Delete related observations first
      const observations = await base44.entities.Observation.filter({ session_id: sessionId });
      for (const obs of observations) {
        await base44.entities.Observation.delete(obs.id);
      }
      
      // Delete related findings
      const findings = await base44.entities.IOCFinding.filter({ session_id: sessionId });
      for (const finding of findings) {
        await base44.entities.IOCFinding.delete(finding.id);
      }
      
      // Delete session
      await base44.entities.ScanSession.delete(sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scan-sessions'] });
      toast.success('Session deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete session');
    }
  });

  // Filter sessions
  const filteredSessions = sessions.filter(session => {
    const matchesSearch = 
      safeString(session.location_tag).toLowerCase().includes(searchTerm.toLowerCase()) ||
      safeString(session.session_id).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || session.status === filterStatus;
    const matchesType = filterType === "all" || session.session_type === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  // Get session icon
  const getSessionIcon = (type) => {
    const icons = {
      ble: Radio,
      wifi: Wifi,
      network: Network,
      comprehensive: Shield
    };
    return icons[type] || Activity;
  };

  // Get risk color
  const getRiskColor = (score) => {
    if (!score) return 'text-slate-500';
    if (score >= 80) return 'text-red-500';
    if (score >= 60) return 'text-orange-500';
    if (score >= 40) return 'text-yellow-500';
    return 'text-green-500';
  };

  // Get status color
  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-blue-500/20 text-blue-400',
      completed: 'bg-green-500/20 text-green-400',
      analyzing: 'bg-yellow-500/20 text-yellow-400',
      exported: 'bg-purple-500/20 text-purple-400'
    };
    return colors[status] || 'bg-slate-500/20 text-slate-400';
  };

  const stats = {
    total: sessions.length,
    active: sessions.filter(s => s.status === 'active').length,
    completed: sessions.filter(s => s.status === 'completed').length,
    highRisk: sessions.filter(s => (s.risk_score || 0) >= 70).length
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Scan Sessions</h1>
          <p className="text-slate-400">View and manage all forensic scan sessions</p>
        </div>
        <Link to={createPageUrl("NewScanSession")}>
          <Button className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800">
            <Activity className="w-4 h-4 mr-2" />
            New Scan Session
          </Button>
        </Link>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Shield className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">{stats.total}</p>
                <p className="text-xs text-slate-400">Total Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Activity className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-3xl font-bold text-white">{stats.active}</p>
                <p className="text-xs text-slate-400">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">{stats.completed}</p>
                <p className="text-xs text-slate-400">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-red-400" />
              <div>
                <p className="text-3xl font-bold text-white">{stats.highRisk}</p>
                <p className="text-xs text-slate-400">High Risk</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search sessions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="analyzing">Analyzing</SelectItem>
                <SelectItem value="exported">Exported</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="ble">BLE</SelectItem>
                <SelectItem value="wifi">WiFi</SelectItem>
                <SelectItem value="network">Network</SelectItem>
                <SelectItem value="comprehensive">Comprehensive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sessions List */}
      <div className="grid gap-4">
        {isLoading ? (
          <Card className="bg-slate-900/50 border-slate-800 p-12">
            <div className="text-center text-slate-400">
              <Activity className="w-16 h-16 mx-auto mb-4 animate-pulse" />
              <p>Loading sessions...</p>
            </div>
          </Card>
        ) : filteredSessions.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800 p-12">
            <div className="text-center text-slate-400">
              <Shield className="w-16 h-16 mx-auto mb-4" />
              <p className="text-lg">No sessions found</p>
              <p className="text-sm mt-2">Create your first scan session to get started</p>
            </div>
          </Card>
        ) : (
          filteredSessions.map((session) => {
            const SessionIcon = getSessionIcon(session.session_type);
            return (
              <Card key={session.id} className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-700 rounded-lg flex items-center justify-center">
                        <SessionIcon className="w-6 h-6 text-white" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-white">
                            {safeString(session.location_tag, 'Unnamed Session')}
                          </h3>
                          <Badge className={getStatusColor(session.status)}>
                            {formatEnumTitle(session.status)}
                          </Badge>
                          {session.risk_score > 0 && (
                            <Badge className="bg-slate-800 text-white">
                              <span className={getRiskColor(session.risk_score)}>
                                Risk: {session.risk_score}
                              </span>
                            </Badge>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mt-3">
                          <div>
                            <p className="text-slate-500 mb-1">Session ID</p>
                            <p className="text-white font-mono">{safeString(session.session_id, 'N/A').substring(0, 12)}...</p>
                          </div>
                          <div>
                            <p className="text-slate-500 mb-1">Type</p>
                            <p className="text-white">{formatEnumTitle(session.session_type)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 mb-1">Started</p>
                            <p className="text-white flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {session.start_timestamp ? format(new Date(session.start_timestamp), 'MMM d, HH:mm') : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 mb-1">Observations</p>
                            <p className="text-white">{session.observation_count || 0}</p>
                          </div>
                        </div>

                        {session.gps_coordinates && (
                          <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                            <MapPin className="w-3 h-3" />
                            <span>
                              {session.gps_coordinates.latitude?.toFixed(4)}, {session.gps_coordinates.longitude?.toFixed(4)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 ml-4">
                      <Link to={`${createPageUrl("SessionDetail")}?id=${session.id}`}>
                        <Button size="sm" variant="outline" className="border-blue-500 text-blue-400 hover:bg-blue-500/10">
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </Button>
                      </Link>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteSessionMutation.mutate(session.id)}
                        disabled={deleteSessionMutation.isPending}
                        className="border-red-500 text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}