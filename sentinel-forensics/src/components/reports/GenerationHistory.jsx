import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CheckCircle, XCircle, Clock, Download, Eye, Hash } from 'lucide-react';
import { formatRelativeTime } from '@/components/utils';

/**
 * GENERATION HISTORY
 * Forensic-grade audit trail of report executions
 */
export default function GenerationHistory({ templateId = null }) {
  const { data: user } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRun, setSelectedRun] = useState(null);

  // Fetch report runs
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['report-runs', user?.organization_id, templateId, statusFilter],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      
      const filters = { organization_id: user.organization_id };
      if (templateId) filters.template_id = templateId;
      if (statusFilter !== 'all') filters.status = statusFilter;
      
      return await base44.entities.ReportRun.filter(filters, '-started_at', 50);
    },
    enabled: !!user?.organization_id
  });

  const filteredRuns = runs.filter(run => {
    if (!searchQuery) return true;
    return run.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
           (run.template_version_snapshot && 
            run.template_version_snapshot.toLowerCase().includes(searchQuery.toLowerCase()));
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Generation History</h2>
        <p className="text-gray-400 text-sm">Forensic audit trail of report executions</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by run ID..."
          className="flex-1 bg-slate-800 border-slate-700 text-white"
        />
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Runs List */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading history...</div>
      ) : filteredRuns.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="py-12 text-center text-gray-400">
            No report runs found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredRuns.map((run) => (
            <Card key={run.id} className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors">
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(run.status)}
                      <span className="text-white font-mono text-sm">
                        {run.id.slice(0, 8)}...
                      </span>
                      <Badge variant="outline" className="border-slate-700 text-gray-400">
                        {run.execution_context}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Started:</span>
                        <div className="text-gray-300">
                          {formatRelativeTime(run.started_at)}
                        </div>
                      </div>
                      
                      {run.completed_at && (
                        <div>
                          <span className="text-gray-500">Duration:</span>
                          <div className="text-gray-300">
                            {Math.round((new Date(run.completed_at) - new Date(run.started_at)) / 1000)}s
                          </div>
                        </div>
                      )}
                      
                      {run.data_source_counts && (
                        <div>
                          <span className="text-gray-500">Records:</span>
                          <div className="text-gray-300">
                            {Object.values(run.data_source_counts).reduce((a, b) => a + b, 0)}
                          </div>
                        </div>
                      )}
                      
                      {run.audit_hash && (
                        <div>
                          <span className="text-gray-500">Audit Hash:</span>
                          <div className="text-gray-300 font-mono text-xs">
                            {run.audit_hash.slice(0, 12)}...
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedRun(run)}
                        className="border-slate-700 text-gray-400 hover:text-white"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Details
                      </Button>
                    </DialogTrigger>
                    
                    <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle className="text-white">Report Run Details</DialogTitle>
                      </DialogHeader>
                      
                      {selectedRun && (
                        <div className="space-y-6">
                          {/* Run Info */}
                          <div>
                            <h3 className="text-sm font-semibold text-gray-400 mb-2">Execution Info</h3>
                            <div className="bg-slate-800 rounded-lg p-4 space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-500">Run ID:</span>
                                <span className="text-gray-300 font-mono">{selectedRun.id}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Status:</span>
                                <Badge variant="outline" className="border-slate-700">
                                  {selectedRun.status}
                                </Badge>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Initiated By:</span>
                                <span className="text-gray-300">{selectedRun.initiated_by}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Context:</span>
                                <span className="text-gray-300">{selectedRun.execution_context}</span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Forensic Hashes */}
                          <div>
                            <h3 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
                              <Hash className="w-4 h-4" />
                              Tamper-Evident Audit Chain
                            </h3>
                            <div className="bg-slate-800 rounded-lg p-4 space-y-2 text-sm font-mono">
                              <div>
                                <span className="text-gray-500">Previous Hash:</span>
                                <div className="text-gray-300 break-all">{selectedRun.prev_audit_hash}</div>
                              </div>
                              <div>
                                <span className="text-gray-500">Current Hash:</span>
                                <div className="text-gray-300 break-all">{selectedRun.audit_hash}</div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Artifacts */}
                          {selectedRun.output_artifacts && selectedRun.output_artifacts.length > 0 && (
                            <div>
                              <h3 className="text-sm font-semibold text-gray-400 mb-2">Output Artifacts</h3>
                              <div className="space-y-2">
                                {selectedRun.output_artifacts.map((artifact, idx) => (
                                  <div key={idx} className="bg-slate-800 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-white font-medium">{artifact.filename}</span>
                                      <Badge className="bg-slate-700 text-gray-300">
                                        {artifact.format.toUpperCase()}
                                      </Badge>
                                    </div>
                                    <div className="text-xs space-y-1 text-gray-400">
                                      <div>Size: {(artifact.size / 1024).toFixed(2)} KB</div>
                                      <div className="font-mono">SHA-256: {artifact.checksum}</div>
                                    </div>
                                    <Button
                                      size="sm"
                                      className="w-full mt-2 bg-red-600 hover:bg-red-700"
                                    >
                                      <Download className="w-3 h-3 mr-1" />
                                      Download
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Filters Used */}
                          {selectedRun.filters_snapshot && (
                            <div>
                              <h3 className="text-sm font-semibold text-gray-400 mb-2">Filters Applied</h3>
                              <pre className="bg-slate-800 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto">
                                {JSON.stringify(JSON.parse(selectedRun.filters_snapshot), null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}