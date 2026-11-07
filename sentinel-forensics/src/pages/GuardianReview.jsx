import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Eye, Shield } from 'lucide-react';
import { format } from 'date-fns';

export default function GuardianReview() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const caseId = urlParams.get('case');

  const { data: caseData, isLoading } = useQuery({
    queryKey: ['guardian-case', caseId],
    queryFn: async () => {
      // Verify read-only token via backend
      const response = await base44.functions.invoke('verifyGuardianToken', { token, case_id: caseId });
      if (!response.data.valid) {
        throw new Error('Invalid or expired access token');
      }
      
      // Fetch case data (server validates token has access)
      const cases = await base44.entities.Case.filter({ id: caseId });
      return cases[0];
    },
    enabled: !!token && !!caseId,
    retry: false
  });

  const { data: evidence = [] } = useQuery({
    queryKey: ['guardian-evidence', caseId],
    queryFn: async () => {
      try {
        return await base44.entities.EvidenceV2.filter({ case_id: caseId });
      } catch {
        return [];
      }
    },
    enabled: !!caseData,
    initialData: []
  });

  if (!token || !caseId) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="bg-red-900/20 border-red-500/30">
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-red-400" />
            <h2 className="text-xl font-bold text-red-300 mb-2">Access Denied</h2>
            <p className="text-red-200">Invalid access link</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
            <p className="text-slate-400 mt-4">Verifying access...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Watermark */}
      <div className="fixed top-0 left-0 right-0 bg-yellow-900/20 border-b border-yellow-500/30 p-2 text-center z-50">
        <p className="text-yellow-300 text-sm font-semibold">
          READ-ONLY REVIEW MODE - WATERMARKED COPY FOR LEGAL REVIEW
        </p>
      </div>

      <div className="mt-12">
        <h1 className="text-3xl font-bold text-white mb-2">Case Review</h1>
        <Badge className="bg-purple-500/20 text-purple-400">
          <Eye className="w-3 h-3 mr-1" />
          Guardian Access
        </Badge>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Case Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-slate-400 text-sm">Case Number</Label>
            <p className="text-white font-semibold">{caseData?.case_number}</p>
          </div>
          <div>
            <Label className="text-slate-400 text-sm">Title</Label>
            <p className="text-white">{caseData?.title}</p>
          </div>
          <div>
            <Label className="text-slate-400 text-sm">Description</Label>
            <p className="text-white">{caseData?.description}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label className="text-slate-400 text-sm">Status</Label>
              <Badge className="bg-blue-500/20 text-blue-400">{caseData?.status}</Badge>
            </div>
            <div>
              <Label className="text-slate-400 text-sm">Priority</Label>
              <Badge className="bg-orange-500/20 text-orange-400">{caseData?.priority}</Badge>
            </div>
            <div>
              <Label className="text-slate-400 text-sm">Created</Label>
              <p className="text-white text-sm">
                {caseData?.created_date && format(new Date(caseData.created_date), 'MMM d, yyyy')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Evidence ({evidence.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {evidence.map(item => (
            <Card key={item.id} className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-white font-semibold mb-1">{item.title}</h4>
                    <p className="text-sm text-slate-400 mb-2">{item.description}</p>
                    <div className="flex gap-2 text-xs">
                      <Badge className="bg-purple-500/20 text-purple-400">{item.evidence_type}</Badge>
                      <Badge className="bg-slate-500/20 text-slate-400">
                        {item.evidence_number}
                      </Badge>
                    </div>
                  </div>
                  {item.file_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(item.file_url, '_blank')}
                      className="border-slate-600"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 text-center">
        <p className="text-xs text-slate-500">
          This is a read-only watermarked copy for legal review purposes only.
          <br />
          Generated: {new Date().toLocaleString()}
        </p>
      </div>
    </div>
  );
}