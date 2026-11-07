import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  User,
  Activity,
  Clock,
  Smartphone,
  AlertTriangle,
  Shield
} from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { UserBehaviorAnalyzer } from "../components/uba/UserBehaviorAnalyzer";

export default function UserBehaviorAnalytics() {
  const [analyzer] = useState(() => new UserBehaviorAnalyzer());
  const [analyzing, setAnalyzing] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['behavior-profiles'],
    queryFn: () => base44.entities.BehaviorProfile.list('-last_analysis', 20),
    initialData: []
  });

  const { data: deviceLogs = [] } = useQuery({
    queryKey: ['device-logs'],
    queryFn: () => base44.entities.DeviceLog.list('-timestamp', 100),
    initialData: []
  });

  const analyzeBehaviorMutation = useMutation({
    mutationFn: async () => {
      setAnalyzing(true);
      const profile = await analyzer.createProfile(user.email);
      setAnalyzing(false);
      return profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['behavior-profiles'] });
    }
  });

  const myProfile = profiles.find(p => p.user_id === user?.email);
  const highRiskProfiles = profiles.filter(p => p.current_risk_score > 65);
  const totalAnomalies = profiles.reduce((sum, p) => sum + (p.behavior_changes?.length || 0), 0);

  const riskDistribution = [
    { name: 'Low (0-30)', value: profiles.filter(p => p.current_risk_score < 30).length, color: '#10b981' },
    { name: 'Medium (30-65)', value: profiles.filter(p => p.current_risk_score >= 30 && p.current_risk_score < 65).length, color: '#f59e0b' },
    { name: 'High (65-80)', value: profiles.filter(p => p.current_risk_score >= 65 && p.current_risk_score < 80).length, color: '#f97316' },
    { name: 'Critical (80+)', value: profiles.filter(p => p.current_risk_score >= 80).length, color: '#ef4444' }
  ];

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });

  const activityTrend = last7Days.map(date => ({
    date: format(new Date(date), 'MMM dd'),
    logins: deviceLogs.filter(log => log.timestamp?.startsWith(date)).length,
    anomalies: deviceLogs.filter(log => log.timestamp?.startsWith(date) && log.anomaly_score > 70).length
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">User Behavior Analytics</h1>
          <p className="text-slate-400">Real-time behavioral profiling and anomaly detection</p>
        </div>
        <Button
          onClick={() => analyzeBehaviorMutation.mutate()}
          disabled={analyzing}
          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
        >
          <Activity className={`w-4 h-4 mr-2 ${analyzing ? 'animate-spin' : ''}`} />
          {analyzing ? 'Analyzing...' : 'Analyze My Behavior'}
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{profiles.length}</p>
                <p className="text-xs text-slate-400">Profiles</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{highRiskProfiles.length}</p>
                <p className="text-xs text-slate-400">High Risk</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{totalAnomalies}</p>
                <p className="text-xs text-slate-400">Anomalies</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{deviceLogs.length}</p>
                <p className="text-xs text-slate-400">Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* My Profile */}
      {myProfile && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <User className="w-5 h-5 text-blue-400" />
              My Behavior Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Risk Score */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-300">Risk Score</span>
                <Badge className={`${
                  myProfile.current_risk_score < 30 ? 'bg-green-500' :
                  myProfile.current_risk_score < 65 ? 'bg-yellow-500' :
                  myProfile.current_risk_score < 80 ? 'bg-orange-500' :
                  'bg-red-500'
                } text-white px-3 py-1`}>
                  {myProfile.current_risk_score}/100
                </Badge>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full ${
                    myProfile.current_risk_score < 30 ? 'bg-green-500' :
                    myProfile.current_risk_score < 65 ? 'bg-yellow-500' :
                    myProfile.current_risk_score < 80 ? 'bg-orange-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${myProfile.current_risk_score}%` }}
                />
              </div>
            </div>

            {/* Baseline Behavior */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Typical Login Times
                </h4>
                <div className="flex flex-wrap gap-2">
                  {myProfile.baseline_behavior?.typical_login_times?.map((time, idx) => (
                    <Badge key={idx} variant="outline" className="border-blue-500 text-blue-400">
                      {time}:00
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-slate-800/50 rounded-lg">
                <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  Devices
                </h4>
                <p className="text-2xl font-bold text-white">
                  {myProfile.baseline_behavior?.device_patterns?.fingerprints?.length || 0}
                </p>
                <p className="text-xs text-slate-400">Registered devices</p>
              </div>
            </div>

            {/* Recent Anomalies */}
            {myProfile.behavior_changes && myProfile.behavior_changes.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white mb-3">Recent Anomalies</h4>
                <div className="space-y-2">
                  {myProfile.behavior_changes.slice(0, 5).map((change, idx) => (
                    <div key={idx} className={`p-3 rounded-lg border ${
                      change.severity === 'critical' ? 'border-red-500/30 bg-red-500/5' :
                      change.severity === 'high' ? 'border-orange-500/30 bg-orange-500/5' :
                      'border-yellow-500/30 bg-yellow-500/5'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-white text-sm">{change.change_type.replace(/_/g, ' ')}</span>
                        <Badge className={`${
                          change.severity === 'critical' ? 'bg-red-500' :
                          change.severity === 'high' ? 'bg-orange-500' :
                          'bg-yellow-500'
                        } text-white text-xs`}>
                          {change.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400">{change.details}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {format(new Date(change.detected_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Activity Trend (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={activityTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#f1f5f9' }}
                />
                <Line type="monotone" dataKey="logins" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="anomalies" stroke="#ef4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Risk Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={riskDistribution}
                  cx="50%"
                  cy="50%"
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {riskDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* High Risk Profiles Alert */}
      {highRiskProfiles.length > 0 && (
        <Alert className="bg-red-900/20 border-red-500">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <AlertDescription className="text-white">
            <strong>{highRiskProfiles.length} users require immediate attention!</strong>
            <br />
            High-risk behavioral anomalies detected. Review profiles immediately.
          </AlertDescription>
        </Alert>
      )}

      {/* All Profiles */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">All User Profiles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profiles.map((profile) => (
            <div key={profile.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-blue-500/50 transition-all cursor-pointer">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold text-white">{profile.user_id}</span>
                </div>
                <Badge className={`${
                  profile.current_risk_score < 30 ? 'bg-green-500' :
                  profile.current_risk_score < 65 ? 'bg-yellow-500' :
                  profile.current_risk_score < 80 ? 'bg-orange-500' :
                  'bg-red-500'
                } text-white`}>
                  Risk: {profile.current_risk_score}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
                <span>Anomalies: {profile.behavior_changes?.length || 0}</span>
                <span>Devices: {profile.baseline_behavior?.device_patterns?.fingerprints?.length || 0}</span>
                <span>Last: {format(new Date(profile.last_analysis), 'MMM d')}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}