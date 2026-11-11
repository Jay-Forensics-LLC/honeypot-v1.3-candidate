import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Unlock, Plus, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CryptoUtils } from '../components/utils/CryptoUtils';
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

export default function EncryptedNotes() {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);
  const [decryptedContent, setDecryptedContent] = useState('');
  const [password, setPassword] = useState('');
  const queryClient = useQueryClient();

  const [newNote, setNewNote] = useState({
    case_id: '',
    title: '',
    content: '',
    password: ''
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date'),
    initialData: []
  });

  const { data: notes = [] } = useQuery({
    queryKey: ['encrypted-notes'],
    queryFn: async () => {
      try {
        // Create a simple EncryptedNote entity on the fly
        const allNotes = await base44.entities.EncryptedNote.list('-created_date');
        return allNotes;
      } catch {
        return [];
      }
    },
    initialData: []
  });

  const createNoteMutation = useMutation({
    mutationFn: async () => {
      if (!newNote.case_id || !newNote.title || !newNote.content || !newNote.password) {
        throw new Error('All fields required');
      }

      const encrypted = await CryptoUtils.encrypt(newNote.content, newNote.password);

      return base44.entities.EncryptedNote.create({
        case_id: newNote.case_id,
        title: newNote.title,
        encrypted_content: encrypted,
        created_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encrypted-notes'] });
      setAddDialogOpen(false);
      setNewNote({ case_id: '', title: '', content: '', password: '' });
      toast.success('Encrypted note saved!');
    },
    onError: (error) => {
      toast.error('Failed to save note: ' + error.message);
    }
  });

  const decryptNoteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedNote || !password) throw new Error('Password required');

      const decrypted = await CryptoUtils.decrypt(selectedNote.encrypted_content, password);
      return decrypted;
    },
    onSuccess: (decrypted) => {
      setDecryptedContent(decrypted);
      toast.success('Note decrypted!');
    },
    onError: () => {
      toast.error('Decryption failed - wrong password?');
    }
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Encrypted Notes</h1>
          <p className="text-slate-400">Secure, password-protected case notes</p>
        </div>
        <Button
          onClick={() => setAddDialogOpen(true)}
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Note
        </Button>
      </div>

      <div className="grid gap-4">
        {notes.map(note => (
          <Card key={note.id} className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-colors">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <Lock className="w-8 h-8 text-blue-400" />
                  <div>
                    <h3 className="text-lg font-semibold text-white">{note.title}</h3>
                    <p className="text-sm text-slate-400">
                      Created {new Date(note.created_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedNote(note);
                      setViewDialogOpen(true);
                      setDecryptedContent('');
                      setPassword('');
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {notes.length === 0 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <Lock className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 mb-4">No encrypted notes yet</p>
              <Button onClick={() => setAddDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                Create First Note
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Note Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Encrypted Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-white">Case</Label>
              <Select value={newNote.case_id} onValueChange={(val) => setNewNote({...newNote, case_id: val})}>
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

            <div>
              <Label className="text-white">Title</Label>
              <Input
                value={newNote.title}
                onChange={(e) => setNewNote({...newNote, title: e.target.value})}
                placeholder="Note title"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div>
              <Label className="text-white">Content</Label>
              <Textarea
                value={newNote.content}
                onChange={(e) => setNewNote({...newNote, content: e.target.value})}
                placeholder="Sensitive case notes..."
                className="bg-slate-800 border-slate-700 text-white h-32"
              />
            </div>

            <div>
              <Label className="text-white">Encryption Password</Label>
              <Input
                type="password"
                value={newNote.password}
                onChange={(e) => setNewNote({...newNote, password: e.target.value})}
                placeholder="Strong password"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-300">
              ⚠️ <strong>Important:</strong> Password is not recoverable. Store it securely.
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)} className="border-slate-700">
                Cancel
              </Button>
              <Button
                onClick={() => createNoteMutation.mutate()}
                disabled={createNoteMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createNoteMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Encrypting...</>
                ) : (
                  <><Lock className="w-4 h-4 mr-2" /> Save Encrypted</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Note Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedNote?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!decryptedContent ? (
              <>
                <div>
                  <Label className="text-white">Enter Password to Decrypt</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Encryption password"
                    className="bg-slate-800 border-slate-700 text-white"
                    onKeyPress={(e) => e.key === 'Enter' && decryptNoteMutation.mutate()}
                  />
                </div>
                <Button
                  onClick={() => decryptNoteMutation.mutate()}
                  disabled={!password || decryptNoteMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {decryptNoteMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Decrypting...</>
                  ) : (
                    <><Unlock className="w-4 h-4 mr-2" /> Decrypt</>
                  )}
                </Button>
              </>
            ) : (
              <div>
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 min-h-[200px]">
                  <p className="text-white whitespace-pre-wrap">{decryptedContent}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDecryptedContent('');
                    setPassword('');
                  }}
                  className="mt-4 border-slate-700"
                >
                  <EyeOff className="w-4 h-4 mr-2" />
                  Lock Again
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}