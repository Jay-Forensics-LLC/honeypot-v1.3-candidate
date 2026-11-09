import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, Flag, MessageSquare, CheckCircle, Clock } from 'lucide-react';
import { formatRelativeTime } from '../utils';
import { toast } from 'sonner';

export default function CaseWorkspace({ legalCaseId }) {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [showAnnotationDialog, setShowAnnotationDialog] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [annotationData, setAnnotationData] = useState({
    annotation_type: 'note',
    content: '',
    priority: 'medium'
  });

  const { data: legalCase } = useQuery({
    queryKey: ['legal-case', legalCaseId],
    queryFn: () => base44.entities.LegalCase.filter({ id: legalCaseId }),
    enabled: !!legalCaseId,
    select: (data) => data[0]
  });

  const { data: annotations = [] } = useQuery({
    queryKey: ['evidence-annotations', legalCaseId],
    queryFn: () => base44.entities.EvidenceAnnotation.filter({ legal_case_id: legalCaseId }),
    enabled: !!legalCaseId
  });

  const { data: evidenceItems = [] } = useQuery({
    queryKey: ['case-evidence', legalCase?.forensic_case_ids],
    queryFn: async () => {
      if (!legalCase?.forensic_case_ids?.length) return [];
      const allEvidence = [];
      for (const caseId of legalCase.forensic_case_ids) {
        const evidence = await base44.entities.EvidenceV2.filter({ case_id: caseId });
        allEvidence.push(...evidence);
      }
      return allEvidence;
    },
    enabled: !!legalCase?.forensic_case_ids?.length
  });

  const createAnnotationMutation = useMutation({
    mutationFn: (data) => base44.entities.EvidenceAnnotation.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['evidence-annotations']);
      setShowAnnotationDialog(false);
      setAnnotationData({ annotation_type: 'note', content: '', priority: 'medium' });
      toast.success('Annotation added');
    }
  });

  const updateAnnotationMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EvidenceAnnotation.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['evidence-annotations']);
      toast.success('Annotation updated');
    }
  });

  const handleAnnotate = (evidence) => {
    setSelectedEvidence(evidence);
    setShowAnnotationDialog(true);
  };

  const handleCreateAnnotation = () => {
    if (!annotationData.content.trim()) return;

    createAnnotationMutation.mutate({
      organization_id: user.organization_id,
      legal_case_id: legalCaseId,
      evidence_id: selectedEvidence.id,
      annotator_email: user.email,
      annotator_name: user.full_name || user.email,
      ...annotationData
    });
  };

  const getAnnotationIcon = (type) => {
    switch (type) {
      case 'flag': return <Flag className="w-4 h-4" />;
      case 'note': return <MessageSquare className="w-4 h-4" />;
      case 'analysis_request': return <FileText className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Evidence Workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {evidenceItems.map(evidence => {
              const evidenceAnnotations = annotations.filter(a => a.evidence_id === evidence.id);
              return (
                <div key={evidence.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-white font-medium mb-1">{evidence.evidence_name}</h4>
                      <p className="text-sm text-slate-400 mb-2">{evidence.description}</p>
                      {evidenceAnnotations.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {evidenceAnnotations.map(annotation => (
                            <Badge 
                              key={annotation.id}
                              className={`
                                ${annotation.annotation_type === 'flag' ? 'bg-red-500/20 text-red-300' : ''}
                                ${annotation.annotation_type === 'note' ? 'bg-blue-500/20 text-blue-300' : ''}
                                ${annotation.annotation_type === 'analysis_request' ? 'bg-yellow-500/20 text-yellow-300' : ''}
                              `}
                            >
                              {getAnnotationIcon(annotation.annotation_type)}
                              <span className="ml-1">{annotation.content.substring(0, 30)}...</span>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleAnnotate(evidence)}>
                      Annotate
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Recent Annotations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {annotations.slice(0, 10).map(annotation => (
              <div key={annotation.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getAnnotationIcon(annotation.annotation_type)}
                    <Badge variant={annotation.status === 'resolved' ? 'default' : 'secondary'}>
                      {annotation.status}
                    </Badge>
                    <Badge variant="outline">{annotation.priority}</Badge>
                  </div>
                  {annotation.status === 'open' && (
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => updateAnnotationMutation.mutate({
                        id: annotation.id,
                        data: { 
                          status: 'resolved',
                          resolved_by: user.email,
                          resolved_at: new Date().toISOString()
                        }
                      })}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className="text-slate-300 text-sm mb-1">{annotation.content}</p>
                <p className="text-xs text-slate-500">
                  {annotation.annotator_name} • {formatRelativeTime(annotation.created_date)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAnnotationDialog} onOpenChange={setShowAnnotationDialog}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Add Annotation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-300 mb-2 block">Type</label>
              <select
                value={annotationData.annotation_type}
                onChange={(e) => setAnnotationData({ ...annotationData, annotation_type: e.target.value })}
                className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
              >
                <option value="note">Note</option>
                <option value="flag">Flag for Review</option>
                <option value="analysis_request">Analysis Request</option>
                <option value="legal_hold">Legal Hold</option>
                <option value="disclosure_marker">Disclosure Marker</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-300 mb-2 block">Priority</label>
              <select
                value={annotationData.priority}
                onChange={(e) => setAnnotationData({ ...annotationData, priority: e.target.value })}
                className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <Textarea
              placeholder="Annotation details..."
              value={annotationData.content}
              onChange={(e) => setAnnotationData({ ...annotationData, content: e.target.value })}
              className="bg-slate-800 border-slate-700 text-white h-32"
            />
            <Button onClick={handleCreateAnnotation} disabled={!annotationData.content.trim()}>
              Add Annotation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}