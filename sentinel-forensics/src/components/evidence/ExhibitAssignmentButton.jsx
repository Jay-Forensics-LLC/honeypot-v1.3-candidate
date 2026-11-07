import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ExhibitAssignmentButton({ evidenceId, caseId, variant = 'default' }) {
  const queryClient = useQueryClient();

  const { data: assignment } = useQuery({
    queryKey: ['exhibit-assignment', evidenceId],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('manageExhibits', {
        action: 'get_assignment',
        evidenceId
      });
      return data.assignment;
    },
    enabled: !!evidenceId
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('manageExhibits', {
        action: 'assign_exhibit',
        caseId,
        evidenceId,
        method: 'manual'
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibit-assignment', evidenceId] });
      toast.success('Exhibit number assigned');
    }
  });

  if (assignment) {
    return (
      <Badge className="bg-blue-500/20 text-blue-300 border border-blue-500/50">
        <FileText className="w-3 h-3 mr-1" />
        {assignment.exhibit_number}
      </Badge>
    );
  }

  return (
    <Button
      size="sm"
      variant={variant}
      onClick={() => assignMutation.mutate()}
      disabled={assignMutation.isPending}
      className={variant === 'default' ? 'bg-blue-600 hover:bg-blue-700' : ''}
    >
      {assignMutation.isPending ? (
        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
      ) : (
        <FileText className="w-3 h-3 mr-2" />
      )}
      Assign Exhibit
    </Button>
  );
}