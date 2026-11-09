import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  CheckSquare, Plus, Trash2, Clock, AlertCircle, CheckCircle, 
  Loader2, Calendar, User 
} from 'lucide-react';
import { toast } from 'sonner';
import { DateUtils } from '../utils/DateUtils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

/**
 * CASE TASK BOARD
 * Task management with auto-logging to activity feed
 * 
 * AUDIT COMPLIANCE:
 * - All status changes logged
 * - Assignment changes logged
 * - Full traceability
 */
export default function CaseTaskBoard({ caseId }) {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    assigned_to: '',
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['case-tasks', caseId],
    queryFn: async () => {
      const results = await base44.entities.CaseTask.filter({ case_id: caseId });
      return results.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    },
    enabled: !!caseId,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['case-members', caseId],
    queryFn: () => base44.entities.CaseMember.filter({ case_id: caseId }),
    enabled: !!caseId,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskData) => {
      if (!taskData.title.trim()) {
        throw new Error('Task title is required');
      }

      const assignedMember = taskData.assigned_to ? 
        members.find(m => m.user_email === taskData.assigned_to) : null;

      const task = await base44.entities.CaseTask.create({
        organization_id: user.organization_id,
        case_id: caseId,
        title: taskData.title.trim(),
        description: taskData.description,
        priority: taskData.priority,
        assigned_to: taskData.assigned_to || null,
        assigned_to_name: assignedMember?.user_name || null,
        created_by: user.email,
        status: 'open',
      });

      // Log activity
      await base44.entities.CaseActivity.create({
        organization_id: user.organization_id,
        case_id: caseId,
        user_email: user.email,
        user_name: user.full_name,
        type: 'task_update',
        content: `Created task: ${taskData.title}`,
        metadata: { task_id: task.id, action: 'created' },
      });

      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-tasks', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-activity', caseId] });
      setShowCreateDialog(false);
      setNewTask({ title: '', description: '', priority: 'medium', assigned_to: '' });
      toast.success('Task created');
    },
    onError: (error) => {
      toast.error('Failed to create task: ' + error.message);
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ taskId, newStatus }) => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const updateData = { status: newStatus };
      if (newStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      await base44.entities.CaseTask.update(taskId, updateData);

      // Log activity
      await base44.entities.CaseActivity.create({
        organization_id: user.organization_id,
        case_id: caseId,
        user_email: user.email,
        user_name: user.full_name,
        type: 'task_update',
        content: `Changed task "${task.title}" status: ${task.status} → ${newStatus}`,
        metadata: { 
          task_id: taskId, 
          old_status: task.status, 
          new_status: newStatus 
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-tasks', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-activity', caseId] });
      toast.success('Task updated');
    },
    onError: () => {
      toast.error('Failed to update task');
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId) => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      await base44.entities.CaseTask.delete(taskId);

      // Log activity
      await base44.entities.CaseActivity.create({
        organization_id: user.organization_id,
        case_id: caseId,
        user_email: user.email,
        user_name: user.full_name,
        type: 'task_update',
        content: `Deleted task: ${task.title}`,
        metadata: { task_id: taskId, action: 'deleted' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-tasks', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-activity', caseId] });
      toast.success('Task deleted');
    },
    onError: () => {
      toast.error('Failed to delete task');
    },
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-blue-400" />;
      case 'blocked':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <CheckSquare className="w-4 h-4 text-slate-400" />;
    }
  };

  const getPriorityBadge = (priority) => {
    const colors = {
      high: 'bg-red-500/20 text-red-300 border-red-500/50',
      medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
      low: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
    };
    return colors[priority] || colors.medium;
  };

  const groupedTasks = {
    open: tasks.filter(t => t.status === 'open'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    blocked: tasks.filter(t => t.status === 'blocked'),
    completed: tasks.filter(t => t.status === 'completed'),
  };

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-blue-400" />
              Case Tasks ({tasks.length})
            </CardTitle>
            <Button
              onClick={() => setShowCreateDialog(true)}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Task
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="text-center py-8">
              <CheckSquare className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400">No tasks yet</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-4 gap-4">
              {Object.entries(groupedTasks).map(([status, statusTasks]) => (
                <div key={status} className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
                    {status.replace('_', ' ')} ({statusTasks.length})
                  </h4>
                  <div className="space-y-2">
                    {statusTasks.map((task) => (
                      <Card key={task.id} className="bg-slate-800/50 border-slate-700">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h5 className="text-white font-medium text-sm flex-1">
                              {task.title}
                            </h5>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteTaskMutation.mutate(task.id)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-6 w-6 p-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                          {task.description && (
                            <p className="text-xs text-slate-400 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={getPriorityBadge(task.priority)}>
                              {task.priority}
                            </Badge>
                            {task.assigned_to_name && (
                              <Badge variant="outline" className="text-xs">
                                <User className="w-3 h-3 mr-1" />
                                {task.assigned_to_name}
                              </Badge>
                            )}
                          </div>
                          <Select
                            value={task.status}
                            onValueChange={(newStatus) =>
                              updateTaskStatusMutation.mutate({ 
                                taskId: task.id, 
                                newStatus 
                              })
                            }
                          >
                            <SelectTrigger className="w-full h-8 text-xs bg-slate-700 border-slate-600">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="blocked">Blocked</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Task Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Title</label>
              <Input
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="Task title"
                className="bg-slate-800 border-slate-700"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Description</label>
              <Textarea
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Task description (optional)"
                className="bg-slate-800 border-slate-700 min-h-[80px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-slate-300">Priority</label>
                <Select 
                  value={newTask.priority} 
                  onValueChange={(v) => setNewTask({ ...newTask, priority: v })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-slate-300">Assign To</label>
                <Select 
                  value={newTask.assigned_to} 
                  onValueChange={(v) => setNewTask({ ...newTask, assigned_to: v })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Unassigned</SelectItem>
                    {members.map(m => (
                      <SelectItem key={m.user_email} value={m.user_email}>
                        {m.user_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="border-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createTaskMutation.mutate(newTask)}
              disabled={!newTask.title.trim() || createTaskMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createTaskMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}