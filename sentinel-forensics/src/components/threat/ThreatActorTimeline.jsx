import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, Clock } from 'lucide-react';

export default function ThreatActorTimeline({ aptGroups }) {
  const sortedGroups = [...aptGroups].sort((a, b) => 
    new Date(b.last_updated || b.created_date) - new Date(a.last_updated || a.created_date)
  );

  const getThreatColor = (level) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-300 border-red-500/50',
      high: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
      medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
      low: 'bg-blue-500/20 text-blue-300 border-blue-500/50'
    };
    return colors[level] || colors.medium;
  };

  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-red-500/20 text-red-300',
      dormant: 'bg-yellow-500/20 text-yellow-300',
      retired: 'bg-slate-500/20 text-slate-300',
      evolving: 'bg-purple-500/20 text-purple-300'
    };
    return colors[status] || colors.active;
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Target className="w-5 h-5 text-red-400" />
          Threat Actor Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sortedGroups.length === 0 ? (
          <div className="text-center py-12">
            <Target className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">No APT groups tracked</p>
            <p className="text-xs text-slate-500 mt-2">Ingest threat feeds to populate</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedGroups.map((group, idx) => (
              <div
                key={group.id}
                className="relative pl-8 pb-4 border-l-2 border-slate-700 last:border-0"
              >
                <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-red-500 border-2 border-slate-900" />
                
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-white text-lg mb-2">
                        {group.group_name}
                      </h3>
                      
                      <div className="flex flex-wrap gap-2 mb-3">
                        <Badge variant="outline" className={getThreatColor(group.threat_level)}>
                          {group.threat_level?.toUpperCase()}
                        </Badge>
                        <Badge className={getStatusColor(group.activity_status)}>
                          {group.activity_status}
                        </Badge>
                        {group.origin_country && (
                          <Badge className="bg-blue-500/20 text-blue-300">
                            {group.origin_country}
                          </Badge>
                        )}
                        <Badge className="bg-purple-500/20 text-purple-300">
                          Confidence: {group.confidence_score}%
                        </Badge>
                      </div>

                      {group.aliases && group.aliases.length > 0 && (
                        <p className="text-xs text-slate-400 mb-2">
                          <strong>Aliases:</strong> {group.aliases.join(', ')}
                        </p>
                      )}

                      {group.target_sectors && group.target_sectors.length > 0 && (
                        <p className="text-xs text-slate-400 mb-2">
                          <strong>Targets:</strong> {group.target_sectors.join(', ')}
                        </p>
                      )}

                      {group.linked_iocs && (
                        <p className="text-xs text-slate-400">
                          <strong>Linked IOCs:</strong> {group.linked_iocs.length}
                        </p>
                      )}
                    </div>

                    {group.first_observed && (
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="w-3 h-3" />
                          <span>First seen: {new Date(group.first_observed).toLocaleDateString()}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {group.recent_campaigns && group.recent_campaigns.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-700">
                      <p className="text-xs text-slate-400 mb-2"><strong>Recent Campaigns:</strong></p>
                      <div className="space-y-1">
                        {group.recent_campaigns.slice(0, 3).map((campaign, cIdx) => (
                          <div key={cIdx} className="text-xs text-slate-300">
                            • {campaign.campaign_name} ({new Date(campaign.date_detected).toLocaleDateString()})
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}