
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  X,
  EyeOff,
  Shield,
  CheckCircle,
  ExternalLink,
  Loader2,
  Star,
  StarOff,
  Bell,
  BellOff,
  FileText, // Added FileText import
} from "lucide-react";
import { toast } from "sonner";
import { DateUtils } from "../utils/DateUtils";

export default function IndicatorDrawer({ indicator, open, onClose }) {
  const [notes, setNotes] = useState(indicator?.notes || "");
  const [status, setStatus] = useState(indicator?.status || "new");
  const [removeWatchlistConfirm, setRemoveWatchlistConfirm] = useState(false);
  const queryClient = useQueryClient();

  const { data: enrichments = [], isLoading: enrichmentsLoading } = useQuery({
    queryKey: ['enrichments', indicator?.indicator_id],
    queryFn: async () => {
      if (!indicator?.indicator_id) return [];
      return await base44.entities.EnrichmentResult.filter({
        indicator_id: indicator.indicator_id
      });
    },
    enabled: !!indicator?.indicator_id
  });

  // Check if indicator is on watchlist
  const { data: watchlistEntry, isLoading: watchlistLoading } = useQuery({
    queryKey: ['watchlist-entry', indicator?.indicator_type, indicator?.value],
    queryFn: async () => {
      if (!indicator) return null;
      const entries = await base44.entities.Watchlist.filter({
        entry_type: indicator.indicator_type === 'ip' ? 'ip_address' : indicator.indicator_type,
        entry_value: indicator.value
      });
      return entries[0] || null;
    },
    enabled: !!indicator
  });

  const updateIndicatorMutation = useMutation({
    mutationFn: async ({ status, notes }) => {
      return await base44.entities.IOCIndicator.update(indicator.id, {
        status,
        notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indicators'] });
      queryClient.invalidateQueries({ queryKey: ['indicator', indicator.indicator_id] });
      toast.success('Indicator updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update indicator', {
        description: error.message
      });
    }
  });

  const addToWatchlistMutation = useMutation({
    mutationFn: async () => {
      // Map indicator type to watchlist entry type
      let entryType = indicator.indicator_type;
      if (indicator.indicator_type === 'ip') {
        entryType = 'ip_address';
      }

      // Determine threat level based on reputation score or confidence
      let threatLevel = 'suspicious';
      if (indicator.reputation_score >= 80) {
        threatLevel = 'benign';
      } else if (indicator.reputation_score >= 60) {
        threatLevel = 'suspicious';
      } else if (indicator.reputation_score >= 40) {
        threatLevel = 'malicious';
      } else {
        threatLevel = 'known_threat';
      }

      return await base44.entities.Watchlist.create({
        watchlist_id: `WL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: `${indicator.indicator_type}: ${indicator.value}`,
        entry_type: entryType,
        entry_value: indicator.value,
        threat_level: threatLevel,
        description: indicator.notes || `Added from IOC ${indicator.indicator_id}`,
        alert_on_detection: true,
        detection_count: indicator.recurrence_count || 0,
        last_detected: indicator.last_seen,
        tags: indicator.tags || [],
        notes: `Source: Evidence ${indicator.evidence_id}\nCase: ${indicator.case_id || 'N/A'}\nConfidence: ${(indicator.confidence * 100).toFixed(0)}%`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist-entry', indicator.indicator_type, indicator.value] });
      toast.success('Indicator added to watchlist', {
        description: `${indicator.indicator_type}: ${indicator.value.substring(0, 50)}${indicator.value.length > 50 ? '...' : ''}`
      });
    },
    onError: (error) => {
      toast.error('Failed to add to watchlist', {
        description: error.message
      });
    }
  });

  const removeFromWatchlistMutation = useMutation({
    mutationFn: async () => {
      if (!watchlistEntry) throw new Error('No watchlist entry found');
      return await base44.entities.Watchlist.delete(watchlistEntry.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist-entry', indicator.indicator_type, indicator.value] });
      setRemoveWatchlistConfirm(false);
      toast.success('Indicator removed from watchlist');
    },
    onError: (error) => {
      toast.error('Failed to remove from watchlist', {
        description: error.message
      });
    }
  });

  const toggleWatchlistAlertMutation = useMutation({
    mutationFn: async (alertEnabled) => {
      if (!watchlistEntry) throw new Error('No watchlist entry found');
      return await base44.entities.Watchlist.update(watchlistEntry.id, {
        alert_on_detection: alertEnabled
      });
    },
    onSuccess: (_, alertEnabled) => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist-entry', indicator.indicator_type, indicator.value] });
      toast.success(alertEnabled ? 'Alerts enabled for this indicator' : 'Alerts disabled for this indicator');
    },
    onError: (error) => {
      toast.error('Failed to update alert setting', {
        description: error.message
      });
    }
  });

  const ignoreIndicatorMutation = useMutation({
    mutationFn: async () => {
      const ignoreUntil = new Date();
      ignoreUntil.setDate(ignoreUntil.getDate() + 30); // Ignore for 30 days
      
      return await base44.entities.IOCIndicator.update(indicator.id, {
        status: 'ignored',
        ignored_until: ignoreUntil.toISOString(),
        notes: notes || 'Marked as false positive'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indicators'] });
      toast.success('Indicator ignored for 30 days');
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to ignore indicator', {
        description: error.message
      });
    }
  });

  const handleSave = () => {
    updateIndicatorMutation.mutate({ status, notes });
  };

  if (!indicator) return null;

  const getTypeColor = (type) => {
    const colors = {
      ip: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      domain: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
      url: 'bg-green-500/20 text-green-400 border-green-500/50',
      email: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      md5: 'bg-red-500/20 text-red-400 border-red-500/50',
      sha1: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      sha256: 'bg-pink-500/20 text-pink-400 border-pink-500/50',
    };
    return colors[type] || 'bg-slate-500/20 text-slate-400 border-slate-500/50';
  };

  const getStatusColor = (status) => {
    const colors = {
      new: 'bg-blue-500/20 text-blue-400',
      investigating: 'bg-yellow-500/20 text-yellow-400',
      benign: 'bg-green-500/20 text-green-400',
      malicious: 'bg-red-500/20 text-red-400',
      ignored: 'bg-slate-500/20 text-slate-400',
    };
    return colors[status] || 'bg-slate-500/20 text-slate-400';
  };

  const getReputationColor = (score) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const isOnWatchlist = !!watchlistEntry;

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="right" className="bg-slate-900 border-slate-800 text-white w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <SheetTitle className="text-white text-xl mb-2">Indicator Details</SheetTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={getTypeColor(indicator.indicator_type)}>
                    {indicator.indicator_type}
                  </Badge>
                  <Badge className={getStatusColor(status)}>
                    {status}
                  </Badge>
                  {indicator.is_allowlisted && (
                    <Badge className="bg-green-500/20 text-green-400">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Allowlisted
                    </Badge>
                  )}
                  {indicator.is_local && (
                    <Badge className="bg-slate-500/20 text-slate-400">
                      Local/Private
                    </Badge>
                  )}
                  {isOnWatchlist && (
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">
                      <Star className="w-3 h-3 mr-1 fill-yellow-400" />
                      On Watchlist
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Value Display */}
            <div>
              <Label className="text-slate-400 text-sm">Value</Label>
              <div className="mt-1 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <p className="text-white font-mono text-sm break-all">{indicator.value}</p>
              </div>
            </div>

            {/* Reputation Score */}
            {indicator.reputation_score !== undefined && indicator.reputation_score !== null && (
              <div>
                <Label className="text-slate-400 text-sm">Reputation Score</Label>
                <div className="mt-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-2xl font-bold ${getReputationColor(indicator.reputation_score)}`}>
                      {indicator.reputation_score}/100
                    </span>
                    <span className="text-sm text-slate-400">
                      {indicator.reputation_score >= 80 ? 'Good' :
                       indicator.reputation_score >= 60 ? 'Moderate' :
                       indicator.reputation_score >= 40 ? 'Suspicious' : 'Malicious'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        indicator.reputation_score >= 80 ? 'bg-green-500' :
                        indicator.reputation_score >= 60 ? 'bg-yellow-500' :
                        indicator.reputation_score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${indicator.reputation_score}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex gap-2 flex-wrap">
              {!isOnWatchlist ? (
                <Button
                  onClick={() => addToWatchlistMutation.mutate()}
                  disabled={addToWatchlistMutation.isPending || watchlistLoading}
                  className="bg-yellow-600 hover:bg-yellow-700"
                  size="sm"
                >
                  {addToWatchlistMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Star className="w-4 h-4 mr-2" />
                  )}
                  Add to Watchlist
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => setRemoveWatchlistConfirm(true)}
                    disabled={removeFromWatchlistMutation.isPending}
                    variant="outline"
                    className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
                    size="sm"
                  >
                    <StarOff className="w-4 h-4 mr-2" />
                    Remove from Watchlist
                  </Button>
                  <Button
                    onClick={() => toggleWatchlistAlertMutation.mutate(!watchlistEntry.alert_on_detection)}
                    disabled={toggleWatchlistAlertMutation.isPending}
                    variant="outline"
                    size="sm"
                  >
                    {watchlistEntry.alert_on_detection ? (
                      <>
                        <BellOff className="w-4 h-4 mr-2" />
                        Disable Alerts
                      </>
                    ) : (
                      <>
                        <Bell className="w-4 h-4 mr-2" />
                        Enable Alerts
                      </>
                    )}
                  </Button>
                </>
              )}
              {status !== 'ignored' && (
                <Button
                  onClick={() => ignoreIndicatorMutation.mutate()}
                  disabled={ignoreIndicatorMutation.isPending}
                  variant="outline"
                  className="border-slate-500/50 text-slate-400 hover:bg-slate-500/10"
                  size="sm"
                >
                  <EyeOff className="w-4 h-4 mr-2" />
                  Ignore (30 days)
                </Button>
              )}
            </div>

            <Tabs defaultValue="details" className="w-full">
              <TabsList className="bg-slate-800 border-slate-700">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="enrichment">
                  Enrichment {enrichments.length > 0 && `(${enrichments.length})`}
                </TabsTrigger>
                <TabsTrigger value="context">Context</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-400 text-xs">Confidence</Label>
                    <p className="text-white text-sm mt-1">
                      {(indicator.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs">Extraction Method</Label>
                    <p className="text-white text-sm mt-1">{indicator.extraction_method}</p>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs">First Seen</Label>
                    <p className="text-white text-sm mt-1">
                      {DateUtils.safeFormatDateTime(indicator.first_seen)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs">Last Seen</Label>
                    <p className="text-white text-sm mt-1">
                      {DateUtils.safeFormatDateTime(indicator.last_seen)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs">Recurrences</Label>
                    <p className="text-white text-sm mt-1">{indicator.recurrence_count || 1}</p>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs">Enrichment Status</Label>
                    <p className="text-white text-sm mt-1">{indicator.enrichment_status}</p>
                  </div>
                </div>

                {/* Status Update */}
                <div>
                  <Label className="text-slate-400">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="investigating">Investigating</SelectItem>
                      <SelectItem value="benign">Benign</SelectItem>
                      <SelectItem value="malicious">Malicious</SelectItem>
                      <SelectItem value="ignored">Ignored</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes */}
                <div>
                  <Label className="text-slate-400">Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add investigation notes..."
                    className="bg-slate-800 border-slate-700 text-white mt-1 min-h-[100px]"
                  />
                </div>

                <Button
                  onClick={handleSave}
                  disabled={updateIndicatorMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {updateIndicatorMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="enrichment" className="space-y-4">
                {enrichmentsLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400" />
                    <p className="text-slate-400 mt-2">Loading enrichment data...</p>
                  </div>
                ) : enrichments.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No enrichment data available</p>
                    <p className="text-sm mt-1">Run threat intelligence enrichment on this indicator</p>
                  </div>
                ) : (
                  enrichments.map((enrichment) => (
                    <div key={enrichment.enrichment_id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-white">{enrichment.provider}</h4>
                          <p className="text-xs text-slate-400">
                            {DateUtils.safeFormatDateTime(enrichment.fetched_at)}
                          </p>
                        </div>
                        <Badge className={
                          enrichment.status === 'success' ? 'bg-green-500/20 text-green-400' :
                          enrichment.status === 'error' ? 'bg-red-500/20 text-red-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }>
                          {enrichment.status}
                        </Badge>
                      </div>

                      {enrichment.summary && (
                        <div className="space-y-2">
                          {enrichment.summary.reputation && (
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-400">Reputation:</span>
                              <span className="text-white">{enrichment.summary.reputation}</span>
                            </div>
                          )}
                          {enrichment.summary.threat_score !== undefined && (
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-400">Threat Score:</span>
                              <span className={getReputationColor(enrichment.summary.threat_score)}>
                                {enrichment.summary.threat_score}/100
                              </span>
                            </div>
                          )}
                          {enrichment.summary.tags && enrichment.summary.tags.length > 0 && (
                            <div>
                              <span className="text-slate-400 text-sm">Tags:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {enrichment.summary.tags.map((tag, idx) => (
                                  <Badge key={idx} className="bg-slate-700 text-slate-300 text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {enrichment.summary.key_findings && enrichment.summary.key_findings.length > 0 && (
                            <div>
                              <span className="text-slate-400 text-sm">Key Findings:</span>
                              <ul className="mt-1 space-y-1">
                                {enrichment.summary.key_findings.map((finding, idx) => (
                                  <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                                    <span className="text-blue-400 mt-1">•</span>
                                    <span>{finding}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {enrichment.links && enrichment.links.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-700">
                          {enrichment.links.map((link, idx) => (
                            <a
                              key={idx}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                            >
                              {link.label}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ))}
                        </div>
                      )}

                      {enrichment.error_message && (
                        <div className="mt-2 text-sm text-red-400">
                          Error: {enrichment.error_message}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="context" className="space-y-4">
                {indicator.context?.context_window ? (
                  <div>
                    <Label className="text-slate-400">Context Window</Label>
                    <div className="mt-1 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                        {indicator.context.context_window}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No context information available</p>
                  </div>
                )}

                {indicator.context && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {indicator.context.char_offset !== undefined && (
                      <div>
                        <Label className="text-slate-400 text-xs">Character Offset</Label>
                        <p className="text-white mt-1">{indicator.context.char_offset}</p>
                      </div>
                    )}
                    {indicator.context.line_number !== undefined && (
                      <div>
                        <Label className="text-slate-400 text-xs">Line Number</Label>
                        <p className="text-white mt-1">{indicator.context.line_number}</p>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      {/* Remove from Watchlist Confirmation */}
      <AlertDialog open={removeWatchlistConfirm} onOpenChange={setRemoveWatchlistConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Watchlist?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will remove "{indicator.value}" from your watchlist. You will no longer receive alerts when this indicator is detected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeFromWatchlistMutation.mutate()}
              disabled={removeFromWatchlistMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {removeFromWatchlistMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
