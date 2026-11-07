import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Shield, CheckCircle2 } from 'lucide-react';

const CHECKLIST_ITEMS = [
  {
    id: 'no_reinstall',
    text: 'I will not reinstall the OS or wipe storage before evidence collection.',
    critical: true
  },
  {
    id: 'no_cleanup',
    text: 'I will avoid running cleanup, antivirus, or optimization tools unless documented.',
    critical: true
  },
  {
    id: 'understand_updates',
    text: 'I understand updates and reboots may alter evidence.',
    critical: false
  },
  {
    id: 'no_premature_remediation',
    text: 'I acknowledge that premature remediation can destroy forensic value.',
    critical: true
  }
];

export default function StabilizationChecklist({ onComplete, onCancel }) {
  const [acknowledged, setAcknowledged] = useState({});
  const [showWarning, setShowWarning] = useState(false);

  const handleCheck = (itemId) => {
    setAcknowledged(prev => ({
      ...prev,
      [itemId]: {
        acknowledged: !prev[itemId]?.acknowledged,
        timestamp: new Date().toISOString()
      }
    }));
    setShowWarning(false);
  };

  const allChecked = CHECKLIST_ITEMS.every(item => acknowledged[item.id]?.acknowledged);

  const handleProceed = () => {
    if (!allChecked) {
      setShowWarning(true);
      return;
    }

    const checklistData = CHECKLIST_ITEMS.map(item => ({
      item: item.text,
      acknowledged: true,
      timestamp: acknowledged[item.id].timestamp
    }));

    onComplete({
      stabilization_acknowledged: true,
      stabilization_timestamp: new Date().toISOString(),
      stabilization_checklist: checklistData
    });
  };

  return (
    <Card className="border-orange-500/20 bg-slate-900">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-orange-400" />
          <div>
            <CardTitle className="text-white">Phase 1: Environment Stabilization</CardTitle>
            <CardDescription className="text-slate-400 mt-1">
              Critical: Prevent evidence loss before investigation begins
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <p className="text-sm text-orange-200 leading-relaxed">
            <strong>Ground Rule:</strong> Assume your system may already be partially compromised. 
            Your goal is not to "catch the attacker" but to preserve facts without making the situation worse.
          </p>
        </div>

        <div className="space-y-4">
          {CHECKLIST_ITEMS.map((item) => (
            <div 
              key={item.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <Checkbox
                id={item.id}
                checked={acknowledged[item.id]?.acknowledged || false}
                onCheckedChange={() => handleCheck(item.id)}
                className="mt-1"
              />
              <label
                htmlFor={item.id}
                className="text-sm text-slate-200 leading-relaxed cursor-pointer flex-1"
              >
                {item.text}
                {item.critical && (
                  <span className="ml-2 text-xs text-orange-400">(Critical)</span>
                )}
              </label>
              {acknowledged[item.id]?.acknowledged && (
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-1" />
              )}
            </div>
          ))}
        </div>

        {showWarning && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-200">
              All items must be acknowledged to proceed. This protects evidence integrity.
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t border-slate-700">
          <Button
            onClick={onCancel}
            variant="outline"
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleProceed}
            disabled={!allChecked}
            className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
          >
            {allChecked ? 'Proceed to Case Creation' : `Acknowledge All (${CHECKLIST_ITEMS.filter(i => acknowledged[i.id]?.acknowledged).length}/${CHECKLIST_ITEMS.length})`}
          </Button>
        </div>

        <p className="text-xs text-slate-500 text-center">
          These acknowledgments are logged with timestamps for legal defensibility
        </p>
      </CardContent>
    </Card>
  );
}