import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Play, 
  Pause, 
  RotateCcw,
  CheckCircle,
  XCircle,
  Activity,
  Database
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";

export default function EventReplaySandbox() {
  const [selectedSession, setSelectedSession] = useState(null);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [isReplaying, setIsReplaying] = useState(false);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [replayResults, setReplayResults] = useState([]);

  const { data: sessions = [] } = useQuery({
    queryKey: ['scan-sessions-replay'],
    queryFn: () => base44.entities.ScanSession.list('-start_timestamp', 50),
    initialData: []
  });

  const { data: observations = [] } = useQuery({
    queryKey: ['observations-replay', selectedSession],
    queryFn: () => selectedSession 
      ? base44.entities.Observation.filter({ session_id: selectedSession }, '-timestamp')
      : Promise.resolve([]),
    enabled: !!selectedSession,
    initialData: []
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['detection-rules-replay'],
    queryFn: () => base44.entities.DetectionRule.list(),
    initialData: []
  });

  const startReplay = async () => {
    if (!selectedSession || observations.length === 0) {
      toast.error('Select a session with observations to replay');
      return;
    }

    setIsReplaying(true);
    setCurrentEventIndex(0);
    setReplayResults([]);

    const enabledRules = rules.filter(r => r.enabled);
    const delay = 1000 / replaySpeed;

    for (let i = 0; i < observations.length; i++) {
      if (!isReplaying) break;

      setCurrentEventIndex(i);
      const obs = observations[i];

      // Test against all enabled rules
      const matches = [];
      
      for (const rule of enabledRules) {
        const isMatch = await testRuleAgainstObservation(rule, obs);
        
        if (isMatch) {
          matches.push({
            rule_id: rule.rule_id,
            rule_name: rule.rule_name,
            severity: rule.severity
          });
        }
      }

      setReplayResults(prev => [...prev, {
        observation_id: obs.observation_id,
        timestamp: obs.timestamp,
        matched_rules: matches,
        anomaly_detected: matches.length > 0 || obs.anomaly_score > 50
      }]);

      await new Promise(resolve => setTimeout(resolve, delay));
    }

    setIsReplaying(false);
    toast.success(`Replay complete! Tested ${observations.length} events against ${enabledRules.length} rules`);
  };

  const pauseReplay = () => {
    setIsReplaying(false);
  };

  const resetReplay = () => {
    setIsReplaying(false);
    setCurrentEventIndex(0);
    setReplayResults([]);
  };

  const testRuleAgainstObservation = async (rule, observation) => {
    // Simplified rule matching logic
    try {
      if (rule.rule_type === 'heuristic') {
        // Check anomaly score
        return observation.anomaly_score > 60;
      }

      if (rule.rule_type === 'custom' && rule.rule_logic) {
        // Check if observation matches custom logic conditions
        const logic = rule.rule_logic;
        
        if (logic.observation_type && observation.observation_type !== logic.observation_type) {
          return false;
        }

        if (logic.min_anomaly_score && observation.anomaly_score < logic.min_anomaly_score) {
          return false;
        }

        if (logic.watchlist_match_required && !observation.watchlist_match) {
          return false;
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('Rule test error:', error);
      return false;
    }
  };

  const calculateStats = () => {
    const totalEvents = observations.length;
    const testedEvents = replayResults.length;
    const anomaliesDetected = replayResults.filter(r => r.anomaly_detected).length;
    const totalMatches = replayResults.reduce((sum, r) => sum + r.matched_rules.length, 0);

    return {
      totalEvents,
      testedEvents,
      anomaliesDetected,
      totalMatches,
      progress: totalEvents > 0 ? (testedEvents / totalEvents) * 100 : 0
    };
  };

  const stats = calculateStats();

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-6 h-6 text-purple-400" />
              Event Replay Sandbox
            </div>
            <Badge className="bg-purple-500">Test New Rules</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Select Session</label>
              <Select value={selectedSession} onValueChange={setSelectedSession}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue placeholder="Choose a session..." />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map(session => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.location_tag || session.session_id} ({session.observation_count || 0} events)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-2 block">Replay Speed</label>
              <Select value={String(replaySpeed)} onValueChange={(v) => setReplaySpeed(Number(v))}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">0.5x (Slow)</SelectItem>
                  <SelectItem value="1">1x (Normal)</SelectItem>
                  <SelectItem value="2">2x (Fast)</SelectItem>
                  <SelectItem value="5">5x (Very Fast)</SelectItem>
                  <SelectItem value="10">10x (Maximum)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              {!isReplaying ? (
                <Button
                  onClick={startReplay}
                  disabled={!selectedSession || observations.length === 0}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Replay
                </Button>
              ) : (
                <Button
                  onClick={pauseReplay}
                  className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                >
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </Button>
              )}
              <Button
                onClick={resetReplay}
                variant="outline"
                className="border-red-500 text-red-400"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Progress Bar */}
          {selectedSession && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">
                  Replay Progress: {stats.testedEvents} / {stats.totalEvents} events
                </span>
                <span className="text-purple-400 font-semibold">
                  {Math.round(stats.progress)}%
                </span>
              </div>
              <Progress value={stats.progress} className="h-3" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics */}
      {selectedSession && (
        <div className="grid md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <Database className="w-8 h-8 text-blue-400 mb-2" />
              <p className="text-3xl font-bold text-white">{stats.totalEvents}</p>
              <p className="text-xs text-slate-400">Total Events</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <Activity className="w-8 h-8 text-purple-400 mb-2" />
              <p className="text-3xl font-bold text-white">{stats.testedEvents}</p>
              <p className="text-xs text-slate-400">Tested Events</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <CheckCircle className="w-8 h-8 text-green-400 mb-2" />
              <p className="text-3xl font-bold text-white">{stats.totalMatches}</p>
              <p className="text-xs text-slate-400">Rule Matches</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <XCircle className="w-8 h-8 text-red-400 mb-2" />
              <p className="text-3xl font-bold text-white">{stats.anomaliesDetected}</p>
              <p className="text-xs text-slate-400">Anomalies Detected</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Replay Results */}
      {replayResults.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle>Replay Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {replayResults.slice(-20).reverse().map((result, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded border ${
                    result.anomaly_detected
                      ? 'bg-red-500/10 border-red-500'
                      : 'bg-slate-800/50 border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {result.anomaly_detected ? (
                        <XCircle className="w-5 h-5 text-red-400" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      )}
                      <span className="text-sm text-white font-mono">
                        {result.observation_id}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {format(new Date(result.timestamp), 'HH:mm:ss')}
                    </span>
                  </div>

                  {result.matched_rules.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {result.matched_rules.map((match, i) => (
                        <Badge
                          key={i}
                          className={
                            match.severity === 'critical' ? 'bg-red-500' :
                            match.severity === 'high' ? 'bg-orange-500' :
                            match.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                          }
                        >
                          {match.rule_name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500">
        <div className="flex items-start gap-3 text-sm text-purple-400">
          <Play className="w-5 h-5 mt-0.5" />
          <div>
            <strong>Event Replay Sandbox:</strong> Test new detection rules against historical data without affecting live systems. 
            Replay past sessions at variable speeds to validate rule effectiveness before deployment.
          </div>
        </div>
      </div>
    </div>
  );
}