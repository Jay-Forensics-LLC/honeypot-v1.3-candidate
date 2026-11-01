import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import ImpactPreview from './ImpactPreview';

/**
 * FEEDBACK PANEL
 * Allows analysts to provide feedback on enrichment results
 */

export default function FeedbackPanel({ verdict, notes, onVerdictChange, onNotesChange, onSave, saving, currentScore, originalVerdict }) {
  const verdictOptions = [
    { value: 'unknown', label: 'Unknown', icon: HelpCircle, color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
    { value: 'benign', label: 'Benign', icon: CheckCircle2, color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    { value: 'malicious', label: 'Malicious', icon: AlertTriangle, color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    { value: 'investigate', label: 'Needs Investigation', icon: HelpCircle, color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' }
  ];

  return (
    <div className="space-y-4">
      {currentScore !== undefined && originalVerdict && (
        <ImpactPreview 
          currentScore={currentScore} 
          currentVerdict={originalVerdict} 
          newVerdict={verdict}
        />
      )}
      
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">Analyst Feedback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
        <div>
          <label className="text-sm text-slate-400 mb-2 block">Verdict</label>
          <div className="grid grid-cols-2 gap-2">
            {verdictOptions.map(option => {
              const Icon = option.icon;
              return (
                <Button
                  key={option.value}
                  size="sm"
                  variant={verdict === option.value ? 'default' : 'outline'}
                  onClick={() => onVerdictChange(option.value)}
                  className={verdict === option.value ? option.color : 'border-slate-700'}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-sm text-slate-400 mb-2 block">Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Document your analysis and reasoning..."
            className="bg-slate-800 border-slate-700 text-white"
            rows={4}
          />
        </div>

        <Button
          onClick={onSave}
          disabled={saving}
          className="w-full bg-[#EF4444] hover:bg-[#DC2626]"
        >
          {saving ? 'Saving...' : 'Save Feedback'}
        </Button>

        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-300">
            <strong>Note:</strong> Feedback does not modify historical enrichment results. 
            Your verdict is stored separately for traceability.
          </p>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}