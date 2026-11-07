import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Link2,
  Hash,
  Users,
  MapPin,
  Clock,
  MessageSquare,
  RefreshCw,
  Loader2,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';

export default function CorrelationPanel({ caseId }) {
  const queryClient = useQueryClient();

  const { data: correlations = [] } = useQuery({
    queryKey: ['device-correlations', caseId],
    queryFn: () => base44.entities.DeviceCorrelation.filter({ case_id: caseId }, '-confidence_score')
  });

  const correlateMutation = useMutation({
    mutationFn: () => base44.functions.invoke('correlateDevices', { case_id: caseId }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['device-correlations', caseId] });
      toast.success(`Found ${response.data.correlations_found} correlations`);
    },
    onError: () => {
      toast.error('Correlation failed');
    }
  });

  const getCorrelationIcon = (type) => {
    const icons = {
      file_hash_match: Hash,
      contact_match: Users,
      location_proximity: MapPin,
      temporal_correlation: Clock,
      communication_link: MessageSquare,
      account_link: Link2
    };
    return icons[type] || Link2;
  };

  const getConfidenceColor = (score) => {
    if (score >= 85) return 'text-green-400';
    if (score >= 70) return 'text-yellow-400';
    return 'text-orange-400';
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Link2 className="w-5 h-5 text-purple-400" />
            Cross-Device Correlations
          </CardTitle>
          <Button
            onClick={() => correlateMutation.mutate()}
            disabled={correlateMutation.isPending}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700"
          >
            {correlateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Run Correlation
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {correlations.length === 0 ? (
          <div className="text-center py-12">
            <Link2 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400 mb-4">No correlations found yet</p>
            <Button
              onClick={() => correlateMutation.mutate()}
              disabled={correlateMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {correlateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <TrendingUp className="w-4 h-4 mr-2" />
              )}
              Analyze Cross-Device Links
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {correlations.map(corr => {
              const Icon = getCorrelationIcon(corr.correlation_type);
              return (
                <Card key={corr.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-purple-400" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="bg-purple-500/20 text-purple-300 text-xs">
                            {corr.correlation_type.replace('_', ' ')}
                          </Badge>
                          <div className="flex items-center gap-1">
                            <span className={`text-sm font-semibold ${getConfidenceColor(corr.confidence_score)}`}>
                              {corr.confidence_score}%
                            </span>
                            <span className="text-xs text-slate-400">confidence</span>
                          </div>
                        </div>

                        <p className="text-white text-sm mb-2">{corr.description}</p>

                        {corr.match_details && (
                          <div className="text-xs text-slate-400 space-y-1">
                            {corr.match_details.hash && (
                              <p>Hash: {corr.match_details.hash.substring(0, 16)}...</p>
                            )}
                            {corr.match_details.phone_number && (
                              <p>Number: {corr.match_details.phone_number}</p>
                            )}
                            {corr.match_details.distance_meters && (
                              <p>Distance: {corr.match_details.distance_meters}m apart</p>
                            )}
                            {corr.match_details.time_difference_seconds && (
                              <p>Time: {Math.floor(corr.match_details.time_difference_seconds / 60)} minutes apart</p>
                            )}
                          </div>
                        )}

                        <div className="mt-2">
                          <Progress value={corr.confidence_score} className="h-1" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}