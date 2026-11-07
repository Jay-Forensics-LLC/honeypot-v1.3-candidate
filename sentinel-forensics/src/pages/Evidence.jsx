import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import EvidenceShareDialog from "../components/collaboration/EvidenceShareDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Upload,
  Search,
  Database,
  FileText,
  CheckCircle,
  AlertTriangle,
  Calendar as CalendarIcon,
  Hash,
  Eye,
  Trash2,
  Download,
  FolderOpen,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Share2
} from "lucide-react";
import EvidenceSummaryCard from "../components/ai/EvidenceSummaryCard";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { DateUtils } from "../components/utils/DateUtils";
import { createPageUrl } from "../utils";
import LoadingTimeout from '../components/utils/LoadingTimeout';
import { FEATURE_FLAGS } from '../components/config/featureFlags';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import SecureEvidenceUploader from '../components/evidence/SecureEvidenceUploader';
import ForensicImageUploadCard from '../components/evidence/ForensicImageUploadCard';
import { useOrgQuery, useOrgList } from '../components/hooks/useOrgQuery';
import { useUser } from '../components/hooks/useUser';
import PageHeader from '../components/common/PageHeader';
import StatCard from '../components/common/StatCard';
import TagFilters from '../components/evidence/TagFilters';
import EvidenceTagPreview from '../components/evidence/EvidenceTagPreview';

const ITEMS_PER_PAGE = 20;

