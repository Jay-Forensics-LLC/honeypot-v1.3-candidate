import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileSearch } from 'lucide-react';

export default function EvidenceContextDialog({ open, onClose, onAcknowledge }) {
  const [context, setContext] = useState({
    source: 'live_system',
    note: ''
  });

  const handleAcknowledge = () => {
    onAcknowledge(context);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <FileSearch className="w-5 h-5 text-blue-400" />
            <div>
              <DialogTitle className="text-white">Gate 3: Evidence Context</DialogTitle>
              <DialogDescription className="text-slate-400 text-sm">
                What is the source of this evidence?
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-xs text-blue-200">
              Context beats raw data. This takes 5 seconds and makes everything reviewable.
            </p>
          </div>

          <div>
            <Label className="text-slate-300">Evidence Source *</Label>
            <Select
              value={context.source}
              onValueChange={(value) => setContext({ ...context, source: value })}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live_system">Live system (in use)</SelectItem>
                <SelectItem value="powered_off">Powered off system</SelectItem>
                <SelectItem value="backup_image">Backup or image</SelectItem>
                <SelectItem value="third_party">Third-party export</SelectItem>
                <SelectItem value="unknown">Unknown / unclear</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-300">Additional Note (Optional)</Label>
            <Textarea
              value={context.note}
              onChange={(e) => setContext({ ...context, note: e.target.value })}
              placeholder="Any relevant context about collection conditions..."
              className="bg-slate-800 border-slate-700 text-white mt-1 h-20"
            />
          </div>

          <Button
            onClick={handleAcknowledge}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            Acknowledge & Continue
          </Button>

          <p className="text-xs text-slate-500 text-center">
            This context is stored as immutable case metadata
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}