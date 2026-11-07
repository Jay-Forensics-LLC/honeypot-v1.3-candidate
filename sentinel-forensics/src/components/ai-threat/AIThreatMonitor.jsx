import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  Shield,
  ShieldAlert,
  ShieldX,
  ShieldCheck,
  Bot,
  Zap,
  Eye,
  RefreshCw,
  ChevronRight,
  Activity
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/components/utils';
import { format } from 'date-fns';

const SEVERITY_CONFIG = {
  critical: { color: 'bg-red-600 text-white', icon: ShieldX, label: 'Critical' },
  high: { color: 'bg-orange-500 text-white', icon: ShieldAlert, label: 'High' },
  medium: { color: 'bg-yellow-500 text-black', icon: AlertTriangle, label: 'Medium' },
  low: { color: 'bg-blue-500 text-white', icon: Shield, label: 'Low' },
  info: { color: 'bg-slate-500 text-white', icon: Eye, label: 'Info' }
};

const THREAT_TYPE_LABELS = {
  prompt_injection: 'Prompt Injection',
  jailbreak_attempt: 'Jailbreak Attempt',
  data_exfiltration: 'Data Exfiltration',
  malicious_output: 'Malicious Output',
  rogue_ai_behavior: 'Rogue AI Behavior',
  adversarial_input: 'Adversarial Input',
  model_manipulation: 'Model Manipulation',
  unauthorized_generation: 'Unauthorized Generation',
  hallucination_attack: 'Hallucination Attack',
  context_poisoning: 'Context Poisoning',
  supply_chain_injection: 'Supply Chain Injection',
  output_weaponization: 'Output Weaponization'
};

export default function AIThreatMonitor({ compact = false, maxEvents = 5 }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['ai-threat-stats'],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('aiThreatDetector', { action: 'stats' });
      return data.stats;
    },
    refetchInterval: 30000
  });

  const { data: recentEvents, isLoading: eventsLoading, refetch: refetchEvents } = useQuery({
    queryKey: ['ai-threat-recent', maxEvents],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('aiThreatDetector', {
        action: 'list',
        limit: maxEvents
      });
      return data.events;
    },
    refetchInterval: 30000
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchStats(), refetchEvents()]);
    setIsRefreshing(false);
  };

  const stats = statsData || { total: 0, by_severity: {}, blocked_count: 0, last_24h: 0 };
  const events = recentEvents || [];

  if (compact) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-red-400" />
              <CardTitle className="text-sm font-medium text-white">AI Threat Monitor</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-3 h-3 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {statsLoading ? (
            <Skeleton className="h-16 w-full bg-slate-800" />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Last 24h</span>
                <span className={`font-medium ${stats.last_24h > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {stats.last_24h} threats
                </span>
              </div>
              <div className="flex gap-1">
                {stats.by_severity?.critical > 0 && (
                  <Badge className="bg-red-600 text-xs">{stats.by_severity.critical} Critical</Badge>
                )}
                {stats.by_severity?.high > 0 && (
                  <Badge className="bg-orange-500 text-xs">{stats.by_severity.high} High</Badge>
                )}
              </div>
              <Link to={createPageUrl('AIThreatDashboard')}>
                <Button variant="ghost" size="sm" className="w-full text-xs text-slate-400 hover:text-white">
                  View Dashboard <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <Bot className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-white">AI Threat Monitor</CardTitle>
              <p className="text-sm text-slate-400">Real-time AI threat detection</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Stats Grid */}
        {statsLoading ? (
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-20 bg-slate-800" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400">Total Events</span>
              </div>
              <span className="text-2xl font-bold text-white">{stats.total}</span>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-red-900/50">
              <div className="flex items-center gap-2 mb-1">
                <ShieldX className="w-4 h-4 text-red-400" />
                <span className="text-xs text-slate-400">Critical</span>
              </div>
              <span className="text-2xl font-bold text-red-400">{stats.by_severity?.critical || 0}</span>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-orange-900/50">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-orange-400" />
                <span className="text-xs text-slate-400">Blocked</span>
              </div>
              <span className="text-2xl font-bold text-orange-400">{stats.blocked_count || 0}</span>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-green-900/50">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-green-400" />
                <span className="text-xs text-slate-400">Last 24h</span>
              </div>
              <span className={`text-2xl font-bold ${stats.last_24h > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                {stats.last_24h}
              </span>
            </div>
          </div>
        )}

        {/* Recent Events */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-300">Recent Threats</h4>
            <Link to={createPageUrl('AIThreatDashboard')}>
              <Button variant="ghost" size="sm" className="text-xs text-slate-400 hover:text-white">
                View All <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
          
          {eventsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-12 bg-slate-800" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <ShieldCheck className="w-5 h-5 mr-2" />
              No threats detected
            </div>
          ) : (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {events.map(event => {
                  const config = SEVERITY_CONFIG[event.severity] || SEVERITY_CONFIG.info;
                  const Icon = config.icon;
                  
                  return (
                    <div
                      key={event.id}
                      className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded ${config.color.split(' ')[0]}/20`}>
                          <Icon className={`w-4 h-4 ${config.color.includes('red') ? 'text-red-400' : config.color.includes('orange') ? 'text-orange-400' : config.color.includes('yellow') ? 'text-yellow-400' : 'text-slate-400'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">
                            {THREAT_TYPE_LABELS[event.event_type] || event.event_type}
                          </p>
                          <p className="text-xs text-slate-400">
                            {format(new Date(event.created_date), 'MMM d, HH:mm')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={config.color}>{config.label}</Badge>
                        {event.blocked && (
                          <Badge variant="outline" className="border-red-500 text-red-400">Blocked</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  );
}