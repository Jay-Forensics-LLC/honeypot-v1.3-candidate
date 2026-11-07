import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, Plus, Edit } from 'lucide-react';
import CollaborativeEditor from './CollaborativeEditor';
import { toast } from 'sonner';

export default function AttorneyWorkspaceTab({ legalCaseId }) {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [newDocData, setNewDocData] = useState({
    title: '',
    document_type: 'legal_memo'
  });

  const { data: workProducts = [] } = useQuery({
    queryKey: ['attorney-work-products', legalCaseId],
    queryFn: () => base44.entities.AttorneyWorkProduct.filter({ legal_case_id: legalCaseId }),
    enabled: !!legalCaseId
  });

  const createDocMutation = useMutation({
    mutationFn: (docData) => base44.entities.AttorneyWorkProduct.create({
      ...docData,
      organization_id: user.organization_id,
      legal_case_id: legalCaseId,
      attorney_email: user.email,
      content: '',
      privilege_asserted: true
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['attorney-work-products']);
      setShowCreateDialog(false);
      setSelectedDocument(data.id);
      toast.success('Document created');
    }
  });

  if (selectedDocument) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => setSelectedDocument(null)}>
          ← Back to Documents
        </Button>
        <CollaborativeEditor workProductId={selectedDocument} />
      </div>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white">Attorney Work Product</CardTitle>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Document
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {workProducts.map(doc => (
            <div key={doc.id} 
              className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer"
              onClick={() => setSelectedDocument(doc.id)}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  <h3 className="text-white font-medium">{doc.title}</h3>
                </div>
                <Button size="sm" variant="ghost">
                  <Edit className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline">{doc.document_type.replace(/_/g, ' ')}</Badge>
                {doc.privilege_asserted && (
                  <Badge className="bg-amber-500/20 text-amber-300">Privileged</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Create Work Product Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Document title"
              value={newDocData.title}
              onChange={(e) => setNewDocData({ ...newDocData, title: e.target.value })}
              className="bg-slate-800 border-slate-700 text-white"
            />
            <select
              value={newDocData.document_type}
              onChange={(e) => setNewDocData({ ...newDocData, document_type: e.target.value })}
              className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
            >
              <option value="legal_memo">Legal Memo</option>
              <option value="strategy_note">Strategy Note</option>
              <option value="witness_prep">Witness Prep</option>
              <option value="expert_consultation">Expert Consultation</option>
              <option value="motion_draft">Motion Draft</option>
              <option value="trial_outline">Trial Outline</option>
            </select>
            <Button onClick={() => createDocMutation.mutate(newDocData)} disabled={!newDocData.title}>
              Create Document
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}