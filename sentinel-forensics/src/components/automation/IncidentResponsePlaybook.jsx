import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Zap,
  Play,
  CheckCircle,
  Loader2,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { executeIncidentPlaybook } from '@/functions/executeIncidentPlaybook';

export default function IncidentResponsePlaybook({ incident }) {
  const [executing, setExecuting] = useState(false);
  const queryClient = useQueryClient();

  const executePlaybookMutation = useMutation({
    mutationFn: async () => {
      setExecuting(true);
      
      // Determine playbook based on incident severity and type
      let playbookId = 'default_incident_response';
      
      if (incident.severity === 'critical') {
        playbookId = 'critical_incident_response';
      } else if (incident.incident_type === 'ransomware') {
        playbookId = 'ransomware_containment';
      } else if (incident.incident_type === 'data_breach') {
        playbookId = 'data_breach_response';
      }

      const response = await executeIncidentPlaybook({
        incident_id: incident.incident_id,
        playbook_id: playbookId,
        auto_execute: true
      });

      return response.data;
    },
    onSuccess: (data) => {
      setExecuting(false);
      toast.success('Playbook Executed', {
        description: `${data.steps_completed} steps completed`
      });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (error) => {
      setExecuting(false);
      toast.error('Playbook Execution Failed', {
        description: error.message
      });
    }
  });

  // If playbook already executed
  if (incident.playbook_execution) {
    const execution = incident.playbook_execution;
    const progressPercent = execution.status === 'completed' ? 100 :
                           execution.status === 'running' ? 60 : 0;

    return (
      <Card className="bg-green-900/20 border-green-500/30 mb-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Zap className="w-5 h-5 text-green-400" />
              Playbook: {execution.playbook_name}
              {execution.auto_executed && (
                <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                  AUTO
                </Badge>
              )}
            </CardTitle>
            <Badge className={
              execution.status === 'completed' ? 'bg-green-500/20 text-green-400' :
              execution.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
              execution.status === 'failed' ? 'bg-red-500/20 text-red-400' :
              'bg-yellow-500/20 text-yellow-400'
            }>
              {execution.status.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progressPercent} className="h-2" />
          
          {execution.actions_taken && execution.actions_taken.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Actions Taken:</p>
              <div className="space-y-1">
                {execution.actions_taken.map((action, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-green-300">
                    <CheckCircle className="w-3 h-3" />
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {execution.started_at && execution.completed_at && (
            <p className="text-xs text-slate-400">
              Duration: {Math.floor((new Date(execution.completed_at) - new Date(execution.started_at)) / 1000)}s
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Suggest playbook execution
  const suggestedPlaybook = incident.severity === 'critical' 
    ? 'Critical Incident Response'
    : incident.incident_type === 'ransomware'
    ? 'Ransomware Containment'
    : incident.incident_type === 'data_breach'
    ? 'Data Breach Response'
    : 'Standard Incident Response';

  return (
    <Card className="bg-blue-900/20 border-blue-500/30 mb-4">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2 text-base">
          <Zap className="w-5 h-5 text-blue-400" />
          Automated Response Playbook
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-white mb-2">
              <strong>Suggested:</strong> {suggestedPlaybook}
            </p>
            <p className="text-xs text-slate-400 mb-3">
              This playbook will automatically: isolate affected systems, collect evidence, 
              block malicious IPs, and generate response recommendations.
            </p>
          </div>
        </div>

        <Button
          onClick={() => executePlaybookMutation.mutate()}
          disabled={executing || executePlaybookMutation.isPending}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 min-h-[44px]"
        >
          {executing || executePlaybookMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Executing Playbook...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Execute Response Playbook
            </>
          )}
        </Button>

        <p className="text-xs text-center text-slate-500">
          Conditional logic based on severity: {incident.severity} | type: {incident.incident_type}
        </p>
      </CardContent>
    </Card>
  );
}