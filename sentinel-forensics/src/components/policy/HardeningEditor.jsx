import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, CheckSquare } from 'lucide-react';

export default function HardeningEditor({ checklist, onChange }) {
  const items = checklist?.items || [];

  const addItem = () => {
    onChange({
      ...checklist,
      items: [...items, {
        control_id: `CTRL-${Date.now()}`,
        title: '',
        description: '',
        platform: 'ANY',
        requirement: 'REQUIRED',
        validation: 'AUTOMATED_CHECK',
        evidence_required: 'NONE'
      }]
    });
  };

  const updateItem = (idx, updates) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], ...updates };
    onChange({ ...checklist, items: updated });
  };

  const deleteItem = (idx) => {
    onChange({ ...checklist, items: items.filter((_, i) => i !== idx) });
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-green-400" />
            Security Hardening Checklist
          </CardTitle>
          <Button size="sm" onClick={addItem} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Control
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            No hardening controls defined. Click "Add Control" to create one.
          </p>
        ) : (
          items.map((item, idx) => (
            <div key={idx} className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-white">Control {idx + 1}</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteItem(idx)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div>
                <Label className="text-slate-400">Title</Label>
                <Input
                  value={item.title}
                  onChange={(e) => updateItem(idx, { title: e.target.value })}
                  placeholder="e.g., Enable Full Disk Encryption"
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-slate-400">Description</Label>
                <Textarea
                  value={item.description}
                  onChange={(e) => updateItem(idx, { description: e.target.value })}
                  placeholder="What needs to be done..."
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-400">Platform</Label>
                  <Select
                    value={item.platform}
                    onValueChange={(value) => updateItem(idx, { platform: value })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ANY">Any Platform</SelectItem>
                      <SelectItem value="WINDOWS">Windows</SelectItem>
                      <SelectItem value="MACOS">macOS</SelectItem>
                      <SelectItem value="LINUX">Linux</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-400">Requirement</Label>
                  <Select
                    value={item.requirement}
                    onValueChange={(value) => updateItem(idx, { requirement: value })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="REQUIRED">Required</SelectItem>
                      <SelectItem value="RECOMMENDED">Recommended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-400">Validation</Label>
                  <Select
                    value={item.validation}
                    onValueChange={(value) => updateItem(idx, { validation: value })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTOMATED_CHECK">Automated Check</SelectItem>
                      <SelectItem value="MANUAL_ATTESTATION">Manual Attestation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-400">Evidence Required</Label>
                  <Select
                    value={item.evidence_required}
                    onValueChange={(value) => updateItem(idx, { evidence_required: value })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">None</SelectItem>
                      <SelectItem value="FILE_UPLOAD">File Upload</SelectItem>
                      <SelectItem value="COMMAND_OUTPUT">Command Output</SelectItem>
                      <SelectItem value="SCREENSHOT">Screenshot</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}