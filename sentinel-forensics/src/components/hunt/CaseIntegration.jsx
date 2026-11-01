import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderOpen, Plus, Link } from 'lucide-react';
import { toast } from 'sonner';

export default function CaseIntegration({ findingId, findingTitle }) {
  const [selectedCase, setSelectedCase] = useState('');
  const queryClient = useQueryClient();

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date', 50),
    initialData: []
  });

  const linkToCase = useMutation({
    mutationFn: async () => {
      // Create evidence entry linking to the finding
      const user = await base44.auth.me();
      await base44.entities.EvidenceV2.create({
        organization_id: user.organization_id,
        case_id: selectedCase,
        evidence_type: 'threat_finding',
        title: `Hunt Finding: ${findingTitle}`,
        description: `Threat hunt finding linked from hunt system`,
        metadata: {
          finding_id: findingId,
          source: 'threat_hunt'
        },
        chain_of_custody: [{
          action: 'linked_from_hunt',
          timestamp: new Date().toISOString(),
          actor: user.email
        }]
      });
    },
    onSuccess: () => {
      toast.success('Finding linked to case');
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
    }
  });

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-blue-400" />
          Link to Case
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-300">
            Link this finding to an existing case for investigation tracking
          </p>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-2 block">Select Case</label>
          <Select value={selectedCase} onValueChange={setSelectedCase}>
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
              <SelectValue placeholder="Choose a case..." />
            </SelectTrigger>
            <SelectContent>
              {cases.map((caseItem) => (
                <SelectItem key={caseItem.id} value={caseItem.id}>
                  {caseItem.case_number} - {caseItem.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => linkToCase.mutate()}
          disabled={!selectedCase || linkToCase.isPending}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          <Link className="w-4 h-4 mr-2" />
          Link to Case
        </Button>
      </CardContent>
    </Card>
  );
}