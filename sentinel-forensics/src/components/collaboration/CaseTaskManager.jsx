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
import { CheckCircle, Clock, AlertCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function CaseTaskManager({ legalCaseId }) {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [taskData, setTaskData] = useState({
    title: '',
    description: '',
    task_type: 'analysis',
    priority: 'medium',
    assigned_to: '',
    due_date: ''
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['case-tasks', legalCaseId],
    queryFn: () => base44.entities.CaseTask.filter({ legal_case_id: legalCaseId }),
    enabled: !!legalCaseId
  });

  const createTaskMutation = useMutation({
    mutationFn: (data) => base44.entities.CaseTask.create({
      ...data,
      organization_id: user.organization_id,
      legal_case_id: legalCaseId
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['case-tasks']);
      setShowCreateDialog(false);
      setTaskData({ title: '', description: '', task_type: 'analysis', priority: 'medium', assigned_to: '', due_date: '' });
      toast.success('Task created');
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CaseTask.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['case-tasks']);
      toast.success('Task updated');
    }
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'in_progress': return <Clock className="w-4 h-4 text-blue-400" />;
      case 'blocked': return <AlertCircle className="w-4 h-4 text-red-400" />;
      default: return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white">Case Tasks</CardTitle>
          <Button onClick={() => setShowCreateDialog(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {tasks.map(task => (
            <div key={task.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusIcon(task.status)}
                    <h4 className="text-white font-medium">{task.title}</h4>
                  </div>
                  <p className="text-sm text-slate-400 mb-2">{task.description}</p>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline">{task.task_type.replace(/_/g, ' ')}</Badge>
                    <Badge variant={task.priority === 'urgent' ? 'destructive' : 'secondary'}>
                      {task.priority}
                    </Badge>
                    {task.assigned_to && (
                      <Badge className="bg-blue-500/20 text-blue-300">{task.assigned_to}</Badge>
                    )}
                  </div>
                </div>
                {task.status !== 'completed' && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => updateTaskMutation.mutate({
                      id: task.id,
                      data: { status: 'completed', completed_at: new Date().toISOString() }
                    })}
                  >
                    Complete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Task title"
              value={taskData.title}
              onChange={(e) => setTaskData({ ...taskData, title: e.target.value })}
              className="bg-slate-800 border-slate-700 text-white"
            />
            <Textarea
              placeholder="Description"
              value={taskData.description}
              onChange={(e) => setTaskData({ ...taskData, description: e.target.value })}
              className="bg-slate-800 border-slate-700 text-white"
            />
            <select
              value={taskData.task_type}
              onChange={(e) => setTaskData({ ...taskData, task_type: e.target.value })}
              className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
            >
              <option value="analysis">Analysis</option>
              <option value="disclosure">Disclosure</option>
              <option value="motion">Motion</option>
              <option value="evidence_review">Evidence Review</option>
              <option value="client_communication">Client Communication</option>
              <option value="deadline">Deadline</option>
            </select>
            <Input
              placeholder="Assigned to (email)"
              value={taskData.assigned_to}
              onChange={(e) => setTaskData({ ...taskData, assigned_to: e.target.value })}
              className="bg-slate-800 border-slate-700 text-white"
            />
            <Input
              type="datetime-local"
              value={taskData.due_date}
              onChange={(e) => setTaskData({ ...taskData, due_date: e.target.value })}
              className="bg-slate-800 border-slate-700 text-white"
            />
            <Button onClick={() => createTaskMutation.mutate(taskData)} disabled={!taskData.title}>
              Create Task
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}