export default function Evidence() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterCase, setFilterCase] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [shareDialog, setShareDialog] = useState(null);
  const [tagFilter, setTagFilter] = useState({ tags: [], matchMode: 'ANY', excludeTags: [] });
  // Removed: [selectedFile, setSelectedFile]

  // Removed: newEvidence state
  // Removed: newEvidence state

  const queryClient = useQueryClient();
  const { data: user } = useUser();

  // ORG-SCOPED: Automatically filters by organization_id
  const { data: evidenceData, isLoading, error, refetch } = useOrgQuery(
    'EvidenceV2',
    {
      ...(filterType !== 'all' && { evidence_type: filterType }),
      ...(filterCase !== 'all' && { case_id: filterCase }),
      ...(searchTerm && { title: { $contains: searchTerm } })
    },
    '-collection_timestamp',
    ITEMS_PER_PAGE,
    {
      staleTime: 30000,
      keepPreviousData: true,
      retry: 0,
      select: (data) => ({
        items: data || [],
        total: (data || []).length,
        page: currentPage
      })
    }
  );

  // ORG-SCOPED: Automatically filters by organization_id
  const { data: cases = [] } = useOrgList('Case', '-created_date', 100, {
    staleTime: 60000,
    retry: 0
  });

  // Removed: uploadFileMutation
  // Removed: uploadFileMutation

  // BACKEND-ONLY: Use verifyEvidenceIntegrity function (enforces RLS, generates hash, logs chain)
  const verifyEvidenceMutation = useMutation({
    mutationFn: async (evidenceId) => {
      const response = await base44.functions.invoke('verifyEvidenceIntegrity', { evidence_id: evidenceId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-query', 'EvidenceV2'] });
      toast.success('Evidence verified!');
    },
    onError: (error) => {
      toast.error('Failed to verify evidence', {
        description: error.message || 'Please try again'
      });
    }
  });

  // BACKEND-ONLY: Use deleteEvidence function (checks legal_hold, logs audit, handles cascade)
  const deleteEvidenceMutation = useMutation({
    mutationFn: async (evidenceId) => {
      const response = await base44.functions.invoke('deleteEvidence', { evidence_id: evidenceId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-query', 'EvidenceV2'] });
      setDeleteConfirm(null);
      toast.success('Evidence deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete evidence', {
        description: error.message || 'Evidence may be under legal hold'
      });
    }
  });

  // Removed: handleFileUpload

  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  const evidence = evidenceData?.items || [];
  const totalPages = Math.ceil((evidenceData?.total || 0) / ITEMS_PER_PAGE);

  const getEvidenceIcon = (type) => {
    const icons = {
      file: FileText,
      network_capture: Database,
      device_log: FileText,
      screenshot: Eye,
      metadata: FileText,
      forensic_image: Database,
      memory_dump: Database,
    };
    const Icon = icons[type] || FileText;
    return <Icon className="w-6 h-6 text-white" />;
  };

  const getTypeColor = (type) => {
    const colors = {
      file: 'bg-blue-500/20 text-blue-300',
      network_capture: 'bg-purple-500/20 text-purple-300',
      device_log: 'bg-green-500/20 text-green-300',
      screenshot: 'bg-pink-500/20 text-pink-300',
      metadata: 'bg-yellow-500/20 text-yellow-300',
      forensic_image: 'bg-red-500/20 text-red-300',
      memory_dump: 'bg-orange-500/20 text-orange-300',
      other: 'bg-slate-500/20 text-slate-300'
    };
    return colors[type] || colors.other;
  };

  return (
    <LoadingTimeout isLoading={isLoading} error={error} onRetry={refetch}>
      <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Evidence Vault</h1>
            <p className="text-slate-400">Secure digital evidence storage with chain-of-custody</p>
          </div>
          {/* Removed old Upload Evidence button as SecureEvidenceUploader handles its own trigger */}
        </div>

        <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Standard Evidence Uploader */}
            <SecureEvidenceUploader
              cases={cases}
              userEmail={user?.email || 'demo@sentinel-forensics.com'}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['org-query', 'EvidenceV2'] });
              }}
            />
            
            {/* Forensic Image Uploader */}
            <ForensicImageUploadCard caseId={filterCase !== 'all' ? filterCase : null} />
          </div>

          {/* Removed: Upload Dialog - iOS Optimized */}
          {/* Removed: Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} */}

          {/* Tag Filters */}
          <TagFilters 
            caseId={filterCase !== 'all' ? filterCase : null} 
            onFilterChange={setTagFilter}
          />

          {/* Filters */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      handleFilterChange();
                    }}
                    placeholder="Search evidence..."
                    className="pl-10 bg-slate-800 border-slate-700"
                  />
                </div>

                <Select value={filterType} onValueChange={(val) => { setFilterType(val); handleFilterChange(); }}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="file">Files</SelectItem>
                    <SelectItem value="network_capture">Network Captures</SelectItem>
                    <SelectItem value="device_log">Device Logs</SelectItem>
                    <SelectItem value="screenshot">Screenshots</SelectItem>
                    <SelectItem value="metadata">Metadata</SelectItem>
                    <SelectItem value="forensic_image">Forensic Images</SelectItem>
                    <SelectItem value="memory_dump">Memory Dumps</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterCase} onValueChange={(val) => { setFilterCase(val); handleFilterChange(); }}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue placeholder="Filter by case" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="all">All Cases</SelectItem>
                    {cases.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.case_number} - {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <Database className="w-10 h-10 text-blue-400" />
                  <div>
                    <p className="text-3xl font-bold text-white">{evidenceData?.total || 0}</p>
                    <p className="text-xs text-slate-400">Total Evidence</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-10 h-10 text-green-400" />
                  <div>
                    <p className="text-3xl font-bold text-white">
                      {evidence.filter(e => e.is_verified).length}
                    </p>
                    <p className="text-xs text-slate-400">Verified (current page)</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-10 h-10 text-yellow-400" />
                  <div>
                    <p className="text-3xl font-bold text-white">
                      {evidence.filter(e => !e.is_verified).length}
                    </p>
                    <p className="text-xs text-slate-400">Pending Verification</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <FolderOpen className="w-10 h-10 text-purple-400" />
                  <div>
                    <p className="text-3xl font-bold text-white">{cases.length}</p>
                    <p className="text-xs text-slate-400">Active Cases</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Evidence List */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-between">
                <span>Evidence Items</span>
                {totalPages > 1 && (
                  <span className="text-sm text-slate-400">
                    Page {currentPage} of {totalPages}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {evidence.length === 0 ? (
                <div className="text-center py-12">
                  <Database className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                  <p className="text-slate-400 mb-4">
                    No evidence found matching your filters.
                  </p>
                  <Button
                    onClick={() => {
                      setSearchTerm('');
                      setFilterType('all');
                      setFilterCase('all');
                      setCurrentPage(1);
                    }}
                    className="mt-4 bg-blue-600 hover:bg-blue-700"
                  >
                    Clear All Filters
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {evidence.map((item) => {
                      const associatedCase = cases.find(c => c.id === item.case_id);

                      return (
                        <Card key={item.id} className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-all relative">
                          {!item.is_verified && (
                            <div className="absolute top-2 right-2 z-10">
                              <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 animate-pulse">
                                ⚠️ NOT LEGALLY ADMISSIBLE UNTIL VERIFIED (F.S. 90.803)
                              </Badge>
                            </div>
                          )}

                          <CardContent className="p-6 pt-12">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-4 flex-1">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                  {getEvidenceIcon(item.evidence_type)}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-lg font-semibold text-white truncate">
                                      {item.title}
                                    </h3>
                                    <Badge className={getTypeColor(item.evidence_type)}>
                                      {item.evidence_type.replace('_', ' ')}
                                    </Badge>
                                    {item.is_verified ? (
                                      <Badge className="bg-green-500/20 text-green-400">
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Verified
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-yellow-500/20 text-yellow-400">
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                        Pending
                                      </Badge>
                                    )}
                                  </div>

                                  <p className="text-sm text-slate-400 mb-3 line-clamp-2">
                                    {item.description}
                                  </p>

                                  {/* AI Summary Inline */}
                                  <EvidenceSummaryCard evidence={item} />

                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                    <div>
                                      <p className="text-slate-500 mb-1">Evidence #</p>
                                      <p className="text-white font-mono">{item.evidence_number}</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-500 mb-1">Case</p>
                                      <p className="text-white font-mono">
                                        {associatedCase?.case_number || 'N/A'}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-slate-500 mb-1">Collected</p>
                                      <p className="text-white flex items-center gap-1">
                                        <CalendarIcon className="w-3 h-3" />
                                        {DateUtils.safeFormatDate(
                                          item.collection_timestamp || item.created_date,
                                          'N/A'
                                        )}
                                      </p>
                                    </div>
                                    <div>
                                     <p className="text-slate-500 mb-1">Hash (SHA-256)</p>
                                     <p className="text-white font-mono text-[10px] flex items-center gap-1 truncate">
                                       <Hash className="w-3 h-3 flex-shrink-0" />
                                       {item.file_hash_sha256?.substring(0, 16) || 'N/A'}...
                                     </p>
                                    </div>
                                    </div>

                                    {/* Tag preview - inline */}
                                    <div className="mt-3 pt-3 border-t border-slate-700">
                                    <EvidenceTagPreview evidenceId={item.id} />
                                    </div>
                                    </div>
                                    </div>

                              <div className="flex flex-col gap-2 ml-4">
                                <Button
                                  size="sm"
                                  onClick={() => window.location.href = createPageUrl(`EvidenceDetail/${item.id}`)}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Details
                                </Button>

                                {item.file_url && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(item.file_url, '_blank')}
                                    className="border-slate-700"
                                  >
                                    <Download className="w-4 h-4 mr-2" />
                                    View File
                                  </Button>
                                )}

                                {!item.is_verified && (
                                  <Button
                                    size="sm"
                                    onClick={() => verifyEvidenceMutation.mutate(item.id)}
                                    disabled={verifyEvidenceMutation.isPending}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    {verifyEvidenceMutation.isPending && verifyEvidenceMutation.variables === item.id ? (
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                      <CheckCircle className="w-4 h-4 mr-2" />
                                    )}
                                    Verify
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      await base44.functions.invoke('evidenceAnalyzeStart', { 
                                        evidence_id: item.id,
                                        job_types: ['anomaly_detect', 'ioc_correlate']
                                      });
                                      toast.success('Analysis queued');
                                    } catch (error) {
                                      toast.error('Analysis failed');
                                    }
                                  }}
                                  className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                                  title="Run AI analysis"
                                >
                                  <Sparkles className="w-4 h-4" />
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setShareDialog(item)}
                                  className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                                >
                                  <Share2 className="w-4 h-4" />
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDeleteConfirm(item)}
                                  className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>

                            {item.chain_of_custody && item.chain_of_custody.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-slate-800">
                                <details className="text-sm">
                                  <summary className="text-slate-400 cursor-pointer hover:text-white transition-colors">
                                    Chain of Custody ({item.chain_of_custody.length} entries)
                                  </summary>
                                  <div className="mt-3 space-y-2">
                                    {item.chain_of_custody.map((entry, idx) => (
                                      <div key={idx} className="flex items-center justify-between text-xs bg-slate-800/50 p-2 rounded">
                                        <span className="text-slate-300">{entry.action || 'Action'}</span>
                                        <span className="text-slate-400">{entry.performed_by || 'Unknown'}</span>
                                        <span className="text-slate-500">
                                          {DateUtils.safeFormatDateTime(entry.timestamp, 'N/A')}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              </div>
                            )}

                            <div className="mt-4 pt-4 border-t border-slate-800">
                              <p className="text-xs text-slate-500">
                                <strong className="text-slate-400">Miami-Dade County Chain of Custody:</strong> Evidence
                                collected {DateUtils.safeFormatDateTime(item.collection_timestamp || item.created_date, 'at unknown time')}.
                                {item.is_verified ? ' Forensically verified.' : ' Pending verification per F.S. 90.803(6).'}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-800">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1 || isLoading}
                        className="border-slate-700 text-white hover:bg-slate-700"
                      >
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        Previous
                      </Button>
                      
                      <div className="flex items-center gap-2">
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 7) {
                            pageNum = i + 1;
                          } else if (currentPage <= 4) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 3) {
                            pageNum = totalPages - 6 + i;
                          } else {
                            pageNum = currentPage - 3 + i;
                          }
                          
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? 'default' : 'outline'}
                              onClick={() => setCurrentPage(pageNum)}
                              className={currentPage === pageNum ? 'bg-blue-600 text-white' : 'border-slate-700 text-white hover:bg-slate-700'}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>

                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages || isLoading}
                        className="border-slate-700 text-white hover:bg-slate-700"
                      >
                        Next
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Delete Confirmation Dialog */}
          <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
            <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Evidence?</AlertDialogTitle>
                <AlertDialogDescription className="text-slate-400">
                  This will permanently delete "{deleteConfirm?.title}". This action cannot be undone and will break the chain of custody.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteConfirm && deleteEvidenceMutation.mutate(deleteConfirm.id)}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={deleteEvidenceMutation.isPending}
                >
                  {deleteEvidenceMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete Evidence'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
          {FEATURE_FLAGS.PUBLIC_DEMO_MODE && (
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 text-center">
              <p className="text-blue-200 text-sm">
                <strong>Demo Mode:</strong> Evidence exports are simulated in demo mode. 
                Full export functionality available in production builds.
              </p>
            </div>
          )}
        </div>

        {/* Evidence Share Dialog */}
        <EvidenceShareDialog
          evidence={shareDialog}
          open={!!shareDialog}
          onClose={() => setShareDialog(null)}
        />
      </div>
    </LoadingTimeout>
  );
}