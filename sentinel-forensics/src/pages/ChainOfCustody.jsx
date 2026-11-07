import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Users, Clock, Shield, CheckCircle, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ChainOfCustody() {
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({
    action: 'transferred',
    actor_name: '',
    actor_email: '',
    actor_badge: '',
    location: '',
    witness_name: '',
    purpose: '',
    notes: ''
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence-with-custody'],
    queryFn: async () => {
      return base44.entities.EvidenceV2.list('-created_date', 50);
    },
    initialData: []
  });

  const { data: custodyLogs = [] } = useQuery({
    queryKey: ['custody-logs', selectedEvidence?.id],
    queryFn: async () => {
      if (!selectedEvidence) return [];
      return base44.entities.ChainOfCustodyLog.filter(
        { evidence_id: selectedEvidence.id },
        '-timestamp'
      );
    },
    enabled: !!selectedEvidence,
    initialData: []
  });

  const addCustodyEntryMutation = useMutation({
    mutationFn: async (entryData) => {
      const logEntryId = `COC-${Date.now()}`;
      const timestamp = new Date().toISOString();

      // Get previous entry for hash chain
      const previousEntry = custodyLogs[0]; // Most recent
      const previousHash = previousEntry?.entry_hash || '0'.repeat(64);

      // Create entry data
      const entry = {
        evidence_id: selectedEvidence.id,
        log_entry_id: logEntryId,
        timestamp,
        ...entryData,
        actor_email: entryData.actor_email || user?.email,
        integrity_hash: selectedEvidence.file_hash_sha256,
        previous_entry_hash: previousHash
      };

      // Calculate entry hash
      const entryString = JSON.stringify(entry);
      const encoder = new TextEncoder();
      const data = encoder.encode(entryString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const entryHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      entry.entry_hash = entryHash;

      return base44.entities.ChainOfCustodyLog.create(entry);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['custody-logs'] });
      setAddDialogOpen(false);
      setNewEntry({
        action: 'transferred',
        actor_name: '',
        actor_email: '',
        actor_badge: '',
        location: '',
        witness_name: '',
        purpose: '',
        notes: ''
      });

      // Update evidence chain_of_custody array too
      await base44.entities.EvidenceV2.update(selectedEvidence.id, {
        chain_of_custody: [
          ...(selectedEvidence.chain_of_custody || []),
          {
            timestamp: new Date().toISOString(),
            action: newEntry.action,
            performed_by: newEntry.actor_email || user?.email,
            integrity_hash: selectedEvidence.file_hash_sha256
          }
        ]
      });

      toast.success('Chain of custody entry added');
    },
    onError: (error) => {
      toast.error('Failed to add entry: ' + error.message);
    }
  });

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Chain of Custody Ledger</h1>
          <p className="text-slate-400">Immutable append-only custody records with cryptographic verification</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
        {/* Evidence Selection */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Select Evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
            {evidence.map(item => (
              <Card
                key={item.id}
                className={`cursor-pointer transition-all ${
                  selectedEvidence?.id === item.id
                    ? 'bg-blue-900/30 border-blue-500'
                    : 'bg-slate-800/50 border-slate-700 hover:border-blue-500/50'
                }`}
                onClick={() => setSelectedEvidence(item)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-white font-semibold mb-1">{item.title}</h4>
                      <div className="flex gap-2 text-xs">
                        <Badge className="bg-purple-500/20 text-purple-400">
                          {item.evidence_number}
                        </Badge>
                        {item.legal_hold && (
                          <Badge className="bg-red-500/20 text-red-400">
                            <Shield className="w-3 h-3 mr-1" />
                            LOCKED
                          </Badge>
                        )}
                      </div>
                    </div>
                    {selectedEvidence?.id === item.id && (
                      <CheckCircle className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        {/* Custody Log */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <span>Custody Log</span>
              {selectedEvidence && (
                <Button
                  size="sm"
                  onClick={() => setAddDialogOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={selectedEvidence.legal_hold}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Entry
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
            {!selectedEvidence ? (
              <p className="text-slate-400 text-center py-12">
                Select evidence to view custody log
              </p>
            ) : custodyLogs.length === 0 ? (
              <p className="text-slate-400 text-center py-12">
                No custody entries yet
              </p>
            ) : (
              custodyLogs.map((log, idx) => (
                <Card key={log.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-blue-400">{idx + 1}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <Badge className="bg-purple-500/20 text-purple-400">
                            {log.action}
                          </Badge>
                          <span className="text-xs text-slate-400">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <p className="text-white">
                            <Users className="w-3 h-3 inline mr-1" />
                            {log.actor_name} ({log.actor_email})
                          </p>
                          {log.location && (
                            <p className="text-slate-400">Location: {log.location}</p>
                          )}
                          {log.purpose && (
                            <p className="text-slate-400">Purpose: {log.purpose}</p>
                          )}
                          {log.witness_name && (
                            <p className="text-slate-400">Witness: {log.witness_name}</p>
                          )}
                          {log.notes && (
                            <p className="text-slate-300 mt-2 italic">{log.notes}</p>
                          )}
                          <div className="mt-2 pt-2 border-t border-slate-700">
                            <p className="text-xs text-slate-500 font-mono break-all">
                              Hash: {log.entry_hash?.substring(0, 32)}...
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Add Entry Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Custody Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-white">Action</Label>
              <Select
                value={newEntry.action}
                onValueChange={(value) => setNewEntry({...newEntry, action: value})}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="collected">Collected</SelectItem>
                  <SelectItem value="transferred">Transferred</SelectItem>
                  <SelectItem value="analyzed">Analyzed</SelectItem>
                  <SelectItem value="stored">Stored</SelectItem>
                  <SelectItem value="retrieved">Retrieved</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="modified">Modified</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="text-white">Actor Name</Label>
                <Input
                  value={newEntry.actor_name}
                  onChange={(e) => setNewEntry({...newEntry, actor_name: e.target.value})}
                  placeholder="Full name"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              <div>
                <Label className="text-white">Badge Number</Label>
                <Input
                  value={newEntry.actor_badge}
                  onChange={(e) => setNewEntry({...newEntry, actor_badge: e.target.value})}
                  placeholder="Badge or ID"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="text-white">Location</Label>
                <Input
                  value={newEntry.location}
                  onChange={(e) => setNewEntry({...newEntry, location: e.target.value})}
                  placeholder="Physical location"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              <div>
                <Label className="text-white">Witness</Label>
                <Input
                  value={newEntry.witness_name}
                  onChange={(e) => setNewEntry({...newEntry, witness_name: e.target.value})}
                  placeholder="Witness name (if applicable)"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
            </div>

            <div>
              <Label className="text-white">Purpose</Label>
              <Input
                value={newEntry.purpose}
                onChange={(e) => setNewEntry({...newEntry, purpose: e.target.value})}
                placeholder="Reason for action"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div>
              <Label className="text-white">Notes</Label>
              <Textarea
                value={newEntry.notes}
                onChange={(e) => setNewEntry({...newEntry, notes: e.target.value})}
                placeholder="Additional notes"
                className="bg-slate-800 border-slate-700 h-24"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setAddDialogOpen(false)}
                className="border-slate-700"
              >
                Cancel
              </Button>
              <Button
                onClick={() => addCustodyEntryMutation.mutate(newEntry)}
                disabled={!newEntry.actor_name || addCustodyEntryMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {addCustodyEntryMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Entry
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}