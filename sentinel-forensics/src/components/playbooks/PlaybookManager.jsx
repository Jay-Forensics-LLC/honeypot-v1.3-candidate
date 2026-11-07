import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Play, BookOpen, Target, CheckCircle, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function PlaybookManager({ caseId }) {
  const [selectedPlaybook, setSelectedPlaybook] = useState(null);
  const queryClient = useQueryClient();

  const { data: playbooks = [] } = useQuery({
    queryKey: ['playbooks'],
    queryFn: () => base44.entities.IncidentPlaybook.filter({ is_active: true })
  });

  const executeMutation = useMutation({
    mutationFn: (playbookId) => base44.functions.invoke('executePlaybook', {
      playbook_id: playbookId,
      case_id: caseId,
      is_drill: false
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-tasks', caseId] });
      toast.success('Playbook executed - tasks created');
      setSelectedPlaybook(null);
    },
    onError: () => {
      toast.error('Playbook execution failed');
    }
  });

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-orange-400" />
          Incident Response Playbooks
        </CardTitle>
      </CardHeader>

      <CardContent>
        {playbooks.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">No playbooks configured</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {playbooks.map(playbook => (
              <Card key={playbook.id} className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-white font-semibold mb-1">{playbook.name}</h3>
                      <Badge className="bg-orange-500/20 text-orange-300">
                        {playbook.incident_type.replace('_', ' ')}
                      </Badge>
                    </div>
                    <Button
                      onClick={() => setSelectedPlaybook(playbook)}
                      size="sm"
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      <Play className="w-3 h-3 mr-1" />
                      Execute
                    </Button>
                  </div>
                  <p className="text-sm text-slate-400 mb-3">{playbook.description}</p>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>{playbook.steps?.length || 0} steps</span>
                    {playbook.success_rate && (
                      <span className="text-green-400">{playbook.success_rate}% success rate</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Execution Dialog */}
        <Dialog open={!!selectedPlaybook} onOpenChange={() => setSelectedPlaybook(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle>Execute Playbook: {selectedPlaybook?.name}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-sm text-yellow-200">
                  <strong>This will:</strong>
                </p>
                <ul className="text-sm text-yellow-200 mt-2 space-y-1 ml-4">
                  <li>• Execute automated containment steps</li>
                  <li>• Create tasks for manual steps</li>
                  <li>• Log all actions in chain of custody</li>
                  <li>• Assign tasks to designated roles</li>
                </ul>
              </div>

              {selectedPlaybook?.steps && (
                <div>
                  <h4 className="text-white font-semibold mb-2">Steps Preview:</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedPlaybook.steps.slice(0, 5).map((step, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-300">{step.title}</span>
                        <Badge className="text-xs bg-slate-700 text-slate-300">
                          {step.action_type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setSelectedPlaybook(null)}
                  variant="outline"
                  className="border-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => executeMutation.mutate(selectedPlaybook.id)}
                  disabled={executeMutation.isPending}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {executeMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Execute Now
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}