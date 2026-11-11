import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Usb } from 'lucide-react';

export default function UsbEditor({ config, onChange }) {
  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Usb className="w-5 h-5 text-purple-400" />
          USB Device Restrictions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-slate-400">Restriction Mode</Label>
          <Select
            value={config?.mode || 'ALLOW_ALL'}
            onValueChange={(value) => onChange({ ...config, mode: value })}
          >
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALLOW_ALL">Allow All USB Devices</SelectItem>
              <SelectItem value="ALLOWLIST">Allowlist (Explicit Allow)</SelectItem>
              <SelectItem value="BLOCKLIST">Blocklist (Explicit Block)</SelectItem>
              <SelectItem value="BLOCK_ALL">Block All USB Devices</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={config?.log_violations}
            onCheckedChange={(checked) => onChange({ ...config, log_violations: checked })}
          />
          <Label className="text-white">Log Violations</Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={config?.alert_on_violation}
            onCheckedChange={(checked) => onChange({ ...config, alert_on_violation: checked })}
          />
          <Label className="text-white">Alert on Violation</Label>
        </div>

        {(config?.mode === 'ALLOWLIST' || config?.mode === 'BLOCKLIST') && (
          <div className="p-4 bg-slate-900/50 rounded border border-slate-700">
            <Label className="text-slate-400 text-sm">
              Device matching criteria (vendor ID, product ID, etc.) can be configured per assignment
            </Label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}