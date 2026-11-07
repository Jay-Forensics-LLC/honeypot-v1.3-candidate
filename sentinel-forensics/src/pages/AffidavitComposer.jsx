import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function AffidavitComposer() {
  const [selectedCase, setSelectedCase] = useState('');
  const [affidavit, setAffidavit] = useState({
    affiant_name: '',
    affiant_title: '',
    affiant_badge: '',
    agency: '',
    jurisdiction: '',
    facts: '',
    exhibit_references: ''
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date'),
    initialData: []
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCase || !affidavit.affiant_name) {
        throw new Error('Case and affiant name required');
      }

      const response = await base44.functions.invoke('generateAffidavit', {
        case_id: selectedCase,
        affidavit_data: affidavit
      });

      return response.data;
    },
    onSuccess: (data) => {
      if (data.file_url) {
        window.open(data.file_url, '_blank');
        toast.success('Affidavit generated!');
      }
    },
    onError: (error) => {
      toast.error('Generation failed: ' + error.message);
    }
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Affidavit Composer</h1>
        <p className="text-slate-400">Generate sworn statements with case facts and evidence</p>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Affidavit Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-white">Case</Label>
            <Select value={selectedCase} onValueChange={setSelectedCase}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Select case" />
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

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-white">Affiant Name</Label>
              <Input
                value={affidavit.affiant_name}
                onChange={(e) => setAffidavit({...affidavit, affiant_name: e.target.value})}
                placeholder="Det. Jane Doe"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div>
              <Label className="text-white">Title/Badge</Label>
              <Input
                value={affidavit.affiant_badge}
                onChange={(e) => setAffidavit({...affidavit, affiant_badge: e.target.value})}
                placeholder="Detective, Badge #5678"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div>
              <Label className="text-white">Agency</Label>
              <Input
                value={affidavit.agency}
                onChange={(e) => setAffidavit({...affidavit, agency: e.target.value})}
                placeholder="Miami-Dade Police Department"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div>
              <Label className="text-white">Jurisdiction</Label>
              <Input
                value={affidavit.jurisdiction}
                onChange={(e) => setAffidavit({...affidavit, jurisdiction: e.target.value})}
                placeholder="Miami-Dade County, Florida"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>

          <div>
            <Label className="text-white">Statement of Facts</Label>
            <Textarea
              value={affidavit.facts}
              onChange={(e) => setAffidavit({...affidavit, facts: e.target.value})}
              placeholder="Based on my training and experience, I have probable cause to believe..."
              className="bg-slate-800 border-slate-700 text-white h-48"
            />
          </div>

          <div>
            <Label className="text-white">Exhibit References (optional)</Label>
            <Textarea
              value={affidavit.exhibit_references}
              onChange={(e) => setAffidavit({...affidavit, exhibit_references: e.target.value})}
              placeholder="Exhibit A: Network capture showing...\nExhibit B: Screenshot of..."
              className="bg-slate-800 border-slate-700 text-white h-32"
            />
          </div>

          <Button
            onClick={() => generateMutation.mutate()}
            disabled={!selectedCase || !affidavit.affiant_name || generateMutation.isPending}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {generateMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
            ) : (
              <><Download className="w-4 h-4 mr-2" /> Generate Sworn Affidavit</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}