import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, Loader2, Database } from 'lucide-react';
import { toast } from 'sonner';
import { ingestLogs } from '@/functions/ingestLogs';

export default function LogCollector() {
  const [logInput, setLogInput] = useState('');
  const [sourceType, setSourceType] = useState('application');
  const [sourceName, setSourceName] = useState('');
  const [logFormat, setLogFormat] = useState('json');

  const queryClient = useQueryClient();

  const ingestMutation = useMutation({
    mutationFn: async () => {
      // Parse logs based on format
      let logs = [];
      
      if (logFormat === 'json') {
        try {
          // Try parsing as JSON array first
          logs = JSON.parse(logInput);
          if (!Array.isArray(logs)) {
            logs = [logs];
          }
        } catch {
          // Try parsing as newline-delimited JSON
          logs = logInput.split('\n')
            .filter(line => line.trim())
            .map(line => {
              try {
                return JSON.parse(line);
              } catch {
                return { message: line };
              }
            });
        }
      } else if (logFormat === 'syslog') {
        logs = logInput.split('\n')
          .filter(line => line.trim())
          .map(line => ({ raw: line, message: line }));
      }

      const response = await ingestLogs({
        logs,
        source_type: sourceType,
        source_id: sourceName || 'manual-upload',
        source_name: sourceName || 'Manual Upload',
        format: logFormat
      });

      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Logs Ingested Successfully', {
        description: `${data.logs_ingested} logs ingested, ${data.alerts_generated} alerts generated`
      });
      
      queryClient.invalidateQueries({ queryKey: ['siem-logs'] });
      setLogInput('');
    },
    onError: (error) => {
      toast.error('Log Ingestion Failed', { description: error.message });
    }
  });

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Database className="w-5 h-5 text-blue-400" />
          Log Collector
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-white">Source Type</Label>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="endpoint_agent">Endpoint Agent</SelectItem>
                <SelectItem value="network_device">Network Device</SelectItem>
                <SelectItem value="application">Application</SelectItem>
                <SelectItem value="firewall">Firewall</SelectItem>
                <SelectItem value="web_server">Web Server</SelectItem>
                <SelectItem value="authentication">Authentication</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-white">Source Name</Label>
            <input
              type="text"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="e.g., firewall-01"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white"
              style={{ fontSize: '16px' }}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Log Format</Label>
            <Select value={logFormat} onValueChange={setLogFormat}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="syslog">Syslog</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-white">Log Data</Label>
          <Textarea
            value={logInput}
            onChange={(e) => setLogInput(e.target.value)}
            placeholder={
              logFormat === 'json' 
                ? '{"timestamp": "2024-01-01T12:00:00Z", "event_type": "login", "severity": "info", "message": "User logged in"}'
                : '<14>Jan 1 12:00:00 hostname process: Log message'
            }
            className="bg-slate-800 border-slate-700 text-white font-mono text-sm min-h-[200px]"
            style={{ fontSize: '14px' }}
          />
          <p className="text-xs text-slate-400">
            Supports JSON, newline-delimited JSON, or syslog format
          </p>
        </div>

        <Button
          onClick={() => ingestMutation.mutate()}
          disabled={!logInput || ingestMutation.isPending}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
        >
          {ingestMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Ingesting Logs...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Ingest Logs
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}