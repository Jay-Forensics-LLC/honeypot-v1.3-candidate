import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useUser } from '../hooks/useUser';
import { CheckCircle2, Circle, Clock, Plus, User, Calendar } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function TeamTaskBoard({ caseId }) {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [newTask, setNewTask] = useState({ title: '', priority: 'medium', assigned_to: '' });

  const { data: tasks = [] } = useQuery({
    queryKey: ['case-tasks', caseId, user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id || !caseId) return [];
      return await base44.entities.CaseTask.filter({
        case_id: caseId,
        organization_id: user.organization_id
      }, '-created_date', 100);
    },
    enabled: !!user?.organization_id && !!caseId,
    refetchInterval: 5000
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.User.filter({ role: 'admin' }, 'full_name', 50);
    },
    enabled: !!user?.organization_id
  });

  const createMutation = useMutation({
    mutationFn: async (taskData) => {
      return await base44.entities.CaseTask.create({
        ...taskData,
        case_id: caseId,
        organization_id: user.organization_id,
        status: 'pending'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-tasks'] });
      setNewTask({ title: '', priority: 'medium', assigned_to: '' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.CaseTask.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-tasks'] });
    }
  });

  const statusGroups = {
    pending: tasks.filter(t => t.status === 'pending'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    completed: tasks.filter(t => t.status === 'completed')
  };

  const priorityColors = {
    low: 'bg-blue-500',
    medium: 'bg-yellow-500',
    high: 'bg-red-500'
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Team Tasks</h3>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white">Create Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Task title"
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <Select
                value={newTask.priority}
                onValueChange={(value) => setNewTask({ ...newTask, priority: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  <SelectItem value="low">Low Priority</SelectItem>
                  <SelectItem value="medium">Medium Priority</SelectItem>
                  <SelectItem value="high">High Priority</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={newTask.assigned_to}
                onValueChange={(value) => setNewTask({ ...newTask, assigned_to: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Assign to..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  {teamMembers.map(member => (
                    <SelectItem key={member.email} value={member.email}>
                      {member.full_name || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => createMutation.mutate(newTask)}
                disabled={!newTask.title || createMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Create Task
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(statusGroups).map(([status, items]) => (
          <Card key={status} className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                {status === 'pending' && <Clock className="w-4 h-4 text-yellow-400" />}
                {status === 'in_progress' && <Circle className="w-4 h-4 text-blue-400" />}
                {status === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                {status.replace('_', ' ')} ({items.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map(task => (
                <Card key={task.id} className="bg-slate-800 border-slate-700">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-medium text-white">{task.title}</h4>
                      <Badge className={`${priorityColors[task.priority]} text-xs`}>
                        {task.priority}
                      </Badge>
                    </div>
                    {task.assigned_to && (
                      <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                        <User className="w-3 h-3" />
                        {task.assigned_to}
                      </div>
                    )}
                    {task.due_date && (
                      <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                        <Calendar className="w-3 h-3" />
                        {new Date(task.due_date).toLocaleDateString()}
                      </div>
                    )}
                    <div className="flex gap-2 mt-2">
                      {status !== 'in_progress' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateMutation.mutate({
                            id: task.id,
                            data: { status: 'in_progress' }
                          })}
                          className="text-xs"
                        >
                          Start
                        </Button>
                      )}
                      {status !== 'completed' && (
                        <Button
                          size="sm"
                          onClick={() => updateMutation.mutate({
                            id: task.id,
                            data: { status: 'completed', completed_date: new Date().toISOString() }
                          })}
                          className="bg-green-600 hover:bg-green-700 text-xs"
                        >
                          Complete
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}