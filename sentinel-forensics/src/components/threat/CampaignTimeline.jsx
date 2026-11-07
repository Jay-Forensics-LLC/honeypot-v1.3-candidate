import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Target, AlertTriangle } from 'lucide-react';

/**
 * CAMPAIGN TIMELINE OVERLAY
 * 
 * Shows threat actor campaign activity overlaid with case events.
 * Helps identify temporal correlations.
 */
export default function CampaignTimeline({ campaigns, caseEvents, caseStartDate }) {
  // Merge campaign periods with case events
  const timeline = [];
  
  // Add campaign periods
  campaigns?.forEach(campaign => {
    timeline.push({
      type: 'campaign',
      name: campaign.name,
      start: new Date(campaign.start_date),
      end: campaign.end_date ? new Date(campaign.end_date) : new Date(),
      targets: campaign.targets || [],
      color: 'bg-red-500'
    });
  });
  
  // Add case events
  caseEvents?.forEach(event => {
    timeline.push({
      type: 'event',
      name: event.title || event.event_type,
      start: new Date(event.timestamp || event.created_date),
      severity: event.severity,
      color: 'bg-blue-500'
    });
  });
  
  // Sort chronologically
  timeline.sort((a, b) => a.start - b.start);
  
  // Find overlaps
  const overlaps = [];
  campaigns?.forEach(campaign => {
    const campaignStart = new Date(campaign.start_date);
    const campaignEnd = campaign.end_date ? new Date(campaign.end_date) : new Date();
    
    const overlappingEvents = caseEvents?.filter(event => {
      const eventTime = new Date(event.timestamp || event.created_date);
      return eventTime >= campaignStart && eventTime <= campaignEnd;
    });
    
    if (overlappingEvents && overlappingEvents.length > 0) {
      overlaps.push({
        campaign: campaign.name,
        events: overlappingEvents.length
      });
    }
  });

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Calendar className="w-5 h-5 text-red-400" />
          Campaign Timeline Overlay
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {overlaps.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-semibold">Temporal Correlation Detected</p>
                <p className="text-sm text-red-300 mt-1">
                  {overlaps.map(o => `${o.campaign}: ${o.events} events`).join(', ')}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {timeline.map((item, idx) => (
            <div key={idx} className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
              <div className={`w-2 h-2 rounded-full ${item.color} mt-2`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-white font-semibold">{item.name}</p>
                  <Badge className={item.type === 'campaign' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}>
                    {item.type}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400">
                  {item.start.toLocaleDateString()}
                  {item.end && ` - ${item.end.toLocaleDateString()}`}
                </p>
                {item.targets && item.targets.length > 0 && (
                  <div className="flex items-center gap-1 mt-2">
                    <Target className="w-3 h-3 text-slate-500" />
                    <span className="text-xs text-slate-500">{item.targets.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {timeline.length === 0 && (
          <div className="text-center py-8">
            <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No timeline data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}