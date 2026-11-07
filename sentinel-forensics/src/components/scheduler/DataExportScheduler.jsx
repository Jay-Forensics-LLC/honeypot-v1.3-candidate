import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  Play,
  Pause,
  Plus,
  Trash2,
  FileText
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function DataExportScheduler() {
  const [newSchedule, setNewSchedule] = useState({
    name: '',
    export_type: 'csv',
    data_source: 'sessions',
    frequency: 'daily',
    time: '00:00',
    enabled: true
  });
  const [showAddDialog, setShowAddDialog] = useState(false);

  const queryClient = useQueryClient();

  // Mock schedules (in production, store in user preferences)
  const [schedules, setSchedules] = useState(() => {
    const saved = localStorage.getItem('export_schedules');
    return saved ? JSON.parse(saved) : [];
  });

  const saveSchedules = (newSchedules) => {
    setSchedules(newSchedules);
    localStorage.setItem('export_schedules', JSON.stringify(newSchedules));
  };

  const addSchedule = () => {
    if (!newSchedule.name) {
      toast.error('Enter schedule name');
      return;
    }

    const schedule = {
      id: `sched-${Date.now()}`,
      ...newSchedule,
      created_at: new Date().toISOString(),
      last_run: null,
      next_run: calculateNextRun(newSchedule.frequency, newSchedule.time),
      run_count: 0
    };

    saveSchedules([...schedules, schedule]);
    setShowAddDialog(false);
    setNewSchedule({
      name: '',
      export_type: 'csv',
      data_source: 'sessions',
      frequency: 'daily',
      time: '00:00',
      enabled: true
    });

    toast.success('Export schedule created');
  };

  const toggleSchedule = (scheduleId) => {
    const updated = schedules.map(s => 
      s.id === scheduleId ? { ...s, enabled: !s.enabled } : s
    );
    saveSchedules(updated);
    toast.success('Schedule updated');
  };

  const deleteSchedule = (scheduleId) => {
    saveSchedules(schedules.filter(s => s.id !== scheduleId));
    toast.success('Schedule deleted');
  };

  const runScheduleNow = async (schedule) => {
    toast.info(`Running export: ${schedule.name}...`);
    
    try {
      // Fetch data based on source
      let data = [];
      switch (schedule.data_source) {
        case 'sessions':
          data = await base44.entities.ScanSession.list();
          break;
        case 'observations':
          data = await base44.entities.Observation.list('-timestamp', 500);
          break;
        case 'cases':
          data = await base44.entities.Case.list();
          break;
        case 'evidence':
          data = await base44.entities.Evidence.list();
          break;
        case 'alerts':
          data = await base44.entities.Alert.list();
          break;
      }

      // Export based on type
      if (schedule.export_type === 'csv') {
        exportCSV(data, schedule.data_source);
      } else if (schedule.export_type === 'json') {
        exportJSON(data, schedule.data_source);
      }

      // Update schedule
      const updated = schedules.map(s => 
        s.id === schedule.id 
          ? { 
              ...s, 
              last_run: new Date().toISOString(),
              next_run: calculateNextRun(s.frequency, s.time),
              run_count: s.run_count + 1
            } 
          : s
      );
      saveSchedules(updated);

      toast.success(`Export complete: ${data.length} records`);
    } catch (error) {
      toast.error(`Export failed: ${error.message}`);
    }
  };

  const exportCSV = (data, source) => {
    if (data.length === 0) {
      toast.warning('No data to export');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => JSON.stringify(row[h] || '')).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${source}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportJSON = (data, source) => {
    if (data.length === 0) {
      toast.warning('No data to export');
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${source}-${format(new Date(), 'yyyy-MM-dd')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const calculateNextRun = (frequency, time) => {
    const now = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    
    let nextRun = new Date(now);
    nextRun.setHours(hours, minutes, 0, 0);

    if (frequency === 'daily') {
      if (nextRun < now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
    } else if (frequency === 'weekly') {
      nextRun.setDate(nextRun.getDate() + 7);
    } else if (frequency === 'monthly') {
      nextRun.setMonth(nextRun.getMonth() + 1);
    }

    return nextRun.toISOString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Export Scheduler</h2>
          <p className="text-slate-400">Automate data exports on schedule</p>
        </div>
        <Button 
          onClick={() => setShowAddDialog(!showAddDialog)}
          className="bg-gradient-to-r from-blue-600 to-purple-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Schedule
        </Button>
      </div>

      {/* Add Schedule Form */}
      {showAddDialog && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle>Create Export Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Schedule Name</Label>
                <Input
                  value={newSchedule.name}
                  onChange={(e) => setNewSchedule({...newSchedule, name: e.target.value})}
                  placeholder="Daily sessions export"
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="space-y-2">
                <Label>Export Format</Label>
                <Select value={newSchedule.export_type} onValueChange={(value) => setNewSchedule({...newSchedule, export_type: value})}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Data Source</Label>
                <Select value={newSchedule.data_source} onValueChange={(value) => setNewSchedule({...newSchedule, data_source: value})}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sessions">Scan Sessions</SelectItem>
                    <SelectItem value="observations">Observations</SelectItem>
                    <SelectItem value="cases">Cases</SelectItem>
                    <SelectItem value="evidence">Evidence</SelectItem>
                    <SelectItem value="alerts">Alerts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={newSchedule.frequency} onValueChange={(value) => setNewSchedule({...newSchedule, frequency: value})}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={newSchedule.time}
                  onChange={(e) => setNewSchedule({...newSchedule, time: e.target.value})}
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={newSchedule.enabled}
                  onCheckedChange={(checked) => setNewSchedule({...newSchedule, enabled: checked})}
                />
                <Label>Enabled</Label>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={addSchedule} className="bg-blue-600 hover:bg-blue-700">
                Create Schedule
              </Button>
              <Button variant="outline" onClick={() => setShowAddDialog(false)} className="border-slate-700">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schedules List */}
      {schedules.length === 0 ? (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-12 text-center">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400 mb-2">No export schedules configured</p>
            <p className="text-sm text-slate-500">Create a schedule to automate data exports</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {schedules.map(schedule => (
            <Card key={schedule.id} className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-colors">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{schedule.name}</h3>
                      <Badge className={schedule.enabled ? "bg-green-500" : "bg-slate-600"}>
                        {schedule.enabled ? 'Active' : 'Paused'}
                      </Badge>
                      <Badge variant="outline">{schedule.export_type.toUpperCase()}</Badge>
                    </div>

                    <div className="grid md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 mb-1">Data Source</p>
                        <p className="text-white capitalize">{schedule.data_source}</p>
                      </div>

                      <div>
                        <p className="text-slate-500 mb-1">Frequency</p>
                        <p className="text-white capitalize">{schedule.frequency} at {schedule.time}</p>
                      </div>

                      <div>
                        <p className="text-slate-500 mb-1">Last Run</p>
                        <p className="text-white">
                          {schedule.last_run ? format(new Date(schedule.last_run), 'MMM d, HH:mm') : 'Never'}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-500 mb-1">Next Run</p>
                        <p className="text-white">
                          {format(new Date(schedule.next_run), 'MMM d, HH:mm')}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                      <FileText className="w-3 h-3" />
                      Run {schedule.run_count} times
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <Button
                      size="sm"
                      onClick={() => runScheduleNow(schedule)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Run Now
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleSchedule(schedule.id)}
                      className="border-yellow-500 text-yellow-400"
                    >
                      {schedule.enabled ? (
                        <>
                          <Pause className="w-4 h-4 mr-2" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Resume
                        </>
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteSchedule(schedule.id)}
                      className="border-red-500 text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}