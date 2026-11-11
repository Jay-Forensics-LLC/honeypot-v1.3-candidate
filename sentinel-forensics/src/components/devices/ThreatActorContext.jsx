import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Target,
  AlertTriangle,
  Shield,
  Zap,
  ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function ThreatActorContext({ device }) {
  const hasThreats = device?.security_profile?.has_known_malicious_connections;
  const threatActorNames = device?.security_profile?.associated_threat_actors || [];

  const { data: threatActors, isLoading } = useQuery({
    queryKey: ['threat-actors', threatActorNames],
    queryFn: async () => {
      if (threatActorNames.length === 0) return [];
      
      const actors = await Promise.all(
        threatActorNames.map(async (name) => {
          const results = await base44.entities.APTGroup.filter({ group_name: name });
          return results[0];
        })
      );
      
      return actors.filter(Boolean);
    },
    enabled: threatActorNames.length > 0,
    staleTime: 300000
  });

  if (!hasThreats && threatActorNames.length === 0) {
    return (
      <Card className="bg-green-900/10 border-green-500/30">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Shield className="w-5 h-5 text-green-400" />
            Threat Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Shield className="w-12 h-12 text-green-400" />
            <div>
              <p className="text-sm font-medium text-white">No Known Threats</p>
              <p className="text-xs text-slate-400">
                This device has no associations with known threat actors
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-red-900/20 border-red-500/30">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2 text-base">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          Threat Intelligence
          <Badge className="bg-red-500/20 text-red-400 ml-auto">
            {threatActorNames.length} Actor{threatActorNames.length > 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-orange-900/20 border-orange-500/30">
          <AlertTriangle className="h-4 w-4 text-orange-400" />
          <AlertDescription className="text-orange-200 text-sm">
            <strong>⚠️ Malicious Connections Detected</strong>
            <p className="text-xs mt-1">
              Last detected: {device?.security_profile?.last_malicious_connection_at 
                ? new Date(device.security_profile.last_malicious_connection_at).toLocaleString()
                : 'Unknown'}
            </p>
          </AlertDescription>
        </Alert>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 bg-slate-800" />
            <Skeleton className="h-24 bg-slate-800" />
          </div>
        ) : (
          <div className="space-y-3">
            {threatActors?.map((actor, idx) => (
              <div key={idx} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-white flex items-center gap-2">
                      <Target className="w-4 h-4 text-red-400" />
                      {actor.group_name}
                    </h4>
                    {actor.aliases && actor.aliases.length > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        Also known as: {actor.aliases.slice(0, 3).join(', ')}
                      </p>
                    )}
                  </div>
                  <Badge className={
                    actor.threat_level === 'critical' ? 'bg-red-500/20 text-red-400' :
                    actor.threat_level === 'high' ? 'bg-orange-500/20 text-orange-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }>
                    {actor.threat_level?.toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div>
                    <p className="text-slate-400 mb-1">Motivation</p>
                    <Badge variant="outline" className="text-[10px]">
                      {actor.motivation || 'Unknown'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-1">Origin</p>
                    <Badge variant="outline" className="text-[10px]">
                      {actor.origin_country || 'Unknown'}
                    </Badge>
                  </div>
                </div>

                {actor.target_sectors && actor.target_sectors.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-slate-400 mb-1">Target Sectors:</p>
                    <div className="flex flex-wrap gap-1">
                      {actor.target_sectors.slice(0, 4).map((sector, i) => (
                        <Badge key={i} className="bg-purple-500/20 text-purple-400 text-[10px]">
                          {sector}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {actor.ttps && Object.keys(actor.ttps).length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 mb-2">Known TTPs:</p>
                    <div className="space-y-1">
                      {Object.entries(actor.ttps).slice(0, 3).map(([tactic, techniques]) => (
                        techniques && techniques.length > 0 && (
                          <div key={tactic} className="text-xs">
                            <span className="text-blue-400">{tactic}:</span>
                            <span className="text-slate-300 ml-2">
                              {techniques.slice(0, 2).join(', ')}
                              {techniques.length > 2 && ` +${techniques.length - 2}`}
                            </span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}

                <Link
                  to={createPageUrl('ThreatActorProfiling')}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-3"
                >
                  View full profile
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            ))}
          </div>
        )}

        <div className="pt-3 border-t border-slate-700">
          <Link
            to={createPageUrl('IncidentResponse')}
            className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            Create Incident for Investigation
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}