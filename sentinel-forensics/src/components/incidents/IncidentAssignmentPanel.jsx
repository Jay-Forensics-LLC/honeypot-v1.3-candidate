import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Users, UserPlus, X, Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { sendIncidentNotification } from '@/functions/sendIncidentNotification';

export default function IncidentAssignmentPanel({ incidentId, incidentType }) {
  const [assignEmail, setAssignEmail] = useState('');
  const [assignRole, setAssignRole] = useState('investigator');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['incident-assignments', incidentId],
    queryFn: async () => {
      // SECURITY FIX: Validate organization access
      if (!user?.organization_id) return [];
      
      return await base44.entities.IncidentAssignment.filter(
        { 
          incident_id: incidentId, 
          incident_type: incidentType, 
          organization_id: user.organization_id,
          status: 'active' 
        },
        '-created_date',
        50
      );
    },
    enabled: !!incidentId && !!user?.organization_id
  });

  const assignMutation = useMutation({
    mutationFn: async ({ email, role }) => {
      // SECURITY FIX: Add organization_id
      const assignment = await base44.entities.IncidentAssignment.create({
        incident_id: incidentId,
        incident_type: incidentType,
        organization_id: user?.organization_id,
        assigned_to_email: email,
        assigned_to_name: email.split('@')[0],
        assigned_by_email: user?.email,
        assigned_by_name: user?.full_name || user?.email,
        role,
        status: 'active'
      });

      // Send notification
      await sendIncidentNotification({
        incident_id: incidentId,
        incident_type: incidentType,
        assigned_to_email: email,
        message: `You have been assigned as ${role} for this ${incidentType}`,
        notification_type: 'Assignment'
      });

      return assignment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['incident-assignments', incidentId]);
      setAssignEmail('');
      toast.success('Team member assigned and notified');
    },
    onError: (error) => {
      toast.error('Failed to assign: ' + error.message);
    }
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId) => {
      return await base44.entities.IncidentAssignment.update(assignmentId, {
        status: 'removed'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['incident-assignments', incidentId]);
      toast.success('Assignment removed');
    }
  });

  const handleAssign = (e) => {
    e.preventDefault();
    if (!assignEmail.trim()) return;
    assignMutation.mutate({ email: assignEmail.trim(), role: assignRole });
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'lead': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'investigator': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'analyst': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'observer': return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Users className="w-5 h-5 text-purple-500" />
          Team Assignments
          <Badge variant="outline" className="ml-auto">
            {assignments.length} assigned
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleAssign} className="flex gap-2">
          <Input
            type="email"
            value={assignEmail}
            onChange={(e) => setAssignEmail(e.target.value)}
            placeholder="Team member email..."
            className="flex-1 bg-slate-800 border-slate-700 text-white"
            disabled={assignMutation.isPending}
          />
          <Select value={assignRole} onValueChange={setAssignRole}>
            <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="investigator">Investigator</SelectItem>
              <SelectItem value="analyst">Analyst</SelectItem>
              <SelectItem value="observer">Observer</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="submit"
            disabled={!assignEmail.trim() || assignMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {assignMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
          </Button>
        </form>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Users className="w-12 h-12 mx-auto mb-2" />
            <p className="text-sm">No team members assigned yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                    <Users className="w-4 h-4 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {assignment.assigned_to_name || assignment.assigned_to_email}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Mail className="w-3 h-3" />
                      {assignment.assigned_to_email}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getRoleBadgeColor(assignment.role)}>
                    {assignment.role}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeAssignmentMutation.mutate(assignment.id)}
                    disabled={removeAssignmentMutation.isPending}
                    className="text-red-400 hover:text-red-300 hover:bg-red-950/20"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}