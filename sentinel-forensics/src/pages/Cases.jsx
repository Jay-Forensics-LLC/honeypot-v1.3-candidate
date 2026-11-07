import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, Search, FolderOpen, Calendar as CalendarIcon, 
  AlertTriangle, CheckCircle, Clock, XCircle, Loader2, 
  Filter, FileText, Eye, Sparkles
} from "lucide-react";
import AISummary from "../components/ai/AISummary";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { safeString, formatEnumTitle } from "../components/utils/SafetyUtils";
import { DateUtils } from "../components/utils/DateUtils";
import { Link } from "react-router-dom";
import { createPageUrl } from "../components/utils";
import { useOrgList } from "../components/hooks/useOrgQuery";
import { useUser } from "../components/hooks/useUser";
import PageHeader from "../components/common/PageHeader";
import CaseWizard from "../components/forensics/CaseWizard";
import CaseCreationWizard from "../components/cases/CaseCreationWizard";

export default function Cases() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [isCreating, setIsCreating] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showStabilizationWizard, setShowStabilizationWizard] = useState(false);
  const queryClient = useQueryClient();

  // ORG-SCOPED: Automatically filters by organization_id
  const { data: user } = useUser();
  const { data: cases = [], isLoading } = useOrgList('Case', '-created_date');

  const [newCase, setNewCase] = useState({
    title: '',
    description: '',
    case_type: 'network_intrusion',
    priority: 'medium'
  });

  const handleCreateCaseWithStabilization = async (caseData) => {
    const caseNumber = `CASE-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    
    await base44.entities.Case.create({
      organization_id: user.organization_id,
      case_number: caseNumber,
      title: caseData.title,
      description: caseData.description,
      priority: caseData.priority,
      status: 'open',
      assigned_to: user.email,
      tags: caseData.tags || [],
      stabilization_acknowledged: caseData.stabilization_acknowledged,
      stabilization_timestamp: caseData.stabilization_timestamp,
      stabilization_checklist: caseData.stabilization_checklist
    });

    queryClient.invalidateQueries({ queryKey: ['org-query', 'Case'] });
    setShowStabilizationWizard(false);
    toast.success('Case created with stabilization safeguards!');
  };

  const createCaseMutation = useMutation({
    mutationFn: async (caseData) => {
      const caseNumber = `CASE-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
      
      return await base44.entities.Case.create({
        organization_id: user.organization_id,
        case_number: caseNumber,
        title: caseData.title,
        description: caseData.description,
        case_type: caseData.case_type,
        priority: caseData.priority,
        status: 'open',
        assigned_to: user.email
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-query', 'Case'] });
      setIsCreating(false);
      setNewCase({
        title: '',
        description: '',
        case_type: 'network_intrusion',
        priority: 'medium'
      });
      toast.success('Case created successfully!');
    },
    onError: (error) => {
      console.error('Case creation error:', error);
      toast.error(error?.response?.data?.error || error?.message || 'Failed to create case');
    }
  });

  const filteredCases = cases.filter(c => {
    const matchesSearch = 
      safeString(c.title).toLowerCase().includes(searchTerm.toLowerCase()) ||
      safeString(c.case_number).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || c.priority === filterPriority;
    const matchesType = filterType === 'all' || c.case_type === filterType;
    return matchesSearch && matchesStatus && matchesPriority && matchesType;
  });

  const getStatusColor = (status) => {
    const colors = {
      open: 'bg-green-500/20 text-green-300 border-green-500/50',
      active: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
      under_review: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
      closed: 'bg-slate-500/20 text-slate-300 border-slate-500/50',
      archived: 'bg-purple-500/20 text-purple-300 border-purple-500/50'
    };
    return colors[status] || colors.open;
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: 'bg-blue-500/20 text-blue-300',
      medium: 'bg-yellow-500/20 text-yellow-300',
      high: 'bg-orange-500/20 text-orange-300',
      critical: 'bg-red-500/20 text-red-300'
    };
    return colors[priority] || colors.medium;
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Investigation Cases</h1>
          <p className="text-slate-400">Manage and track forensic investigation cases</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowStabilizationWizard(true)}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Case (Guided)
          </Button>

          <Button
            onClick={() => setShowWizard(true)}
            className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Forensic Wizard
          </Button>
          
          <Dialog open={isCreating} onOpenChange={setIsCreating}>
            <DialogTrigger asChild>
              <Button
                onClick={() => setIsCreating(true)}
                className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Quick Case
              </Button>
            </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Investigation Case</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              createCaseMutation.mutate(newCase);
            }} className="space-y-4">
              <div className="space-y-2">
                <Label>Case Title *</Label>
                <Input
                  value={newCase.title}
                  onChange={(e) => setNewCase({...newCase, title: e.target.value})}
                  placeholder="Enter case title"
                  className="bg-slate-800 border-slate-700"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={newCase.description}
                  onChange={(e) => setNewCase({...newCase, description: e.target.value})}
                  placeholder="Describe the incident..."
                  className="bg-slate-800 border-slate-700 h-32"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Case Type</Label>
                  <Select value={newCase.case_type} onValueChange={(value) => setNewCase({...newCase, case_type: value})}>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="network_intrusion">Network Intrusion</SelectItem>
                      <SelectItem value="device_compromise">Device Compromise</SelectItem>
                      <SelectItem value="data_breach">Data Breach</SelectItem>
                      <SelectItem value="malware_analysis">Malware Analysis</SelectItem>
                      <SelectItem value="surveillance_detection">Surveillance Detection</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={newCase.priority} onValueChange={(value) => setNewCase({...newCase, priority: value})}>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  type="submit" 
                  disabled={createCaseMutation.isPending || !newCase.title}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  {createCaseMutation.isPending ? 'Creating...' : 'Create Case'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsCreating(false)} className="border-slate-700">
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      
      {/* Stabilization Wizard - Primary Case Creation */}
      <CaseCreationWizard
        open={showStabilizationWizard}
        onClose={() => setShowStabilizationWizard(false)}
        onCreateCase={handleCreateCaseWithStabilization}
      />

      {/* Forensic Wizard Modal */}
      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Forensic Case Wizard</DialogTitle>
            <p className="text-slate-400 text-sm">Complete workflow for court-admissible evidence packages</p>
          </DialogHeader>
          <CaseWizard 
            onComplete={() => setShowWizard(false)}
            onCancel={() => setShowWizard(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search cases..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-slate-800 border-slate-700 text-white"
          />
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
            <SelectValue placeholder="Filter by priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="network_intrusion">Network Intrusion</SelectItem>
            <SelectItem value="device_compromise">Device Compromise</SelectItem>
            <SelectItem value="data_breach">Data Breach</SelectItem>
            <SelectItem value="malware_analysis">Malware Analysis</SelectItem>
            <SelectItem value="surveillance_detection">Surveillance Detection</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cases List */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Cases ({filteredCases.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-400" />
              <p className="text-slate-400">Loading cases...</p>
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-lg text-white mb-2">No cases found</p>
              <p className="text-sm text-slate-400 mb-4">
                {cases.length === 0 ? 'Create your first case to get started' : 'Try adjusting your filters'}
              </p>
              {cases.length > 0 && (
                <Button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterStatus('all');
                    setFilterPriority('all');
                    setFilterType('all');
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCases.map((caseItem) => (
                <Link
                  key={caseItem.id}
                  to={createPageUrl(`CaseDetail/${caseItem.id}`)}
                  className="block"
                >
                  <Card className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-all cursor-pointer">
                    <CardContent className="p-4 md:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 md:gap-4 flex-1 min-w-0">
                          <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5 md:w-6 md:h-6 text-white" />
                          </div>

                          <div className="flex-1 min-w-0">
                           <div className="flex flex-wrap items-center gap-2 mb-2">
                             <h3 className="text-base md:text-lg font-semibold text-white truncate">{safeString(caseItem.title, 'Untitled Case')}</h3>
                             <Badge className={getStatusColor(caseItem.status)}>
                               {formatEnumTitle(caseItem.status, 'Unknown')}
                             </Badge>
                             <Badge className={getPriorityColor(caseItem.priority)}>
                               {formatEnumTitle(caseItem.priority, 'Unknown')}
                             </Badge>
                           </div>

                           <p className="text-sm text-slate-400 mb-3 line-clamp-2">{safeString(caseItem.description, 'No description provided.')}</p>

                           {/* AI Summary - Collapsed View */}
                           <div 
                             onClick={(e) => {
                               e.preventDefault();
                               e.stopPropagation();
                             }}
                           >
                             <AISummary type="case" data={caseItem} />
                           </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 text-xs">
                              <div>
                                <p className="text-slate-500 mb-1">Case Number</p>
                                <p className="text-white font-mono">{safeString(caseItem.case_number, 'N/A')}</p>
                              </div>
                              <div>
                                <p className="text-slate-500 mb-1">Created</p>
                                <p className="text-white flex items-center gap-1">
                                  <CalendarIcon className="w-3 h-3 text-slate-400" />
                                  {DateUtils.safeFormatDate(caseItem.start_date || caseItem.created_date, 'N/A')}
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500 mb-1">Assigned To</p>
                                <p className="text-white truncate">{safeString(caseItem.assigned_investigator, 'Unassigned')}</p>
                              </div>
                              <div>
                                <p className="text-slate-500 mb-1">Evidence</p>
                                <p className="text-white">{caseItem.evidence_count || 0}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          className="bg-blue-600 hover:bg-blue-700 flex-shrink-0"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}