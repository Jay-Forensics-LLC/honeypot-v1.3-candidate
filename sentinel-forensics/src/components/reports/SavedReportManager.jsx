import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus, Calendar, Trash2, Clock } from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';
import { toast } from 'sonner';

export default function SavedReportManager({ caseId, onSelectForSchedule, onEdit }) {
  const queryClient = useQueryClient();

  const { data: definitions = [] } = useQuery({
    queryKey: ['report-definitions', caseId],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('manageReportDefinitions', {
        action: 'list',
        caseId
      });
      return data.definitions || [];
    },
    enabled: !!caseId
  });

  const archiveMutation = useMutation({
    mutationFn: async (definitionId) => {
      await base44.functions.invoke('manageReportDefinitions', {
        action: 'archive',
        definitionId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-definitions', caseId] });
      toast.success('Report definition archived');
    }
  });

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-white">Saved Report Definitions</CardTitle>
          <Button onClick={() => onEdit(null)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            New Definition
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {definitions.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 mb-4">No saved report definitions</p>
            <Button onClick={() => onEdit(null)} className="bg-blue-600 hover:bg-blue-700">
              Create First Definition
            </Button>
          </div>
        ) : (
          definitions.map((def) => (
            <Card key={def.id} className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-blue-400" />
                      <h3 className="text-white font-medium">{def.name}</h3>
                    </div>
                    {def.description && (
                      <p className="text-xs text-slate-400 mb-2">{def.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge className="bg-purple-500/20 text-purple-300">
                        {def.template}
                      </Badge>
                      <span className="text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Created {DateUtils.safeFormatDate(def.created_date)}
                      </span>
                      <span className="text-slate-500">by {def.created_by}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => onSelectForSchedule(def)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      Schedule
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(def)}
                      className="border-slate-700"
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => archiveMutation.mutate(def.id)}
                      className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </CardContent>
    </Card>
  );
}