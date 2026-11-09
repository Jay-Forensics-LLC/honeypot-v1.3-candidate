import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function AnalysisDisclaimerDialog({ open, onClose, onAcknowledge }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            <div>
              <DialogTitle className="text-white">Gate 4: Analysis Limitations</DialogTitle>
              <DialogDescription className="text-slate-400 text-sm">
                One-time acknowledgment for this case
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <p className="text-sm text-orange-200 leading-relaxed">
              <strong>Important:</strong> Analysis highlights patterns and inconsistencies. 
              It does not determine intent, attribution, or certainty.
            </p>
          </div>

          <div className="space-y-2 text-xs text-slate-400">
            <p>✓ Analysis is assistive, not declarative</p>
            <p>✓ You remain responsible for interpretation</p>
            <p>✓ Patterns require human verification</p>
          </div>

          <Button
            onClick={onAcknowledge}
            className="w-full bg-orange-600 hover:bg-orange-700"
          >
            I Understand
          </Button>

          <p className="text-xs text-slate-500 text-center">
            This keeps AI outputs in a safe, defensive lane
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}