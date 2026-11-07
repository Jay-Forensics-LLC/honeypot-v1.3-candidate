import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Shield, Download, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function AuditLogExporter({ caseId, caseData }) {
  const [format, setFormat] = useState('html');

  const exportMutation = useMutation({
    mutationFn: async (exportFormat) => {
      const { data } = await base44.functions.invoke('exportCaseAuditLog', {
        caseId,
        format: exportFormat
      });
      return data;
    },
    onSuccess: (data) => {
      toast.success('Audit log exported');
      
      // For JSON format, download directly
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-log-${caseData?.case_number || 'unknown'}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    },
    onError: (error) => {
      toast.error('Export failed', {
        description: error.message
      });
    }
  });

  const handleExport = () => {
    exportMutation.mutate(format);
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          Export Case Audit Log
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-200">
            <strong>Tamper-Evident Export:</strong> Includes cryptographic hash chain for independent verification
          </p>
        </div>

        <div>
          <Label className="text-slate-300">Export Format</Label>
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="html">HTML (Human-Readable)</SelectItem>
              <SelectItem value="csv">CSV (Spreadsheet)</SelectItem>
              <SelectItem value="json">JSON (Machine-Readable)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleExport}
          disabled={exportMutation.isPending}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          {exportMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Export Audit Log ({format.toUpperCase()})
            </>
          )}
        </Button>

        <div className="pt-3 border-t border-slate-700">
          <p className="text-xs text-slate-500">
            <strong>Legal Notice:</strong> Audit log exports are logged. All timestamps in UTC. 
            Export includes hash chain for forensic verification.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}