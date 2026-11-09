import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Printer, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../components/utils';

export default function EvidencePinning() {
  const [showOnlyPinned, setShowOnlyPinned] = useState(false);
  const queryClient = useQueryClient();

  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence-pinned', showOnlyPinned],
    queryFn: async () => {
      try {
        const allEvidence = await base44.entities.EvidenceV2.list('-created_date');
        if (showOnlyPinned) {
          return allEvidence.filter(e => e.pinned === true);
        }
        return allEvidence;
      } catch {
        return [];
      }
    },
    initialData: []
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ evidenceId, currentPinned }) => {
      return base44.entities.EvidenceV2.update(evidenceId, {
        pinned: !currentPinned
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-pinned'] });
      toast.success('Pin status updated');
    }
  });

  const printPack = () => {
    const pinnedEvidence = evidence.filter(e => e.pinned);
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Pinned Evidence Pack</title>
          <style>
            body { font-family: Arial; margin: 40px; }
            h1 { color: #333; }
            .evidence { margin-bottom: 30px; page-break-inside: avoid; }
            .hash { font-family: monospace; font-size: 11px; background: #f5f5f5; padding: 5px; }
          </style>
        </head>
        <body>
          <h1>Critical Evidence Pack</h1>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <p>Total Items: ${pinnedEvidence.length}</p>
          <hr/>
          ${pinnedEvidence.map((e, idx) => `
            <div class="evidence">
              <h2>${idx + 1}. ${e.title}</h2>
              <p><strong>Evidence #:</strong> ${e.evidence_number}</p>
              <p><strong>Type:</strong> ${e.evidence_type}</p>
              <p><strong>Collected:</strong> ${new Date(e.collection_timestamp || e.created_date).toLocaleString()}</p>
              <p><strong>Description:</strong> ${e.description || 'N/A'}</p>
              <p class="hash"><strong>SHA-256:</strong> ${e.file_hash_sha256 || 'N/A'}</p>
            </div>
          `).join('')}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Critical Evidence</h1>
          <p className="text-slate-400">Star important artifacts for quick access</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowOnlyPinned(!showOnlyPinned)}
            className="border-slate-700"
          >
            <Filter className="w-4 h-4 mr-2" />
            {showOnlyPinned ? 'Show All' : 'Show Pinned Only'}
          </Button>
          <Button
            onClick={printPack}
            disabled={evidence.filter(e => e.pinned).length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print Pack
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {evidence.map(item => (
          <Card key={item.id} className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-all">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => togglePinMutation.mutate({ evidenceId: item.id, currentPinned: item.pinned })}
                    className={item.pinned ? 'text-yellow-400' : 'text-slate-600'}
                  >
                    <Star className={`w-6 h-6 ${item.pinned ? 'fill-yellow-400' : ''}`} />
                  </Button>

                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                    <div className="flex gap-2 mb-2">
                      <Badge className="bg-purple-500/20 text-purple-400">
                        {item.evidence_type}
                      </Badge>
                      {item.pinned && (
                        <Badge className="bg-yellow-500/20 text-yellow-400">
                          <Star className="w-3 h-3 mr-1 fill-yellow-400" />
                          Pinned
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-400">{item.description}</p>
                  </div>
                </div>

                <Link to={createPageUrl(`EvidenceDetail?id=${item.id}`)}>
                  <Button size="sm" variant="outline" className="border-slate-700">
                    View Details
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}