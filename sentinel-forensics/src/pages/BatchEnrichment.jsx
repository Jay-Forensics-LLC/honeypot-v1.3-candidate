import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function BatchEnrichment() {
  const { id: caseId } = useParams();
  const queryClient = useQueryClient();
  const [jobType, setJobType] = useState('ip_batch');
  const [strictness, setStrictness] = useState(1);
  const [courtMode, setCourtMode] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  const { data: jobs = [] } = useQuery({
    queryKey: ['batch-jobs', caseId],
    queryFn: async () => {
      return await base44.entities.BatchEnrichmentJob.filter({ case_id: caseId });
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      return file_url;
    },
    onSuccess: (fileUrl) => {
      setUploadedFile(fileUrl);
      toast.success('File uploaded');
    },
    onError: (error) => {
      toast.error('Upload failed', { description: error.message });
    }
  });

  const submitJobMutation = useMutation({
    mutationFn: async () => {
      if (!uploadedFile) throw new Error('No file uploaded');
      
      const user = await base44.auth.me();
      const job = await base44.entities.BatchEnrichmentJob.create({
        organization_id: user.organization_id,
        case_id: caseId,
        schema_version: '1.0.0',
        job_type: jobType,
        input_file_ref: uploadedFile,
        requested_by_user_id: user.id,
        counts: { total: 0, success: 0, failed: 0 }
      });

      // Trigger background processing
      await base44.functions.invoke('runBatchEnrichment', {
        jobId: job.id,
        strictness,
        courtAdmissibleMode: courtMode
      });

      return job;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-jobs', caseId] });
      setUploadedFile(null);
      toast.success('Batch job started');
    },
    onError: (error) => {
      toast.error('Job submission failed', { description: error.message });
    }
  });

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Only CSV files supported');
      return;
    }

    uploadMutation.mutate(file);
  };

  const downloadResults = async (job) => {
    if (!job.output_file_ref) {
      toast.error('No results available');
      return;
    }

    try {
      const response = await fetch(job.output_file_ref);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enrichment_results_${job.id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Results downloaded');
    } catch (error) {
      toast.error('Download failed', { description: error.message });
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      queued: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      success: 'bg-green-500/20 text-green-400 border-green-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30'
    };
    return colors[status] || colors.queued;
  };

  const sortedJobs = [...jobs].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Batch Enrichment</h1>
          <p className="text-slate-400">Upload CSV files for bulk indicator enrichment</p>
        </div>

        {/* Upload Form */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">New Batch Job</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Job Type</label>
                <Select value={jobType} onValueChange={setJobType}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="ip_batch">IP Batch</SelectItem>
                    <SelectItem value="email_batch">Email Batch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Strictness</label>
                <Select value={String(strictness)} onValueChange={(v) => setStrictness(Number(v))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="0">Relaxed (0)</SelectItem>
                    <SelectItem value="1">Normal (1)</SelectItem>
                    <SelectItem value="2">Strict (2)</SelectItem>
                    <SelectItem value="3">Paranoid (3)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  variant={courtMode ? 'default' : 'outline'}
                  onClick={() => setCourtMode(!courtMode)}
                  className={courtMode ? 'bg-[#EF4444] w-full' : 'border-slate-700 w-full'}
                >
                  Court Mode: {courtMode ? 'ON' : 'OFF'}
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-2 block">Upload CSV</label>
              <div className="flex gap-3">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="csv-upload"
                />
                <label
                  htmlFor="csv-upload"
                  className="flex-1 flex items-center justify-center gap-2 p-4 bg-slate-800 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-slate-600 transition-colors"
                >
                  <Upload className="w-5 h-5 text-slate-400" />
                  <span className="text-slate-300">
                    {uploadedFile ? 'File uploaded ✓' : 'Click to upload CSV'}
                  </span>
                </label>
                <Button
                  onClick={() => submitJobMutation.mutate()}
                  disabled={!uploadedFile || submitJobMutation.isPending}
                  className="bg-[#EF4444] hover:bg-[#DC2626] px-8"
                >
                  {submitJobMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    'Start Job'
                  )}
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                CSV format: one indicator per line (IP addresses or email addresses)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Job History */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Job History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sortedJobs.length === 0 ? (
                <p className="text-center text-slate-400 py-12">No batch jobs yet</p>
              ) : (
                sortedJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-center gap-3 flex-1">
                      <FileText className="w-5 h-5 text-slate-400" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={getStatusColor(job.status)}>
                            {job.status.toUpperCase()}
                          </Badge>
                          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                            {job.job_type}
                          </Badge>
                        </div>
                        {job.counts && (
                          <p className="text-sm text-slate-400">
                            {job.counts.success}/{job.counts.total} successful
                            {job.counts.failed > 0 && ` • ${job.counts.failed} failed`}
                          </p>
                        )}
                        <p className="text-xs text-slate-500 mt-1">
                          {format(new Date(job.created_date), 'MMM d, yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                    {job.status === 'success' && job.output_file_ref && (
                      <Button
                        size="sm"
                        onClick={() => downloadResults(job)}
                        variant="outline"
                        className="border-slate-700"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    )}
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