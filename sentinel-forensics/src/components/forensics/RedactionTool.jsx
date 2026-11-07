import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Eye, EyeOff, Copy, Loader2, Shield, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * AI-Powered PII Redaction Tool
 * Redacts sensitive information before sharing reports
 */
export default function RedactionTool({ initialText = '' }) {
  const [originalText, setOriginalText] = useState(initialText);
  const [redactedText, setRedactedText] = useState('');
  const [redactionLevel, setRedactionLevel] = useState('standard');
  const [showRedacted, setShowRedacted] = useState(false);

  const redactMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('redactSensitiveData', {
        text: originalText,
        redaction_level: redactionLevel
      });
      return data;
    },
    onSuccess: (result) => {
      setRedactedText(result.redacted_text);
      setShowRedacted(true);
      
      toast.success('Redaction Complete', {
        description: `${result.statistics.patterns_found} patterns redacted (${result.statistics.redaction_percentage}%)`
      });
    },
    onError: (error) => {
      toast.error('Redaction Failed', {
        description: error.message
      });
    }
  });

  const copyRedacted = () => {
    navigator.clipboard.writeText(redactedText);
    toast.success('Copied to clipboard');
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-400" />
          PII Redaction Tool
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Redaction Level */}
        <div className="space-y-2">
          <label className="text-sm text-slate-400">Redaction Level</label>
          <Select value={redactionLevel} onValueChange={setRedactionLevel}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-white">
              <SelectItem value="standard">Standard (Emails, Phones, IPs)</SelectItem>
              <SelectItem value="comprehensive">Comprehensive (All PII)</SelectItem>
              <SelectItem value="ai_assisted">AI-Assisted (Advanced Detection)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Input Text */}
        <div className="space-y-2">
          <label className="text-sm text-slate-400">Original Text</label>
          <Textarea
            value={originalText}
            onChange={(e) => setOriginalText(e.target.value)}
            placeholder="Paste text to redact sensitive information..."
            className="bg-slate-800 border-slate-700 text-white h-48 font-mono text-xs"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 flex-wrap">
          <Button
            onClick={() => redactMutation.mutate()}
            disabled={!originalText || redactMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {redactMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Redacting...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Redact PII
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowRedacted(!showRedacted)}
            disabled={!redactedText}
            className="border-slate-700"
          >
            {showRedacted ? (
              <>
                <EyeOff className="w-4 h-4 mr-2" />
                Hide Redacted
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                Show Redacted
              </>
            )}
          </Button>
          {redactedText && (
            <Button
              variant="outline"
              onClick={copyRedacted}
              className="border-slate-700"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Redacted
            </Button>
          )}
        </div>

        {/* Redacted Output */}
        {showRedacted && redactedText && (
          <div className="space-y-2">
            <label className="text-sm text-slate-400">Redacted Text (Safe to Share)</label>
            <Textarea
              value={redactedText}
              readOnly
              className="bg-green-900/20 border-green-500/30 text-green-300 h-48 font-mono text-xs"
            />
            <div className="flex items-center gap-2 text-xs text-green-400">
              <CheckCircle className="w-3 h-3" />
              Sensitive information has been redacted
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}