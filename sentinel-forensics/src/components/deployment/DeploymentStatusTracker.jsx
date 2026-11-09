import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  Monitor
} from 'lucide-react';
import { toast } from 'sonner';
import { updateDeploymentStatus } from '../../functions/updateDeploymentStatus';

export default function DeploymentStatusTracker({ jobId, autoRefresh = true }) {
  const queryClient = useQueryClient();

  const { data: job, isLoading } = useQuery({
    queryKey: ['deployment-job', jobId],
    queryFn: async () => {
      const jobs = await base44.entities.DeploymentJob.filter({ job_id: jobId });
      return jobs[0];
    },
    enabled: !!jobId,
    refetchInterval: autoRefresh && job?.status !== 'completed' && job?.status !== 'failed' ? 10000 : false
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await updateDeploymentStatus({ job_id: jobId });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment-job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['deployment-jobs'] });
    },
    onError: (error) => {
      toast.error('Status update failed: ' + error.message);
    }
  });

  // Auto-refresh when job is active
  useEffect(() => {
    if (autoRefresh && job?.status === 'deploying') {
      const interval = setInterval(() => {
        updateMutation.mutate();
      }, 15000);

      return () => clearInterval(interval);
    }
  }, [job?.status, autoRefresh]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!job) {
    return null;
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">{job.deployment_name}</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={
                job.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                job.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                job.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-blue-500/20 text-blue-400'
              }>
                {job.status}
              </Badge>
              <Badge className="bg-purple-500/20 text-purple-400">
                {job.deployment_method}
              </Badge>
              <Badge className="bg-slate-500/20 text-slate-400">
                {job.total_targets} targets
              </Badge>
            </div>
          </div>

          {(job.status === 'deploying' || job.status === 'preparing') && (
            <Button
              size="sm"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm text-slate-300">
            <span>Deployment Progress</span>
            <span>{job.progress?.percentage || 0}%</span>
          </div>
          <Progress value={job.progress?.percentage || 0} className="h-3" />
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-green-900/20 rounded p-3 text-center">
            <CheckCircle className="w-5 h-5 mx-auto mb-1 text-green-400" />
            <p className="text-xl font-bold text-green-400">{job.progress?.succeeded || 0}</p>
            <p className="text-xs text-green-300/60">Succeeded</p>
          </div>
          <div className="bg-red-900/20 rounded p-3 text-center">
            <XCircle className="w-5 h-5 mx-auto mb-1 text-red-400" />
            <p className="text-xl font-bold text-red-400">{job.progress?.failed || 0}</p>
            <p className="text-xs text-red-300/60">Failed</p>
          </div>
          <div className="bg-blue-900/20 rounded p-3 text-center">
            <Loader2 className="w-5 h-5 mx-auto mb-1 text-blue-400" />
            <p className="text-xl font-bold text-blue-400">{job.progress?.in_progress || 0}</p>
            <p className="text-xs text-blue-300/60">In Progress</p>
          </div>
          <div className="bg-slate-800/50 rounded p-3 text-center">
            <Clock className="w-5 h-5 mx-auto mb-1 text-slate-400" />
            <p className="text-xl font-bold text-slate-400">{job.progress?.pending || 0}</p>
            <p className="text-xs text-slate-500">Pending</p>
          </div>
        </div>

        {/* Endpoint List */}
        {job.endpoint_statuses && job.endpoint_statuses.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-white mb-3">Endpoint Status:</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {job.endpoint_statuses.map((endpoint, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-800/50 rounded p-3">
                  <div className="flex items-center gap-3">
                    <Monitor className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-medium text-white">{endpoint.hostname}</p>
                      {endpoint.agent_id && (
                        <p className="text-xs text-slate-500">
                          Agent: {endpoint.agent_id} • v{endpoint.installed_version}
                        </p>
                      )}
                      {endpoint.error_message && (
                        <p className="text-xs text-red-400">{endpoint.error_message}</p>
                      )}
                    </div>
                  </div>
                  <Badge className={
                    endpoint.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    endpoint.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    endpoint.status === 'pending' ? 'bg-slate-500/20 text-slate-400' :
                    'bg-blue-500/20 text-blue-400'
                  }>
                    {endpoint.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}