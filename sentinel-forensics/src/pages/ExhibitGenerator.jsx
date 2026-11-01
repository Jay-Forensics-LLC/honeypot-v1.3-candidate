import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ExhibitGenerator() {
  const [selectedCase, setSelectedCase] = useState('');
  const [exhibitOptions, setExhibitOptions] = useState({
    auto_paginate: true,
    include_gps: true,
    include_timestamps: true,
    include_hashes: true,
    signature_block: true
  });
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date'),
    initialData: []
  });

  const generateExhibitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCase) throw new Error('Select a case');
      if (exhibitOptions.signature_block && (!signerName || !signerTitle)) {
        throw new Error('Signer name and title required');
      }

      const response = await base44.functions.invoke('generateExhibit', {
        case_id: selectedCase,
        options: exhibitOptions,
        signer: {
          name: signerName,
          title: signerTitle,
          date: new Date().toISOString()
        }
      });

      return response.data;
    },
    onSuccess: (data) => {
      if (data.file_url) {
        window.open(data.file_url, '_blank');
        toast.success('Exhibit generated!');
      }
    },
    onError: (error) => {
      toast.error('Generation failed: ' + error.message);
    }
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Legal Exhibit Generator</h1>
        <p className="text-slate-400">Auto-paginate images with captions, GPS, timestamps, and SHA-256 hashes</p>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Exhibit Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-white">Select Case</Label>
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
            <Label className="text-white">Include in Exhibit</Label>
            {Object.entries({
              auto_paginate: 'Auto-Paginate Images',
              include_gps: 'GPS Coordinates',
              include_timestamps: 'Collection Timestamps',
              include_hashes: 'SHA-256 Hashes',
              signature_block: 'Officer Signature Block'
            }).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={exhibitOptions[key]}
                  onCheckedChange={(checked) =>
                    setExhibitOptions({...exhibitOptions, [key]: checked})
                  }
                />
                <Label htmlFor={key} className="text-slate-300">{label}</Label>
              </div>
            ))}
          </div>

          {exhibitOptions.signature_block && (
            <div className="border-t border-slate-700 pt-4 space-y-3">
              <div>
                <Label className="text-white">Officer/Affiant Name</Label>
                <Input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Det. John Smith"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label className="text-white">Title/Badge</Label>
                <Input
                  value={signerTitle}
                  onChange={(e) => setSignerTitle(e.target.value)}
                  placeholder="Detective, Badge #1234"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>
          )}

          <Button
            onClick={() => generateExhibitMutation.mutate()}
            disabled={!selectedCase || generateExhibitMutation.isPending}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {generateExhibitMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
            ) : (
              <><Download className="w-4 h-4 mr-2" /> Generate Exhibit PDF</>
            )}
          </Button>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-300">
            <strong>Output:</strong> Professional legal exhibit with auto-paginated evidence, 
            captions, metadata, SHA-256 verification hashes, and sworn signature block.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}