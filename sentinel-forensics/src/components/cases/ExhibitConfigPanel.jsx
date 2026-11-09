import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Save, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';

export default function ExhibitConfigPanel({ caseId }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editConfig, setEditConfig] = useState(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ['exhibit-config', caseId],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('manageExhibits', {
        action: 'get_config',
        caseId
      });
      return data.config;
    },
    enabled: !!caseId
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['exhibit-assignments', caseId],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('manageExhibits', {
        action: 'list_assignments',
        caseId
      });
      return data.assignments || [];
    },
    enabled: !!caseId
  });

  const updateMutation = useMutation({
    mutationFn: async (updates) => {
      const { data } = await base44.functions.invoke('manageExhibits', {
        action: 'update_config',
        caseId,
        ...updates
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibit-config', caseId] });
      setIsEditing(false);
      toast.success('Exhibit configuration updated');
    }
  });

  const handleStartEdit = () => {
    setEditConfig({
      prefix: config.prefix,
      format_type: config.format_type,
      auto_assign_on_ingest: config.auto_assign_on_ingest
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(editConfig);
  };

  const exportIndex = () => {
    const csv = [
      ['Exhibit Number', 'Evidence ID', 'Assigned By', 'Assigned At'].join(','),
      ...assignments.map(a => [
        a.exhibit_number,
        a.evidence_id,
        a.assigned_by,
        new Date(a.assigned_at).toLocaleString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exhibit-index-case-${caseId}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Exhibit index exported');
  };

  if (isLoading) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-6 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Exhibit Numbering Configuration
          </CardTitle>
          {!isEditing && (
            <Button onClick={handleStartEdit} className="bg-blue-600 hover:bg-blue-700">
              Edit Config
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditing ? (
          <>
            <div>
              <Label className="text-slate-300">Exhibit Prefix</Label>
              <Input
                value={editConfig.prefix}
                onChange={(e) => setEditConfig({ ...editConfig, prefix: e.target.value })}
                placeholder="e.g., Exhibit, Gov. Ex., Def. Ex."
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-slate-300">Format Type</Label>
              <Select
                value={editConfig.format_type}
                onValueChange={(value) => setEditConfig({ ...editConfig, format_type: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="numeric">Numeric (1, 2, 3...)</SelectItem>
                  <SelectItem value="alpha">Alphabetic (A, B, C...)</SelectItem>
                  <SelectItem value="year_based">Year-Based (2026-001...)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={editConfig.auto_assign_on_ingest}
                onCheckedChange={(checked) => setEditConfig({ ...editConfig, auto_assign_on_ingest: checked })}
              />
              <Label className="text-slate-300 text-sm">Auto-assign on evidence upload</Label>
            </div>

            <div className="flex gap-2 pt-4 border-t border-slate-700">
              <Button
                onClick={() => setIsEditing(false)}
                variant="outline"
                className="flex-1 border-slate-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Prefix</p>
                <p className="text-white">{config.prefix}</p>
              </div>
              <div>
                <p className="text-slate-500">Format</p>
                <p className="text-white">{config.format_type}</p>
              </div>
              <div>
                <p className="text-slate-500">Next Sequence</p>
                <p className="text-white">{config.next_sequence}</p>
              </div>
              <div>
                <p className="text-slate-500">Auto-Assign</p>
                <p className="text-white">{config.auto_assign_on_ingest ? 'Yes' : 'No'}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-400">
                  {assignments.length} exhibit{assignments.length !== 1 ? 's' : ''} assigned
                </p>
                {assignments.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportIndex}
                    className="border-slate-700"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Export Index
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}