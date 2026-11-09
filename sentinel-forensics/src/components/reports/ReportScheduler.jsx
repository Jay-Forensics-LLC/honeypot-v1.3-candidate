import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ReportScheduler({ definition, versionId, open, onClose }) {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState({
    schedule_name: '',
    schedule_type: 'recurring',
    frequency: 'weekly',
    scheduled_time: '',
    delivery_channels: ['in_app'],
    email_recipients: ''
  });

  const createScheduleMutation = useMutation({
    mutationFn: async (scheduleConfig) => {
      // Create Base44 scheduled task
      const taskConfig = {
        name: scheduleConfig.schedule_name,
        function_name: 'executeScheduledReport',
        function_args: {
          scheduleId: 'pending', // Will be updated after schedule creation
          manualTrigger: false
        },
        schedule_mode: scheduleConfig.schedule_type === 'one_time' ? 'one-time' : 'recurring',
        is_active: true
      };

      if (scheduleConfig.schedule_type === 'one_time') {
        taskConfig.one_time_date = scheduleConfig.scheduled_time;
      } else {
        taskConfig.schedule_type = 'simple';
        taskConfig.repeat_interval = 1;
        taskConfig.repeat_unit = scheduleConfig.frequency === 'daily' ? 'days' :
                                  scheduleConfig.frequency === 'weekly' ? 'weeks' : 'months';
        taskConfig.start_time = new Date(scheduleConfig.scheduled_time).toTimeString().slice(0, 5);
      }

      const task = await base44.asServiceRole.scheduledTasks.create(taskConfig);

      // Create schedule record
      const schedule = await base44.entities.ReportSchedule.create({
        organization_id: definition.organization_id,
        definition_id: definition.id,
        definition_version_id: versionId,
        schedule_name: scheduleConfig.schedule_name,
        schedule_type: scheduleConfig.schedule_type,
        frequency: scheduleConfig.frequency,
        scheduled_time: scheduleConfig.scheduled_time,
        delivery_channels: scheduleConfig.delivery_channels,
        email_recipients: scheduleConfig.email_recipients
          .split(',')
          .map(e => e.trim())
          .filter(e => e),
        is_enabled: true,
        task_id: task.id,
        created_by: (await base44.auth.me()).email
      });

      // Update task with schedule ID
      await base44.asServiceRole.scheduledTasks.update(task.id, {
        function_args: {
          scheduleId: schedule.id,
          manualTrigger: false
        }
      });

      return schedule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
      toast.success('Report scheduled successfully');
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to create schedule', {
        description: error.message
      });
    }
  });

  const handleSubmit = () => {
    if (!config.schedule_name.trim()) {
      toast.error('Please provide a schedule name');
      return;
    }

    if (!config.scheduled_time) {
      toast.error('Please select a date/time');
      return;
    }

    if (config.delivery_channels.includes('email') && !config.email_recipients.trim()) {
      toast.error('Please provide email recipients');
      return;
    }

    createScheduleMutation.mutate(config);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            Schedule Report: {definition?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-slate-300">Schedule Name *</Label>
            <Input
              value={config.schedule_name}
              onChange={(e) => setConfig({ ...config, schedule_name: e.target.value })}
              placeholder="e.g., Weekly Security Report"
              className="bg-slate-800 border-slate-700 text-white mt-1"
            />
          </div>

          <div>
            <Label className="text-slate-300">Schedule Type *</Label>
            <Select
              value={config.schedule_type}
              onValueChange={(value) => setConfig({ ...config, schedule_type: value })}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">One-Time</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {config.schedule_type === 'recurring' && (
            <div>
              <Label className="text-slate-300">Frequency *</Label>
              <Select
                value={config.frequency}
                onValueChange={(value) => setConfig({ ...config, frequency: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-slate-300">
              {config.schedule_type === 'one_time' ? 'Run Date/Time' : 'Start Date/Time'} *
            </Label>
            <Input
              type="datetime-local"
              value={config.scheduled_time}
              onChange={(e) => setConfig({ ...config, scheduled_time: e.target.value })}
              className="bg-slate-800 border-slate-700 text-white mt-1"
            />
          </div>

          <div>
            <Label className="text-slate-300">Delivery Channels *</Label>
            <div className="space-y-2 mt-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={config.delivery_channels.includes('in_app')}
                  onCheckedChange={(checked) => {
                    setConfig({
                      ...config,
                      delivery_channels: checked
                        ? [...config.delivery_channels, 'in_app']
                        : config.delivery_channels.filter(c => c !== 'in_app')
                    });
                  }}
                />
                <span className="text-sm text-white">In-App (Download Center)</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={config.delivery_channels.includes('email')}
                  onCheckedChange={(checked) => {
                    setConfig({
                      ...config,
                      delivery_channels: checked
                        ? [...config.delivery_channels, 'email']
                        : config.delivery_channels.filter(c => c !== 'email')
                    });
                  }}
                />
                <span className="text-sm text-white">Email Notification</span>
              </div>
            </div>
          </div>

          {config.delivery_channels.includes('email') && (
            <div>
              <Label className="text-slate-300">Email Recipients (comma-separated) *</Label>
              <Input
                value={config.email_recipients}
                onChange={(e) => setConfig({ ...config, email_recipients: e.target.value })}
                placeholder="user1@example.com, user2@example.com"
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">
                Recipients must have access to this case. RBAC checks enforced on delivery.
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-slate-700">
            <Button
              onClick={handleSubmit}
              disabled={createScheduleMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {createScheduleMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Schedule...
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4 mr-2" />
                  Create Schedule
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}