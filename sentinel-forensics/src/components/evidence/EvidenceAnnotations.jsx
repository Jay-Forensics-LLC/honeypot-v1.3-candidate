import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useUser } from '../hooks/useUser';
import { MessageSquare, Highlighter, Tag, HelpCircle, Check, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function EvidenceAnnotations({ evidenceId, caseId }) {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [newAnnotation, setNewAnnotation] = useState({ type: 'comment', content: '', color: '#FFD700' });

  const { data: annotations = [] } = useQuery({
    queryKey: ['evidence-annotations', evidenceId, user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id || !evidenceId) return [];
      return await base44.entities.EvidenceAnnotation.filter({
        evidence_id: evidenceId,
        organization_id: user.organization_id
      }, '-created_date', 100);
    },
    enabled: !!user?.organization_id && !!evidenceId,
    refetchInterval: 3000
  });

  const createMutation = useMutation({
    mutationFn: async (annotationData) => {
      return await base44.entities.EvidenceAnnotation.create({
        ...annotationData,
        evidence_id: evidenceId,
        case_id: caseId,
        organization_id: user.organization_id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-annotations'] });
      setNewAnnotation({ type: 'comment', content: '', color: '#FFD700' });
    }
  });

  const resolveMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.EvidenceAnnotation.update(id, {
        resolved: true,
        resolved_by: user.email,
        resolved_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-annotations'] });
    }
  });

  const typeIcons = {
    comment: MessageSquare,
    highlight: Highlighter,
    label: Tag,
    question: HelpCircle
  };

  const typeColors = {
    comment: 'bg-blue-600',
    highlight: 'bg-yellow-600',
    label: 'bg-purple-600',
    question: 'bg-orange-600',
    redaction: 'bg-red-600'
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Annotations & Comments
          <Badge variant="outline">{annotations.length}</Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="bg-slate-800 rounded-lg p-4">
          <Select
            value={newAnnotation.type}
            onValueChange={(value) => setNewAnnotation({ ...newAnnotation, type: value })}
          >
            <SelectTrigger className="bg-slate-900 border-slate-700 text-white mb-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              <SelectItem value="comment">Comment</SelectItem>
              <SelectItem value="highlight">Highlight</SelectItem>
              <SelectItem value="label">Label</SelectItem>
              <SelectItem value="question">Question</SelectItem>
            </SelectContent>
          </Select>

          <Textarea
            placeholder="Add your annotation..."
            value={newAnnotation.content}
            onChange={(e) => setNewAnnotation({ ...newAnnotation, content: e.target.value })}
            className="bg-slate-900 border-slate-700 text-white mb-3"
            rows={3}
          />

          <div className="flex gap-2">
            {['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181'].map(color => (
              <button
                key={color}
                onClick={() => setNewAnnotation({ ...newAnnotation, color })}
                className={`w-8 h-8 rounded-full border-2 ${newAnnotation.color === color ? 'border-white' : 'border-slate-700'}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          <Button
            onClick={() => createMutation.mutate(newAnnotation)}
            disabled={!newAnnotation.content || createMutation.isPending}
            className="w-full mt-3 bg-blue-600 hover:bg-blue-700"
          >
            Add Annotation
          </Button>
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {annotations.map((annotation) => {
            const Icon = typeIcons[annotation.annotation_type] || MessageSquare;
            
            return (
              <Card
                key={annotation.id}
                className={`bg-slate-800 border-slate-700 ${annotation.resolved ? 'opacity-50' : ''}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-white" />
                      <Badge className={typeColors[annotation.annotation_type]}>
                        {annotation.annotation_type}
                      </Badge>
                      {annotation.resolved && (
                        <Badge className="bg-green-600">
                          <Check className="w-3 h-3 mr-1" />
                          Resolved
                        </Badge>
                      )}
                    </div>
                    {!annotation.resolved && annotation.created_by === user?.email && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resolveMutation.mutate(annotation.id)}
                        className="text-green-400 hover:text-green-300"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <p className="text-white text-sm mb-2">{annotation.content}</p>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{annotation.created_by}</span>
                    <span>{new Date(annotation.created_date).toLocaleString()}</span>
                  </div>

                  {annotation.color && (
                    <div
                      className="w-full h-1 rounded mt-2"
                      style={{ backgroundColor: annotation.color }}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}