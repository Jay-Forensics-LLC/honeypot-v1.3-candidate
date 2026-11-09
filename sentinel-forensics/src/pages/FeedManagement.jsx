import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Rss, Plus, Play, CheckCircle2, XCircle, Clock, Hash, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

export default function FeedManagement() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedFeed, setSelectedFeed] = useState(null);
  const [formData, setFormData] = useState({
    feed_name: '',
    feed_type: 'json',
    feed_url: '',
    refresh_interval_minutes: 1440
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: feeds = [], isLoading } = useQuery({
    queryKey: ['threat-intel-feeds'],
    queryFn: () => base44.entities.ThreatIntelFeed.list()
  });

  const { data: ingestRuns = [] } = useQuery({
    queryKey: ['ingest-runs', selectedFeed?.id],
    queryFn: () => base44.entities.IntelIngestRun.filter({ feed_id: selectedFeed.id }),
    enabled: !!selectedFeed
  });

  const createFeedMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.ThreatIntelFeed.create({
        organization_id: user?.organization_id || 'default',
        ...data,
        is_active: true,
        ioc_count: 0
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threat-intel-feeds'] });
      setShowCreateDialog(false);
      setFormData({ feed_name: '', feed_type: 'json', feed_url: '', refresh_interval_minutes: 1440 });
      toast.success('Feed created');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create feed');
    }
  });

  const toggleFeedMutation = useMutation({
    mutationFn: async (feed) => {
      return base44.entities.ThreatIntelFeed.update(feed.id, {
        is_active: !feed.is_active
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threat-intel-feeds'] });
      toast.success('Feed updated');
    }
  });

  const manualIngestMutation = useMutation({
    mutationFn: async (feedId) => {
      const response = await base44.functions.invoke('ingestThreatFeed', {
        feed_id: feedId,
        iocs: [] // Manual trigger uses empty array - function should fetch from URL
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threat-intel-feeds'] });
      queryClient.invalidateQueries({ queryKey: ['ingest-runs'] });
      toast.success('Feed ingestion started');
    },
    onError: (error) => {
      toast.error(error.message || 'Manual ingest failed');
    }
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Threat Intel Feeds</h1>
            <p className="text-slate-400">Automated IOC ingestion and correlation</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} className="bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Feed
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {feeds.map(feed => (
            <Card key={feed.id} className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Rss className="w-5 h-5 text-red-400" />
                      {feed.feed_name}
                    </CardTitle>
                    <p className="text-xs text-slate-400 mt-1">{feed.feed_type}</p>
                  </div>
                  <Switch
                    checked={feed.is_active}
                    onCheckedChange={() => toggleFeedMutation.mutate(feed)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">IOCs Ingested</p>
                    <p className="text-white font-semibold">{feed.ioc_count || 0}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Refresh Interval</p>
                    <p className="text-white font-semibold">
                      {feed.refresh_interval_minutes < 60 
                        ? `${feed.refresh_interval_minutes}m` 
                        : `${Math.round(feed.refresh_interval_minutes / 60)}h`}
                    </p>
                  </div>
                </div>

                {feed.last_ingest_at && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      {getStatusIcon(feed.last_ingest_status)}
                      <span className="text-slate-400">
                        Last ingest: {formatDistanceToNow(new Date(feed.last_ingest_at), { addSuffix: true })}
                      </span>
                    </div>
                    {feed.last_ingest_hash && (
                      <div className="flex items-center gap-2 text-xs">
                        <Hash className="w-3 h-3 text-slate-500" />
                        <span className="text-slate-500 font-mono">{feed.last_ingest_hash.substring(0, 16)}...</span>
                      </div>
                    )}
                    {feed.last_ingest_error && (
                      <div className="flex items-start gap-2 text-xs">
                        <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5" />
                        <span className="text-red-400">{feed.last_ingest_error}</span>
                      </div>
                    )}
                  </div>
                )}

                {feed.next_ingest_at && (
                  <div className="text-xs text-slate-500">
                    Next: {new Date(feed.next_ingest_at).toLocaleString()}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => manualIngestMutation.mutate(feed.id)}
                    disabled={manualIngestMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Run Now
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedFeed(feed)}
                  >
                    View History
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {feeds.length === 0 && !isLoading && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <Rss className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No threat intel feeds configured</p>
            </CardContent>
          </Card>
        )}

        {/* Create Feed Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="bg-slate-900 border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white">Add Threat Intel Feed</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-slate-400">Feed Name</Label>
                <Input
                  value={formData.feed_name}
                  onChange={(e) => setFormData({ ...formData, feed_name: e.target.value })}
                  placeholder="e.g., AlienVault OTX"
                  className="bg-slate-800 border-slate-700 text-white mt-2"
                />
              </div>
              <div>
                <Label className="text-slate-400">Feed Type</Label>
                <Select value={formData.feed_type} onValueChange={(v) => setFormData({ ...formData, feed_type: v })}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="stix">STIX</SelectItem>
                    <SelectItem value="misp">MISP</SelectItem>
                    <SelectItem value="otx">AlienVault OTX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-400">Feed URL</Label>
                <Input
                  value={formData.feed_url}
                  onChange={(e) => setFormData({ ...formData, feed_url: e.target.value })}
                  placeholder="https://..."
                  className="bg-slate-800 border-slate-700 text-white mt-2"
                />
              </div>
              <div>
                <Label className="text-slate-400">Refresh Interval (minutes)</Label>
                <Input
                  type="number"
                  value={formData.refresh_interval_minutes}
                  onChange={(e) => setFormData({ ...formData, refresh_interval_minutes: parseInt(e.target.value) })}
                  className="bg-slate-800 border-slate-700 text-white mt-2"
                />
              </div>
              <Button
                onClick={() => createFeedMutation.mutate(formData)}
                disabled={!formData.feed_name || !formData.feed_url || createFeedMutation.isPending}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                Create Feed
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Feed History Dialog */}
        <Dialog open={!!selectedFeed} onOpenChange={() => setSelectedFeed(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white">
                {selectedFeed?.feed_name} - Ingest History
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              {ingestRuns.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No ingest runs yet</p>
              ) : (
                ingestRuns.map(run => (
                  <Card key={run.id} className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {run.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          {run.status === 'running' && <Clock className="w-4 h-4 animate-spin text-blue-500" />}
                          {run.status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
                          <span className="text-white font-semibold">{run.status.toUpperCase()}</span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {formatDistanceToNow(new Date(run.created_date), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-slate-500">Added</p>
                          <p className="text-green-400 font-semibold">{run.iocs_added || 0}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Deduped</p>
                          <p className="text-yellow-400 font-semibold">{run.iocs_deduplicated || 0}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Updated</p>
                          <p className="text-blue-400 font-semibold">{run.iocs_updated || 0}</p>
                        </div>
                      </div>
                      {run.input_hash && (
                        <div className="flex items-center gap-2 mt-2 text-xs">
                          <Hash className="w-3 h-3 text-slate-500" />
                          <span className="text-slate-500 font-mono">{run.input_hash.substring(0, 32)}...</span>
                        </div>
                      )}
                      {run.error_message && (
                        <div className="mt-2 text-xs text-red-400 bg-red-500/10 rounded p-2">
                          {run.error_message}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}