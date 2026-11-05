import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, Database, Play, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ContractTests, sampleTestData } from '../components/enrichment/ContractTests';

export default function SystemHealthDashboard() {
  const [testResults, setTestResults] = React.useState([]);

  const { data: recentRuns = [] } = useQuery({
    queryKey: ['recent-enrichment-runs'],
    queryFn: async () => {
      const user = await base44.auth.me();
      const runs = await base44.entities.EnrichmentRun.filter({
        organization_id: user.organization_id
      });
      return runs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 10);
    }
  });

  const { data: recentJobs = [] } = useQuery({
    queryKey: ['recent-batch-jobs'],
    queryFn: async () => {
      const user = await base44.auth.me();
      const jobs = await base44.entities.BatchEnrichmentJob.filter({
        organization_id: user.organization_id
      });
      return jobs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 10);
    }
  });

  const runContractTests = () => {
    const results = ContractTests.runAll(sampleTestData);
    setTestResults(results);
  };

  const getStatusColor = (status) => {
    const colors = {
      queued: 'bg-slate-500/20 text-slate-400',
      running: 'bg-blue-500/20 text-blue-400',
      success: 'bg-green-500/20 text-green-400',
      failed: 'bg-red-500/20 text-red-400'
    };
    return colors[status] || colors.queued;
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">System Health Dashboard</h1>
          <p className="text-slate-400">Integration verification and system status</p>
        </div>

        {/* Contract Tests */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#EF4444]" />
                Contract Tests
              </CardTitle>
              <Button onClick={runContractTests} className="bg-[#EF4444] hover:bg-[#DC2626]">
                <Play className="w-4 h-4 mr-2" />
                Run Tests
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {testResults.length === 0 ? (
              <p className="text-center text-slate-400 py-6">No tests run yet</p>
            ) : (
              <div className="space-y-2">
                {testResults.map((result, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {result.status === 'PASS' ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                      )}
                      <span className="text-white">{result.test}</span>
                    </div>
                    <Badge className={result.status === 'PASS' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                      {result.status}
                    </Badge>
                    {result.error && (
                      <p className="text-xs text-red-400 mt-1">{result.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Enrichment Runs */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-[#EF4444]" />
              Recent Enrichment Runs (Last 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentRuns.length === 0 ? (
                <p className="text-center text-slate-400 py-6">No enrichment runs yet</p>
              ) : (
                recentRuns.map((run) => (
                  <div key={run.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={getStatusColor(run.status)}>
                          {run.status}
                        </Badge>
                        <Badge className="bg-blue-500/20 text-blue-400">
                          {run.run_type}
                        </Badge>
                        <Badge className="bg-purple-500/20 text-purple-400">
                          {run.provider}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {format(new Date(run.created_date), 'MMM d, yyyy HH:mm:ss')}
                      </p>
                    </div>
                    {run.court_admissible_mode && (
                      <Badge className="bg-[#EF4444]/20 text-[#EF4444]">Court Mode</Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Batch Jobs */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-[#EF4444]" />
              Recent Batch Jobs (Last 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentJobs.length === 0 ? (
                <p className="text-center text-slate-400 py-6">No batch jobs yet</p>
              ) : (
                recentJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={getStatusColor(job.status)}>
                          {job.status}
                        </Badge>
                        <Badge className="bg-blue-500/20 text-blue-400">
                          {job.job_type}
                        </Badge>
                        {job.counts && (
                          <span className="text-xs text-slate-400">
                            {job.counts.success}/{job.counts.total} succeeded
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {format(new Date(job.created_date), 'MMM d, yyyy HH:mm:ss')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}