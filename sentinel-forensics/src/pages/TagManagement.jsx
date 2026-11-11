import React from 'react';
import { Card } from '@/components/ui/card';
import TagManager from '../components/evidence/TagManager';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function TagManagement() {
  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list()
  });

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Tag Management</h1>
          <p className="text-slate-400">Create and manage evidence tags for organization and filtering</p>
        </div>

        <Card className="bg-slate-900/50 border-slate-800 p-6">
          <div className="space-y-4">
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <h3 className="text-white font-semibold mb-2">About Evidence Tags</h3>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• Tags are user-applied metadata for evidence organization</li>
                <li>• Tags do not modify evidence contents or integrity hashes</li>
                <li>• All tag operations are logged in the audit trail</li>
                <li>• Tags can be scoped to cases, organization, or personal use</li>
              </ul>
            </div>

            <TagManager caseId={null} />
          </div>
        </Card>

        {cases.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Case-Specific Tags</h2>
            <div className="space-y-4">
              {cases.map((caseItem) => (
                <details key={caseItem.id} className="bg-slate-800/50 rounded-lg p-4">
                  <summary className="text-white font-medium cursor-pointer hover:text-blue-400">
                    {caseItem.title} ({caseItem.case_number})
                  </summary>
                  <div className="mt-4">
                    <TagManager caseId={caseItem.id} />
                  </div>
                </details>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}