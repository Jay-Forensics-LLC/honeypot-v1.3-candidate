import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Scale,
  Shield,
  CheckCircle,
  Printer,
  FileText,
  Loader2
} from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';

export default function CourtroomModeView({ evidenceId, caseId }) {
  const { data: evidence, isLoading: evidenceLoading } = useQuery({
    queryKey: ['evidence', evidenceId],
    queryFn: async () => {
      const items = await base44.entities.EvidenceV2.filter({ id: evidenceId });
      return items[0];
    }
  });

  const { data: caseData } = useQuery({
    queryKey: ['case', caseId],
    queryFn: async () => {
      const cases = await base44.entities.Case.filter({ id: caseId });
      return cases[0];
    },
    enabled: !!caseId
  });

  const { data: anchors = [] } = useQuery({
    queryKey: ['blockchain-anchors', evidenceId],
    queryFn: () => base44.entities.BlockchainAnchor.filter({ evidence_id: evidenceId }, 'block_index')
  });

  const { data: exhibits = [] } = useQuery({
    queryKey: ['exhibits', evidenceId],
    queryFn: () => base44.entities.ExhibitAssignment.filter({ evidence_id: evidenceId })
  });

  const handlePrint = () => {
    window.print();
  };

  if (evidenceLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400" />
      </div>
    );
  }

  const exhibit = exhibits[0];
  const chainValid = anchors.length > 0 && anchors.every(a => a.verified);

  return (
    <div className="bg-white text-black p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b-2 border-black pb-6 mb-6 print:border-black">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Scale className="w-12 h-12 text-black" />
            <div>
              <h1 className="text-2xl font-bold">COURT EXHIBIT CERTIFICATION</h1>
              <p className="text-sm text-gray-600">Chain of Custody Declaration</p>
            </div>
          </div>
          <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 print:hidden">
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
        </div>

        {chainValid && (
          <div className="bg-green-50 border-2 border-green-600 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div>
                <p className="font-bold text-green-800">BLOCKCHAIN VERIFIED</p>
                <p className="text-sm text-green-700">
                  Cryptographic integrity confirmed via distributed ledger
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Evidence Information */}
      <div className="mb-8">
        <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-4">EVIDENCE INFORMATION</h2>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600 font-semibold">Exhibit Number:</p>
            <p className="font-mono text-lg">{exhibit?.exhibit_number || 'NOT ASSIGNED'}</p>
          </div>
          <div>
            <p className="text-gray-600 font-semibold">Evidence ID:</p>
            <p className="font-mono">{evidenceId}</p>
          </div>
          <div className="col-span-2">
            <p className="text-gray-600 font-semibold">Title:</p>
            <p>{evidence?.title}</p>
          </div>
          <div className="col-span-2">
            <p className="text-gray-600 font-semibold">Description:</p>
            <p>{evidence?.description || 'N/A'}</p>
          </div>
          <div>
            <p className="text-gray-600 font-semibold">Type:</p>
            <p>{evidence?.evidence_type?.replace('_', ' ')}</p>
          </div>
          <div>
            <p className="text-gray-600 font-semibold">Collection Date:</p>
            <p>{DateUtils.safeFormatDateTime(evidence?.collection_timestamp)}</p>
          </div>
          <div>
            <p className="text-gray-600 font-semibold">Collected By:</p>
            <p>{evidence?.collected_by}</p>
          </div>
          <div>
            <p className="text-gray-600 font-semibold">Case:</p>
            <p>{caseData?.case_number} - {caseData?.title}</p>
          </div>
        </div>
      </div>

      {/* Cryptographic Verification */}
      <div className="mb-8">
        <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-4">CRYPTOGRAPHIC VERIFICATION</h2>
        
        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="text-gray-600 font-semibold mb-2">SHA-256 Hash:</p>
          <p className="font-mono text-xs break-all bg-white p-2 rounded border border-gray-300">
            {evidence?.sha256_hash}
          </p>
          
          {evidence?.integrity_verified && (
            <div className="mt-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-green-800 font-semibold">
                Hash integrity verified on {DateUtils.safeFormatDate(evidence.integrity_last_check)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Blockchain Chain of Custody */}
      <div className="mb-8">
        <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-4">
          BLOCKCHAIN CHAIN OF CUSTODY ({anchors.length} Transactions)
        </h2>

        {anchors.length === 0 ? (
          <p className="text-gray-500 italic">No blockchain records</p>
        ) : (
          <div className="space-y-4">
            {anchors.map((anchor, idx) => (
              <div key={anchor.id} className="border-l-4 border-blue-600 pl-4 py-2">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold">Block #{anchor.block_index}: {anchor.action_description}</p>
                    <p className="text-sm text-gray-600">
                      By: {anchor.actor_email}
                    </p>
                  </div>
                  {anchor.verified && (
                    <Badge className="bg-green-600 text-white">VERIFIED</Badge>
                  )}
                </div>

                <div className="text-xs text-gray-600 space-y-1 mt-2">
                  <p>
                    <strong>Timestamp:</strong> {DateUtils.safeFormatDateTime(anchor.timestamp)}
                  </p>
                  <p>
                    <strong>Transaction Hash:</strong>{' '}
                    <span className="font-mono">{anchor.transaction_hash.substring(0, 32)}...</span>
                  </p>
                  {idx > 0 && (
                    <p>
                      <strong>Previous Block:</strong>{' '}
                      <span className="font-mono">{anchor.previous_transaction_hash.substring(0, 32)}...</span>
                    </p>
                  )}
                  <p>
                    <strong>Actor Signature:</strong>{' '}
                    <span className="font-mono">{anchor.actor_signature?.substring(0, 32)}...</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legal Certification */}
      <div className="border-t-2 border-black pt-6 mt-8">
        <h2 className="text-xl font-bold mb-4">LEGAL CERTIFICATION</h2>
        <div className="bg-gray-50 p-6 rounded-lg">
          <p className="mb-4">
            I hereby certify that the above evidence was collected, stored, and maintained in accordance 
            with digital forensic best practices and legal standards. The blockchain-anchored chain of 
            custody demonstrates that:
          </p>
          <ul className="list-disc list-inside space-y-2 mb-6 text-sm">
            <li>Evidence integrity has been cryptographically verified via SHA-256 hashing</li>
            <li>All custody transfers are recorded with dual digital signatures</li>
            <li>The complete audit trail is immutable and independently verifiable</li>
            <li>No tampering or unauthorized modification has occurred</li>
            <li>Collection methodology complies with F.S. 90.803(6) business records exception</li>
          </ul>

          <div className="grid grid-cols-2 gap-8 mt-8 pt-8 border-t border-gray-300">
            <div>
              <p className="text-sm text-gray-600 mb-2">Custodian Signature:</p>
              <div className="border-b-2 border-black h-16"></div>
              <p className="text-xs text-gray-500 mt-1">Print Name: _____________________</p>
              <p className="text-xs text-gray-500">Date: _____________________</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-2">Witness Signature:</p>
              <div className="border-b-2 border-black h-16"></div>
              <p className="text-xs text-gray-500 mt-1">Print Name: _____________________</p>
              <p className="text-xs text-gray-500">Date: _____________________</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-gray-300 text-xs text-gray-500">
        <p>Generated: {new Date().toLocaleString()}</p>
        <p>Platform: Sentinel Forensics Digital Evidence Management System</p>
        <p className="mt-2">
          <strong>For Court Use:</strong> This certification may be filed as a business record under 
          Florida Statute 90.803(6) and Federal Rule of Evidence 803(6).
        </p>
      </div>
    </div>
  );
}