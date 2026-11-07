import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Monitor, Play, Loader2, Eye, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import DeviceFingerprintDetailDrawer from '../components/device/DeviceFingerprintDetailDrawer';

export default function DeviceIntel() {
  const { id: caseId } = useParams();
  const queryClient = useQueryClient();
  const [selectedFingerprint, setSelectedFingerprint] = useState(null);

  const { data: fingerprints = [] } = useQuery({
    queryKey: ['device-fingerprints', caseId],
    queryFn: async () => {
      return await base44.entities.DeviceFingerprint.filter({ case_id: caseId });
    }
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('runDeviceRiskEnrichment', {
        caseId
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['device-fingerprints', caseId] });
      toast.success(`Analyzed ${data.fingerprints.length} device fingerprints`, {
        description: `${data.stats.spoofing_detected} spoofing detected`
      });
    },
    onError: (error) => {
      toast.error('Analysis failed', { description: error.message });
    }
  });

  const getRiskColor = (score) => {
    if (score >= 70) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (score >= 40) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-green-500/20 text-green-400 border-green-500/30';
  };

  const stats = {
    total: fingerprints.length,
    spoofing: fingerprints.filter(f => f.derived_signals.spoofing_likely).length,
    headless: fingerprints.filter(f => f.derived_signals.headless_likely).length,
    highRisk: fingerprints.filter(f => f.risk_score >= 70).length
  };

  return (
    <>
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Device Intelligence</h1>
              <p className="text-slate-400">Device fingerprinting and spoofing detection</p>
            </div>
            <Button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              className="bg-[#EF4444] hover:bg-[#DC2626]"
            >
              {analyzeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Derive Fingerprints
                </>
              )}
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">Total Devices</p>
                <p className="text-3xl font-bold text-white mt-1">{stats.total}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">Spoofing Detected</p>
                <p className="text-3xl font-bold text-red-400 mt-1">{stats.spoofing}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">Headless Browsers</p>
                <p className="text-3xl font-bold text-orange-400 mt-1">{stats.headless}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <p className="text-sm text-slate-400">High Risk</p>
                <p className="text-3xl font-bold text-yellow-400 mt-1">{stats.highRisk}</p>
              </CardContent>
            </Card>
          </div>

          {/* Fingerprints Table */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Device Fingerprints</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {fingerprints.length === 0 ? (
                  <div className="text-center py-12">
                    <Monitor className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No device fingerprints yet</p>
                    <p className="text-sm text-slate-500 mt-2">Run analysis to derive fingerprints from events</p>
                  </div>
                ) : (
                  fingerprints.map((fp) => (
                    <div
                      key={fp.id}
                      className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
                      onClick={() => setSelectedFingerprint(fp)}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Monitor className="w-5 h-5 text-slate-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-mono text-sm truncate">
                            {fp.fingerprint_id.substring(0, 32)}...
                          </p>
                          <p className="text-xs text-slate-500 mt-1 truncate">{fp.user_agent}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge className={getRiskColor(fp.risk_score)}>
                              Risk: {fp.risk_score}/100
                            </Badge>
                            {fp.derived_signals.spoofing_likely && (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Spoofing
                              </Badge>
                            )}
                            {fp.derived_signals.headless_likely && (
                              <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                                Headless
                              </Badge>
                            )}
                            {fp.tags.map((tag, idx) => (
                              <Badge key={idx} className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                                {tag}
                              </Badge>
                            ))}
                            <span className="text-xs text-slate-500">
                              Confidence: {Math.round(fp.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      <Eye className="w-4 h-4 text-slate-400 ml-4" />
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {selectedFingerprint && (
        <DeviceFingerprintDetailDrawer
          fingerprint={selectedFingerprint}
          caseId={caseId}
          onClose={() => setSelectedFingerprint(null)}
        />
      )}
    </>
  );
}