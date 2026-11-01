import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { FileText, Send } from 'lucide-react';
import { toast } from 'sonner';

export default function DisclosureAutomation({ legalCaseId }) {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [selectedEvidence, setSelectedEvidence] = useState([]);
  const [disclosureType, setDisclosureType] = useState('initial_disclosure');

  const { data: legalCase } = useQuery({
    queryKey: ['legal-case', legalCaseId],
    queryFn: async () => {
      const cases = await base44.entities.LegalCase.filter({ id: legalCaseId });
      return cases[0];
    },
    enabled: !!legalCaseId
  });

  const { data: evidenceItems = [] } = useQuery({
    queryKey: ['case-evidence', legalCase?.forensic_case_ids],
    queryFn: async () => {
      if (!legalCase?.forensic_case_ids?.length) return [];
      const allEvidence = [];
      for (const caseId of legalCase.forensic_case_ids) {
        const evidence = await base44.entities.EvidenceV2.filter({ case_id: caseId });
        allEvidence.push(...evidence);
      }
      return allEvidence;
    },
    enabled: !!legalCase?.forensic_case_ids?.length
  });

  const generateDisclosureMutation = useMutation({
    mutationFn: ({ evidence_ids }) => 
      base44.functions.invoke('generateDisclosureLog', {
        legal_case_id: legalCaseId,
        disclosure_type: disclosureType,
        evidence_ids
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['disclosure-logs']);
      setSelectedEvidence([]);
      toast.success('Disclosure log generated');
    }
  });

  const toggleEvidence = (evidenceId) => {
    setSelectedEvidence(prev =>
      prev.includes(evidenceId) ? prev.filter(id => id !== evidenceId) : [...prev, evidenceId]
    );
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white">Disclosure Automation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm text-slate-300 mb-2 block">Disclosure Type</label>
          <select
            value={disclosureType}
            onChange={(e) => setDisclosureType(e.target.value)}
            className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
          >
            <option value="initial_disclosure">Initial Disclosure</option>
            <option value="supplemental_disclosure">Supplemental Disclosure</option>
            <option value="expert_disclosure">Expert Disclosure</option>
            <option value="mandatory_disclosure">Mandatory Disclosure</option>
          </select>
        </div>

        <div className="space-y-2">
          <h4 className="text-slate-300 font-medium">Select Evidence to Disclose</h4>
          {evidenceItems.map(evidence => (
            <div key={evidence.id} className="flex items-center gap-3 p-2 bg-slate-800/50 rounded">
              <Checkbox 
                checked={selectedEvidence.includes(evidence.id)}
                onCheckedChange={() => toggleEvidence(evidence.id)}
              />
              <FileText className="w-4 h-4 text-slate-400" />
              <div className="flex-1">
                <p className="text-white text-sm">{evidence.evidence_name}</p>
                <p className="text-xs text-slate-400">{evidence.description}</p>
              </div>
            </div>
          ))}
        </div>

        <Button 
          onClick={() => generateDisclosureMutation.mutate({ evidence_ids: selectedEvidence })}
          disabled={selectedEvidence.length === 0}
          className="w-full"
        >
          <Send className="w-4 h-4 mr-2" />
          Generate Disclosure Log
        </Button>
      </CardContent>
    </Card>
  );
}