import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Loader2, EyeOff, Shield } from 'lucide-react';
import { toast } from 'sonner';

export default function PIIRedactor() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [redactionOptions, setRedactionOptions] = useState({
    emails: true,
    phones: true,
    ssn: true,
    names: true,
    addresses: true,
    credit_cards: true
  });

  const redactMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected');

      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      const response = await base44.functions.invoke('redactSensitiveData', {
        file_url,
        redaction_options: redactionOptions
      });

      return response.data;
    },
    onSuccess: (data) => {
      setPreview(data.redacted_url);
      toast.success('PII redacted successfully!');
    },
    onError: (error) => {
      toast.error('Redaction failed: ' + error.message);
    }
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">PII Redaction Tool</h1>
        <p className="text-slate-400">Remove sensitive information from documents before sharing</p>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Upload & Configure
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-white mb-2 block">Select File</Label>
            <Input
              type="file"
              accept="image/*,.pdf,.txt,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0])}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-white">Redaction Options</Label>
            {Object.entries({
              emails: 'Email Addresses',
              phones: 'Phone Numbers',
              ssn: 'SSN / Tax IDs',
              names: 'Person Names',
              addresses: 'Street Addresses',
              credit_cards: 'Credit Card Numbers'
            }).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={redactionOptions[key]}
                  onCheckedChange={(checked) => 
                    setRedactionOptions({...redactionOptions, [key]: checked})
                  }
                />
                <Label htmlFor={key} className="text-slate-300">{label}</Label>
              </div>
            ))}
          </div>

          <Button
            onClick={() => redactMutation.mutate()}
            disabled={!file || redactMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {redactMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Redacting...
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4 mr-2" />
                Redact PII
              </>
            )}
          </Button>

          {preview && (
            <div className="border-t border-slate-700 pt-4">
              <Button
                onClick={() => window.open(preview, '_blank')}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Redacted File
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}