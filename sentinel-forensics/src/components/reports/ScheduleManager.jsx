import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Calendar, Clock, Mail, Plus, Trash } from 'lucide-react';
import { toast } from 'sonner';

/**
 * SCHEDULE MANAGER
 * Create and manage report schedules with timezone support
 */
export default function ScheduleManager({ templateId, templateName }) {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch schedules
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['report-schedules', templateId],
    queryFn: async () => {
      if (!templateId) return [];
      return await base44.entities.ReportSchedule.filter({
        template_id: templateId
      }, '-created_date', 20);
    },
    enabled: !!templateId
  });

  // Create schedule mutation
  const createMutation = useMutation({
    mutationFn: async (scheduleData) => {
      return await base44.entities.ReportSchedule.create({
        ...scheduleData,
        organization_id: user.organization_id,
        template_id: templateId,
        created_by: user.email,
        is_active: true,
        last_run_status: 'pending'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['report-schedules']);
      setDialogOpen(false);
      toast.success('Schedule created');
    }
  });

  // Toggle schedule mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }) => {
      return await base44.entities.ReportSchedule.update(id, { is_active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['report-schedules']);
      toast.success('Schedule updated');
    }
  });

  // Delete schedule mutation
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.ReportSchedule.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['report-schedules']);
      toast.success('Schedule deleted');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const scheduleType = formData.get('schedule_type');
    const scheduleData = {
      schedule_type: scheduleType,
      timezone: formData.get('timezone'),
      delivery_email: formData.get('delivery_email').split(',').map(e => e.trim()),
      delivery_download: formData.get('delivery_download') === 'on',
      filters: {}
    };

    if (scheduleType === 'one_time') {
      scheduleData.scheduled_datetime = formData.get('scheduled_datetime');
    } else {
      scheduleData.recurrence_pattern = {
        frequency: formData.get('frequency'),
        time: formData.get('time')
      };
    }

    createMutation.mutate(scheduleData);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Schedules</h3>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-red-600 hover:bg-red-700">
              <Plus className="w-4 h-4 mr-2" />
              New Schedule
            </Button>
          </DialogTrigger>
          
          <DialogContent className="bg-slate-900 border-slate-800 max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-white">Schedule Report: {templateName}</DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Schedule Type</label>
                <Select name="schedule_type" defaultValue="recurring">
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="one_time">One Time</SelectItem>
                    <SelectItem value="recurring">Recurring</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Frequency</label>
                <Select name="frequency" defaultValue="weekly">
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Time</label>
                <Input
                  type="time"
                  name="time"
                  defaultValue="09:00"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Timezone</label>
                <Select name="timezone" defaultValue="America/New_York">
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="America/New_York">Eastern Time</SelectItem>
                    <SelectItem value="America/Chicago">Central Time</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Email Recipients (comma-separated)</label>
                <Input
                  name="delivery_email"
                  placeholder="user@example.com, team@example.com"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Switch name="delivery_download" />
                <label className="text-sm text-gray-400">Also save to download archive</label>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  className="border-slate-700 text-gray-400"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  className="bg-red-600 hover:bg-red-700"
                  disabled={createMutation.isPending}
                >
                  Create Schedule
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Schedules List */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="py-8 text-center text-gray-400">
            No schedules configured. Create one to automate reports.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {schedules.map((schedule) => (
            <Card key={schedule.id} className="bg-slate-900 border-slate-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={schedule.is_active}
                      onCheckedChange={(checked) => 
                        toggleMutation.mutate({ id: schedule.id, is_active: checked })
                      }
                    />
                    
                    <div>
                      <div className="flex items-center gap-2">
                        {schedule.schedule_type === 'one_time' ? (
                          <Calendar className="w-4 h-4 text-gray-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-gray-500" />
                        )}
                        <span className="text-white font-medium">
                          {schedule.schedule_type === 'one_time' 
                            ? 'One Time' 
                            : schedule.recurrence_pattern?.frequency || 'Recurring'}
                        </span>
                        <Badge variant="outline" className="border-slate-700 text-gray-400">
                          {schedule.timezone}
                        </Badge>
                      </div>
                      
                      {schedule.delivery_email && (
                        <div className="flex items-center gap-1 mt-1 text-sm text-gray-400">
                          <Mail className="w-3 h-3" />
                          {schedule.delivery_email.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(schedule.id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-950"
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}