import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText, File, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ExportControls({ reportData, reportName }) {
  const [exportFormat, setExportFormat] = useState('pdf');

  const exportMutation = useMutation({
    mutationFn: async (format) => {
      const response = await base44.functions.invoke('exportReportData', {
        report_name: reportName,
        report_data: reportData,
        format: format
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.file_url) {
        window.open(data.file_url, '_blank');
        toast.success('Report exported successfully');
      }
    },
    onError: (error) => {
      toast.error('Export failed', {
        description: error.message
      });
    }
  });

  return (
    <div className="flex items-center gap-3">
      <Select value={exportFormat} onValueChange={setExportFormat}>
        <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-700 text-white">
          <SelectItem value="pdf">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              PDF
            </div>
          </SelectItem>
          <SelectItem value="csv">
            <div className="flex items-center gap-2">
              <File className="w-4 h-4" />
              CSV
            </div>
          </SelectItem>
          <SelectItem value="json">
            <div className="flex items-center gap-2">
              <File className="w-4 h-4" />
              JSON
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      <Button
        onClick={() => exportMutation.mutate(exportFormat)}
        disabled={exportMutation.isPending || !reportData}
        className="bg-blue-600 hover:bg-blue-700"
      >
        {exportMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Exporting...
          </>
        ) : (
          <>
            <Download className="w-4 h-4 mr-2" />
            Export {exportFormat.toUpperCase()}
          </>
        )}
      </Button>
    </div>
  );
}