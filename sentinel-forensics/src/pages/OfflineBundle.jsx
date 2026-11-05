import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Loader2, Archive } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function OfflineBundle() {
  const [selectedCase, setSelectedCase] = useState('');
  const [includeOptions, setIncludeOptions] = useState({
    html_report: true,
    json_data: true,
    evidence_files: true,
    hashes_manifest: true,
    chain_of_custody: true,
    audit_logs: false
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date'),
    initialData: []
  });

  const generateBundleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCase) throw new Error('Select a case first');

      const response = await base44.functions.invoke('generateOfflineBundle', {
        case_id: selectedCase,
        include_options: includeOptions
      });

      return response.data;
    },
    onSuccess: (data) => {
      if (data.bundle_url) {
        window.open(data.bundle_url, '_blank');
        toast.success('Offline bundle generated!');
      }
    },
    onError: (error) => {
      toast.error('Bundle generation failed: ' + error.message);
    }
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Offline Evidence Bundle</h1>
        <p className="text-slate-400">Export complete case packages for legal counsel or offline analysis</p>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Archive className="w-5 h-5" />
            Bundle Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-white mb-2 block">Select Case</Label>
            <Select value={selectedCase} onValueChange={setSelectedCase}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Choose a case" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                {cases.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.case_number} - {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-white">Include in Bundle</Label>
            {Object.entries({
              html_report: 'HTML Report',
              json_data: 'JSON Data Export',
              evidence_files: 'Evidence Files',
              hashes_manifest: 'SHA-256 Hashes Manifest',
              chain_of_custody: 'Chain of Custody Log',
              audit_logs: 'Audit Logs'
            }).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={includeOptions[key]}
                  onCheckedChange={(checked) =>
                    setIncludeOptions({...includeOptions, [key]: checked})
                  }
                />
                <Label htmlFor={key} className="text-slate-300">{label}</Label>
              </div>
            ))}
          </div>

          <Button
            onClick={() => generateBundleMutation.mutate()}
            disabled={!selectedCase || generateBundleMutation.isPending}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {generateBundleMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Bundle...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Generate Offline Bundle
              </>
            )}
          </Button>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-300">
            <strong>Bundle Contents:</strong> Fully self-contained ZIP with HTML report, JSON data, 
            evidence files, and SHA-256 hashes for verification. No internet required to view.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}