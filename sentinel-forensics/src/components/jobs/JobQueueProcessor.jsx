import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Loader2,
  CheckCircle,
  Clock,
  Zap,
  Play,
  Pause
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

/**
 * Job Queue Processor
 * Manages background jobs for API calls, enrichments, and long-running tasks
 */
export default function JobQueueProcessor({ autoProcess = false }) {
  const [processing, setProcessing] = useState(autoProcess);
  const [currentJob, setCurrentJob] = useState(null);
  const queryClient = useQueryClient();

  // Fetch pending jobs
  const { data: jobs = [], refetch } = useQuery({
    queryKey: ['job-queue'],
    queryFn: async () => {
      const allJobs = await base44.entities.JobQueue.list('-priority');
      return allJobs.filter(j => 
        j.status === 'queued' || j.status === 'processing'
      );
    },
    refetchInterval: processing ? 5000 : 30000,
  });

  // Process single job
  const processJobMutation = useMutation({
    mutationFn: async (job) => {
      setCurrentJob(job);
      
      // Update status to processing
      await base44.entities.JobQueue.update(job.id, {
        status: 'processing',
        started_at: new Date().toISOString()
      });

      const startTime = Date.now();

      try {
        let result;
        let estimatedCost = 0;

        // Route to appropriate processor based on job_type
        switch (job.job_type) {
          case 'virustotal_scan':
            result = await base44.functions.invoke('virusTotal', {
              hash: job.payload.hash,
              type: job.payload.type || 'file'
            });
            estimatedCost = 0; // Free tier
            break;

          case 'shodan_lookup':
            result = await base44.functions.invoke('proxyShodan', {
              ip: job.payload.ip
            });
            estimatedCost = 0.01; // $0.01 per query
            break;

          case 'censys_enumeration':
            result = await base44.functions.invoke('proxyCensys', {
              query: job.payload.query
            });
            estimatedCost = 0; // Free tier
            break;

          case 'hibp_check':
            result = await base44.functions.invoke('proxyHIBP', {
              email: job.payload.email
            });
            estimatedCost = 0; // Free
            break;

          case 'llm_analysis':
            // Use Anthropic for complex analysis, OpenAI for simple
            const isComplex = job.payload.prompt?.length > 500 || job.payload.add_context_from_internet;
            
            result = await base44.integrations.Core.InvokeLLM({
              prompt: job.payload.prompt,
              add_context_from_internet: job.payload.add_context_from_internet || false,
              response_json_schema: job.payload.response_json_schema
            });
            
            // Estimate cost based on tokens
            const tokens = result.usage?.total_tokens || 1000;
            estimatedCost = isComplex 
              ? tokens * 0.000008 // Anthropic
              : tokens * 0.000002; // OpenAI
            break;

          case 'threat_enrichment':
            result = await base44.functions.invoke('enrichBatch', {
              indicator_ids: job.payload.indicator_ids,
              providers: job.payload.providers || ['virustotal', 'abuseipdb', 'shodan']
            });
            estimatedCost = 0.05; // Multiple API calls
            break;

          case 'forensic_summary':
            result = await base44.functions.invoke('generateForensicSummary', {
              case_id: job.payload.case_id
            });
            estimatedCost = 0.10; // LLM cost
            break;

          default:
            throw new Error(`Unknown job type: ${job.job_type}`);
        }

        // Update job with success
        await base44.entities.JobQueue.update(job.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          execution_time_ms: Date.now() - startTime,
          result: result.data || result,
          estimated_cost: estimatedCost,
          retry_count: job.retry_count || 0
        });

        return { success: true, result: result.data || result };

      } catch (error) {
        console.error(`Job ${job.job_id} failed:`, error);

        const retryCount = (job.retry_count || 0) + 1;
        const maxRetries = job.max_retries || 3;

        if (retryCount < maxRetries) {
          // Retry with exponential backoff
          const backoffSeconds = Math.pow(2, retryCount) * 10;
          const scheduledAt = new Date(Date.now() + backoffSeconds * 1000);

          await base44.entities.JobQueue.update(job.id, {
            status: 'queued',
            retry_count: retryCount,
            scheduled_at: scheduledAt.toISOString(),
            error: error.message
          });

          toast.warning(`Job failed, retrying in ${backoffSeconds}s (${retryCount}/${maxRetries})`);
        } else {
          // Move to dead letter
          await base44.entities.JobQueue.update(job.id, {
            status: 'dead_letter',
            completed_at: new Date().toISOString(),
            execution_time_ms: Date.now() - startTime,
            error: error.message,
            retry_count: retryCount
          });

          toast.error('Job failed permanently', {
            description: `${job.job_type} exceeded max retries`
          });
        }

        throw error;
      } finally {
        setCurrentJob(null);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-queue'] });
    }
  });

  // Auto-process jobs
  useEffect(() => {
    let interval;
    
    if (processing && jobs.length > 0 && !currentJob) {
      interval = setInterval(async () => {
        // Get highest priority queued job that's ready
        const readyJobs = jobs.filter(j => {
          if (j.status !== 'queued') return false;
          if (!j.scheduled_at) return true;
          return new Date(j.scheduled_at) <= new Date();
        });

        if (readyJobs.length > 0) {
          const nextJob = readyJobs.reduce((highest, job) => 
            (job.priority || 5) > (highest.priority || 5) ? job : highest
          );

          await processJobMutation.mutateAsync(nextJob);
        }
      }, 2000);
    }

    return () => clearInterval(interval);
  }, [processing, jobs, currentJob]);

  const pendingJobs = jobs.filter(j => j.status === 'queued');
  const processingJobs = jobs.filter(j => j.status === 'processing');

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Job Queue Processor
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={processing ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-300'}>
              {processing ? 'Active' : 'Paused'}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setProcessing(!processing)}
              className="border-slate-700"
            >
              {processing ? (
                <>
                  <Pause className="w-4 h-4 mr-1" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1" />
                  Start
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Queue Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-slate-800/50 rounded-lg text-center">
            <Clock className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white">{pendingJobs.length}</p>
            <p className="text-xs text-slate-400">Queued</p>
          </div>
          <div className="p-3 bg-slate-800/50 rounded-lg text-center">
            <Loader2 className="w-5 h-5 text-blue-400 mx-auto mb-1 animate-spin" />
            <p className="text-2xl font-bold text-white">{processingJobs.length}</p>
            <p className="text-xs text-slate-400">Processing</p>
          </div>
          <div className="p-3 bg-slate-800/50 rounded-lg text-center">
            <CheckCircle className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white">
              {jobs.filter(j => j.status === 'completed').length}
            </p>
            <p className="text-xs text-slate-400">Completed</p>
          </div>
        </div>

        {/* Current Job */}
        {currentJob && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              <div className="flex-1">
                <p className="font-semibold text-white">{currentJob.job_type}</p>
                <p className="text-xs text-slate-400">
                  Priority: {currentJob.priority || 5} | Provider: {currentJob.provider}
                </p>
              </div>
              <Badge className="bg-blue-500/20 text-blue-400">
                Processing...
              </Badge>
            </div>
            <Progress value={50} className="h-1" />
          </div>
        )}

        {/* Pending Jobs */}
        {pendingJobs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-white">Pending Jobs</h4>
            {pendingJobs.slice(0, 5).map(job => (
              <div key={job.id} className="p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-white">{job.job_type}</p>
                    <p className="text-xs text-slate-400">
                      {job.scheduled_at ? `Scheduled for ${formatDistanceToNow(new Date(job.scheduled_at), { addSuffix: true })}` : 'Ready to process'}
                    </p>
                  </div>
                  <Badge className="bg-yellow-500/20 text-yellow-400">
                    P{job.priority || 5}
                  </Badge>
                </div>
              </div>
            ))}
            {pendingJobs.length > 5 && (
              <p className="text-xs text-slate-500 text-center">
                + {pendingJobs.length - 5} more jobs
              </p>
            )}
          </div>
        )}

        {jobs.length === 0 && (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3 opacity-50" />
            <p className="text-slate-400">No jobs in queue</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}