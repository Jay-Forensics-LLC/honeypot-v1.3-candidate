import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  MessageSquare, 
  CheckCircle,
  Clock,
  Send
} from "lucide-react";
import { format } from "date-fns";

export default function TeamCollaboration({ caseId }) {
  const [newComment, setNewComment] = useState("");
  const [newTask, setNewTask] = useState({ title: "", assigned_to: "" });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: caseData } = useQuery({
    queryKey: ['case', caseId],
    queryFn: async () => {
      const cases = await base44.entities.Case.filter({ id: caseId });
      return cases[0];
    },
    enabled: !!caseId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['case-comments', caseId],
    queryFn: async () => {
      // Would fetch from a CaseComment entity
      return [];
    },
    enabled: !!caseId,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['case-tasks', caseId],
    queryFn: async () => {
      // Would fetch from a CaseTask entity
      return [];
    },
    enabled: !!caseId,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (comment) => {
      // Would create in CaseComment entity
      return { id: Date.now(), ...comment };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-comments', caseId] });
      setNewComment("");
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: async (task) => {
      // Would create in CaseTask entity
      return { id: Date.now(), ...task };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-tasks', caseId] });
      setNewTask({ title: "", assigned_to: "" });
    },
  });

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    
    addCommentMutation.mutate({
      case_id: caseId,
      user_email: user?.email,
      user_name: user?.full_name,
      content: newComment,
      timestamp: new Date().toISOString()
    });
  };

  return (
    <div className="space-y-6">
      {/* Team Members */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Team Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                {user?.full_name?.charAt(0) || 'U'}
              </div>
              <div>
                <p className="text-white text-sm font-medium">{user?.full_name}</p>
                <p className="text-xs text-slate-400">Lead Investigator</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comments/Activity Feed */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-400" />
            Case Comments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No comments yet</p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="flex gap-3 p-3 bg-slate-800/50 rounded-lg">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {comment.user_name?.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium text-sm">{comment.user_name}</span>
                      <span className="text-xs text-slate-500">
                        {format(new Date(comment.timestamp), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <p className="text-slate-300 text-sm">{comment.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <Input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="bg-slate-800 border-slate-700 text-white"
              onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
            />
            <Button
              onClick={handleAddComment}
              disabled={!newComment.trim() || addCommentMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tasks */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-purple-400" />
            Case Tasks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No tasks assigned</p>
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {task.completed ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <Clock className="w-5 h-5 text-yellow-400" />
                    )}
                    <div>
                      <p className={`text-white ${task.completed ? 'line-through' : ''}`}>
                        {task.title}
                      </p>
                      <p className="text-xs text-slate-400">Assigned to: {task.assigned_to}</p>
                    </div>
                  </div>
                  <Badge className={task.completed ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}>
                    {task.completed ? 'Complete' : 'Pending'}
                  </Badge>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            <Input
              value={newTask.title}
              onChange={(e) => setNewTask({...newTask, title: e.target.value})}
              placeholder="Task title..."
              className="bg-slate-800 border-slate-700 text-white"
            />
            <Input
              value={newTask.assigned_to}
              onChange={(e) => setNewTask({...newTask, assigned_to: e.target.value})}
              placeholder="Assign to (email)..."
              className="bg-slate-800 border-slate-700 text-white"
            />
            <Button
              onClick={() => addTaskMutation.mutate(newTask)}
              disabled={!newTask.title || !newTask.assigned_to || addTaskMutation.isPending}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              Add Task
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}