import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Target } from 'lucide-react';

export default function CampaignAnalysisChart({ campaigns }) {
  const chartData = useMemo(() => {
    return campaigns.map(campaign => ({
      name: campaign.campaign_name.substring(0, 20) + (campaign.campaign_name.length > 20 ? '...' : ''),
      iocs: campaign.associated_iocs?.length || 0,
      victims: campaign.victims_count || 0,
      detection: campaign.detection_coverage || 0
    }));
  }, [campaigns]);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <TrendingUp className="w-5 h-5 text-green-400" />
          Active Campaign Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <div className="text-center py-12">
            <Target className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">No active campaigns tracked</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis 
                  dataKey="name" 
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis 
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
                <Legend />
                <Bar dataKey="iocs" fill="#8b5cf6" name="IOCs" />
                <Bar dataKey="detection" fill="#10b981" name="Detection %" />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-6 space-y-3">
              {campaigns.slice(0, 5).map(campaign => (
                <div
                  key={campaign.id}
                  className="p-3 bg-slate-800/50 rounded-lg border border-slate-700"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="font-semibold text-white mb-2">{campaign.campaign_name}</h4>
                      
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge className={
                          campaign.campaign_status === 'active' ? 'bg-red-500/20 text-red-300' :
                          campaign.campaign_status === 'monitoring' ? 'bg-yellow-500/20 text-yellow-300' :
                          'bg-slate-500/20 text-slate-300'
                        }>
                          {campaign.campaign_status}
                        </Badge>
                        
                        {campaign.target_sectors?.map(sector => (
                          <Badge key={sector} className="bg-blue-500/20 text-blue-300">
                            {sector}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex gap-4 text-xs text-slate-400">
                        <span>IOCs: {campaign.associated_iocs?.length || 0}</span>
                        <span>Detection: {campaign.detection_coverage || 0}%</span>
                        <span>First: {new Date(campaign.first_observed).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}