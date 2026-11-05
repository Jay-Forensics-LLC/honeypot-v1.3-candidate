import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Users, 
  Plus, 
  Trash2, 
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { DateUtils } from "../utils/DateUtils";
import { OfflineQueue } from "../lib/offlineQueue";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const PRIORITY_COLORS = {
  low: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/50' },
  normal: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/50' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/50' },
  urgent: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50' },
  critical: { bg: 'bg-red-600/20', text: 'text-red-500', border: 'border-red-600/50 animate-pulse' },
};

const STATUS_COLORS = {
  pending: { bg: 'bg-slate-500/20', text: 'text-slate-400', icon: Clock },
  in_progress: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: Loader2 },
  completed: { bg: 'bg-green-500/20', text: 'text-green-400', icon: CheckCircle },
  blocked: { bg: 'bg-red-500/20', text: 'text-red-400', icon: AlertCircle },
};

const getInitials = (name) => {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const isOverdue = (dueDate) => {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
};

export default function EvidenceAssignments({ evidenceId, caseId, canAssign = true }) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [newAssignment, setNewAssignment] = useState({
    assigned_to: '',
    task_type: 'analysis',
    priority: 'normal',
    status: 'pending',
    due_date: '',
    description: ''
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  // Fetch assignments
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['evidence-assignments', evidenceId],
    queryFn: async () => {
      const allAssignments = await base44.entities.EvidenceAssignment.list();
      return allAssignments.filter(a => a.evidence_id === evidenceId);
    },
    enabled: !!evidenceId,
    initialData: []
  });

  // Fetch users for assignment
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const allUsers = await base44.entities.User.list();
      return allUsers.map(u => ({
        email: u.email,
        name: u.full_name || u.email,
        role: u.role
      }));
    },
    staleTime: 60000
  });

  // Create assignment mutation
  const createAssignmentMutation = useMutation({
    mutationFn: async (assignmentData) => {
      if (!navigator.onLine) {
        OfflineQueue.enqueue({
          type: 'create',
          entity: 'EvidenceAssignment',
          data: assignmentData
        });
        throw new Error('Offline - queued for later');
      }
      return await base44.entities.EvidenceAssignment.create(assignmentData);
    },
    onMutate: async (newAssignment) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['evidence-assignments', evidenceId] });
      const previous = queryClient.getQueryData(['evidence-assignments', evidenceId]);
      
      const optimisticAssignment = {
        id: `temp-${Date.now()}`,
        ...newAssignment,
        created_date: new Date().toISOString(),
        _optimistic: true
      };
      
      queryClient.setQueryData(['evidence-assignments', evidenceId], (old = []) => 
        [...old, optimisticAssignment]
      );
      
      return { previous };
    },
    onError: (error, newAssignment, context) => {
      queryClient.setQueryData(['evidence-assignments', evidenceId], context.previous);
      
      if (error.message.includes('Offline')) {
        toast.info('Assignment queued - will sync when online');
      } else {
        toast.error('Failed to create assignment');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-assignments', evidenceId] });
      setShowNewDialog(false);
      setNewAssignment({
        assigned_to: '',
        task_type: 'analysis',
        priority: 'normal',
        status: 'pending',
        due_date: '',
        description: ''
      });
      window.sfTrack?.('evidence_assignment_created', {
        evidence_id: evidenceId,
        case_id: caseId
      });
      toast.success('Assignment created!');
    }
  });

  // Update assignment mutation
  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      if (!navigator.onLine) {
        OfflineQueue.enqueue({
          type: 'update',
          entity: 'EvidenceAssignment',
          id,
          data
        });
        throw new Error('Offline - queued for later');
      }
      return await base44.entities.EvidenceAssignment.update(id, data);
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['evidence-assignments', evidenceId] });
      const previous = queryClient.getQueryData(['evidence-assignments', evidenceId]);
      
      queryClient.setQueryData(['evidence-assignments', evidenceId], (old = []) =>
        old.map(assignment => 
          assignment.id === id 
            ? { ...assignment, ...data, _updating: true }
            : assignment
        )
      );
      
      return { previous };
    },
    onError: (error, variables, context) => {
      queryClient.setQueryData(['evidence-assignments', evidenceId], context.previous);
      
      if (error.message.includes('Offline')) {
        toast.info('Update queued - will sync when online');
      } else {
        toast.error('Failed to update assignment');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-assignments', evidenceId] });
      window.sfTrack?.('evidence_assignment_updated', {
        evidence_id: evidenceId
      });
    }
  });

  // Delete assignment mutation
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId) => {
      if (!navigator.onLine) {
        OfflineQueue.enqueue({
          type: 'delete',
          entity: 'EvidenceAssignment',
          id: assignmentId
        });
        throw new Error('Offline - queued for later');
      }
      return await base44.entities.EvidenceAssignment.delete(assignmentId);
    },
    onMutate: async (assignmentId) => {
      await queryClient.cancelQueries({ queryKey: ['evidence-assignments', evidenceId] });
      const previous = queryClient.getQueryData(['evidence-assignments', evidenceId]);
      
      queryClient.setQueryData(['evidence-assignments', evidenceId], (old = []) =>
        old.filter(assignment => assignment.id !== assignmentId)
      );
      
      return { previous };
    },
    onError: (error, variables, context) => {
      queryClient.setQueryData(['evidence-assignments', evidenceId], context.previous);
      
      if (error.message.includes('Offline')) {
        toast.info('Delete queued - will sync when online');
      } else {
        toast.error('Failed to delete assignment');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-assignments', evidenceId] });
      window.sfTrack?.('evidence_assignment_deleted', {
        evidence_id: evidenceId
      });
      toast.success('Assignment deleted');
    }
  });

  // Handle creating assignment
  const handleCreate = async () => {
    if (!newAssignment.assigned_to || !canAssign) return;

    const assignmentData = {
      evidence_id: evidenceId,
      case_id: caseId,
      assigned_to: newAssignment.assigned_to,
      assigned_by: user?.email || 'unknown@example.com',
      task_type: newAssignment.task_type,
      priority: newAssignment.priority,
      status: newAssignment.status,
      due_date: newAssignment.due_date || null,
      description: newAssignment.description,
      completed: false
    };

    try {
      await createAssignmentMutation.mutateAsync(assignmentData);
    } catch (error) {
      // Error handled in mutation
    }
  };

  // Handle status change
  const handleStatusChange = async (assignment, newStatus) => {
    const updateData = {
      status: newStatus,
      completed: newStatus === 'completed',
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null
    };

    try {
      await updateAssignmentMutation.mutateAsync({
        id: assignment.id,
        data: updateData
      });
      toast.success('Status updated!');
    } catch (error) {
      // Error handled in mutation
    }
  };

  // Handle priority change
  const handlePriorityChange = async (assignment, newPriority) => {
    try {
      await updateAssignmentMutation.mutateAsync({
        id: assignment.id,
        data: { priority: newPriority }
      });
      toast.success('Priority updated!');
    } catch (error) {
      // Error handled in mutation
    }
  };

  // Handle delete
  const handleDelete = async (assignmentId) => {
    try {
      await deleteAssignmentMutation.mutateAsync(assignmentId);
    } catch (error) {
      // Error handled in mutation
    }
  };

  // Check if user can modify assignment
  const canModifyAssignment = (assignment) => {
    if (!user) return false;
    return user.email === assignment.assigned_by || 
           user.email === assignment.assigned_to || 
           user.role === 'admin';
  };

  // Get user by email
  const getUserByEmail = (email) => {
    return users.find(u => u.email === email) || { email, name: email, role: 'user' };
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Assignments ({assignments.length})
          </CardTitle>
          {canAssign && (
            <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
              <DialogTrigger asChild>
                <Button 
                  size="sm"
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Assignment
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Assignment</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  {/* User Search */}
                  <div className="space-y-2">
                    <Label>Assign To *</Label>
                    <Popover open={showUserSearch} onOpenChange={setShowUserSearch}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between bg-slate-800 border-slate-700"
                        >
                          {newAssignment.assigned_to
                            ? getUserByEmail(newAssignment.assigned_to).name
                            : "Select user..."}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0 bg-slate-800 border-slate-700">
                        <Command>
                          <CommandInput placeholder="Search users..." className="border-slate-700" />
                          <CommandEmpty>No user found.</CommandEmpty>
                          <CommandList>
                            <CommandGroup>
                              {users.map((u) => (
                                <CommandItem
                                  key={u.email}
                                  onSelect={() => {
                                    setNewAssignment({ ...newAssignment, assigned_to: u.email });
                                    setShowUserSearch(false);
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <Avatar className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600">
                                    <AvatarFallback className="text-white text-xs">
                                      {getInitials(u.name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="text-sm">{u.name}</p>
                                    <p className="text-xs text-slate-400">{u.email}</p>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Task Type */}
                  <div className="space-y-2">
                    <Label>Task Type</Label>
                    <Select 
                      value={newAssignment.task_type} 
                      onValueChange={(value) => setNewAssignment({ ...newAssignment, task_type: value })}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="analysis">Analysis</SelectItem>
                        <SelectItem value="verification">Verification</SelectItem>
                        <SelectItem value="documentation">Documentation</SelectItem>
                        <SelectItem value="review">Review</SelectItem>
                        <SelectItem value="investigation">Investigation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Priority & Status */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select 
                        value={newAssignment.priority} 
                        onValueChange={(value) => setNewAssignment({ ...newAssignment, priority: value })}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Due Date</Label>
                      <Input
                        type="date"
                        value={newAssignment.due_date}
                        onChange={(e) => setNewAssignment({ ...newAssignment, due_date: e.target.value })}
                        className="bg-slate-800 border-slate-700"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={newAssignment.description}
                      onChange={(e) => setNewAssignment({ ...newAssignment, description: e.target.value })}
                      placeholder="Task description..."
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>

                  <Button
                    onClick={handleCreate}
                    disabled={!newAssignment.assigned_to || createAssignmentMutation.isPending}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    {createAssignmentMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Assignment
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Assignments List */}
        <div className="space-y-3">
          {assignments.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-sm">No assignments yet</p>
              {canAssign && (
                <p className="text-xs mt-2">Create an assignment to delegate evidence analysis</p>
              )}
            </div>
          ) : (
            assignments.map((assignment) => {
              const assignedUser = getUserByEmail(assignment.assigned_to);
              const assignedBy = getUserByEmail(assignment.assigned_by);
              const isAssignmentOverdue = isOverdue(assignment.due_date) && assignment.status !== 'completed';
              const StatusIcon = STATUS_COLORS[assignment.status]?.icon || Clock;
              const priorityStyle = PRIORITY_COLORS[assignment.priority] || PRIORITY_COLORS.normal;

              return (
                <div 
                  key={assignment.id}
                  className={`p-4 rounded-lg border transition-all ${
                    assignment._optimistic 
                      ? 'border-blue-500/30 bg-blue-500/5' 
                      : isAssignmentOverdue
                      ? 'border-red-500/50 bg-red-500/10'
                      : 'border-slate-800 bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600">
                      <AvatarFallback className="text-white text-sm">
                        {getInitials(assignedUser.name)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-white">
                          {assignedUser.name}
                        </span>
                        <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
                          {assignment.task_type}
                        </Badge>
                      </div>
                      
                      {assignment.description && (
                        <p className="text-sm text-slate-300 mb-2">{assignment.description}</p>
                      )}
                      
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {/* Priority */}
                        <Select
                          value={assignment.priority}
                          onValueChange={(value) => handlePriorityChange(assignment, value)}
                          disabled={!canModifyAssignment(assignment)}
                        >
                          <SelectTrigger 
                            className={`h-6 text-xs w-24 ${priorityStyle.bg} ${priorityStyle.text} border ${priorityStyle.border}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Status */}
                        <Select
                          value={assignment.status}
                          onValueChange={(value) => handleStatusChange(assignment, value)}
                          disabled={!canModifyAssignment(assignment)}
                        >
                          <SelectTrigger 
                            className={`h-6 text-xs w-32 ${STATUS_COLORS[assignment.status]?.bg} ${STATUS_COLORS[assignment.status]?.text} border-slate-700`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="blocked">Blocked</SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Due Date */}
                        {assignment.due_date && (
                          <Badge 
                            variant="outline" 
                            className={`flex items-center gap-1 ${
                              isAssignmentOverdue ? 'border-red-500/50 text-red-400 animate-pulse' : 'border-slate-600 text-slate-400'
                            }`}
                          >
                            <Calendar className="w-3 h-3" />
                            Due: {DateUtils.safeFormatDate(assignment.due_date)}
                            {isAssignmentOverdue && <AlertCircle className="w-3 h-3 ml-1" />}
                          </Badge>
                        )}

                        <span className="text-slate-500">
                          by {assignedBy.name}
                        </span>

                        {assignment._optimistic && (
                          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                        )}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    {canModifyAssignment(assignment) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(assignment.id)}
                        className="h-8 w-8 hover:bg-red-500/20"
                        aria-label="Delete assignment"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}