import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Key, Plus, Eye, EyeOff, Copy, Trash2, Lock, Shield } from 'lucide-react';
import { toast } from 'sonner';

export default function CredentialVault() {
  const [masterPassword, setMasterPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [credentials, setCredentials] = useState([]);
  const [showPassword, setShowPassword] = useState({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  const [newCred, setNewCred] = useState({
    title: '',
    username: '',
    password: '',
    url: '',
    notes: ''
  });

  useEffect(() => {
    // Try to load encrypted credentials from localStorage
    const stored = localStorage.getItem('sentinel_vault_encrypted');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Credentials are encrypted, we'll decrypt when vault is unlocked
      } catch (error) {
        console.error('Failed to load vault:', error);
      }
    }
  }, []);

  const encryptVault = async (data, password) => {
    const encoder = new TextEncoder();
    const dataString = JSON.stringify(data);
    const dataBuffer = encoder.encode(dataString);
    
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBuffer
    );
    
    const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encrypted), salt.length + iv.length);
    
    return btoa(String.fromCharCode(...result));
  };

  const decryptVault = async (encryptedData, password) => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const data = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    const salt = data.slice(0, 16);
    const iv = data.slice(16, 28);
    const encrypted = data.slice(28);
    
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    
    return JSON.parse(decoder.decode(decrypted));
  };

  const unlockVault = async () => {
    if (!masterPassword) {
      toast.error('Please enter master password');
      return;
    }

    try {
      const stored = localStorage.getItem('sentinel_vault_encrypted');
      if (stored) {
        const decrypted = await decryptVault(stored, masterPassword);
        setCredentials(decrypted);
        setIsUnlocked(true);
        toast.success('Vault unlocked');
      } else {
        // First time setup
        setCredentials([]);
        setIsUnlocked(true);
        toast.success('Vault initialized');
      }
    } catch (error) {
      toast.error('Wrong master password or corrupted vault');
      console.error(error);
    }
  };

  const lockVault = async () => {
    try {
      const encrypted = await encryptVault(credentials, masterPassword);
      localStorage.setItem('sentinel_vault_encrypted', encrypted);
      setCredentials([]);
      setIsUnlocked(false);
      setMasterPassword('');
      setShowPassword({});
      toast.success('Vault locked and saved');
    } catch (error) {
      toast.error('Failed to save vault');
      console.error(error);
    }
  };

  const addCredential = async () => {
    if (!newCred.title || !newCred.username || !newCred.password) {
      toast.error('Please fill in required fields');
      return;
    }

    const credential = {
      id: `cred-${Date.now()}`,
      ...newCred,
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    };

    const updated = [...credentials, credential];
    setCredentials(updated);
    
    try {
      const encrypted = await encryptVault(updated, masterPassword);
      localStorage.setItem('sentinel_vault_encrypted', encrypted);
      toast.success('Credential added');
    } catch (error) {
      toast.error('Failed to save credential');
    }

    setAddDialogOpen(false);
    setNewCred({ title: '', username: '', password: '', url: '', notes: '' });
  };

  const deleteCredential = async (id) => {
    const updated = credentials.filter(c => c.id !== id);
    setCredentials(updated);
    
    try {
      const encrypted = await encryptVault(updated, masterPassword);
      localStorage.setItem('sentinel_vault_encrypted', encrypted);
      toast.success('Credential deleted');
    } catch (error) {
      toast.error('Failed to delete credential');
    }
    
    setDeleteConfirm(null);
  };

  const togglePasswordVisibility = (id) => {
    setShowPassword(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  if (!isUnlocked) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-400" />
            Credential Vault
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-2">
              <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-200">
                <p className="font-semibold mb-1">Secure Credential Storage</p>
                <p>All credentials are encrypted with AES-256-GCM and stored locally. Your master password never leaves your device.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-white">Master Password</Label>
            <Input
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && unlockVault()}
              placeholder="Enter your master password"
              className="bg-slate-800 border-slate-700 text-white"
            />
            <p className="text-xs text-slate-400">
              First time? Create a strong master password to initialize your vault.
            </p>
          </div>

          <Button
            onClick={unlockVault}
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={!masterPassword}
          >
            <Lock className="w-4 h-4 mr-2" />
            Unlock Vault
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-green-400" />
              Credential Vault
              <Badge className="bg-green-500/20 text-green-400">
                Unlocked
              </Badge>
            </CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={() => setAddDialogOpen(true)}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Credential
              </Button>
              <Button
                onClick={lockVault}
                size="sm"
                variant="outline"
                className="border-red-500/50 text-red-400 hover:bg-red-500/10"
              >
                <Lock className="w-4 h-4 mr-2" />
                Lock Vault
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {credentials.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No credentials stored yet</p>
              <p className="text-sm mt-1">Click "Add Credential" to get started</p>
            </div>
          ) : (
            credentials.map((cred) => (
              <Card key={cred.id} className="bg-slate-800 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-white font-semibold mb-2">{cred.title}</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 w-20">Username:</span>
                          <span className="text-white font-mono">{cred.username}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(cred.username, 'Username')}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 w-20">Password:</span>
                          <span className="text-white font-mono">
                            {showPassword[cred.id] ? cred.password : '••••••••'}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => togglePasswordVisibility(cred.id)}
                          >
                            {showPassword[cred.id] ? (
                              <EyeOff className="w-3 h-3" />
                            ) : (
                              <Eye className="w-3 h-3" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(cred.password, 'Password')}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        {cred.url && (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 w-20">URL:</span>
                            <a
                              href={cred.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline truncate"
                            >
                              {cred.url}
                            </a>
                          </div>
                        )}
                        {cred.notes && (
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-20">Notes:</span>
                            <span className="text-slate-300 flex-1">{cred.notes}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteConfirm(cred)}
                      className="text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      {/* Add Credential Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Add New Credential</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={newCred.title}
                onChange={(e) => setNewCred({ ...newCred, title: e.target.value })}
                placeholder="e.g., GitHub Account"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Username *</Label>
              <Input
                value={newCred.username}
                onChange={(e) => setNewCred({ ...newCred, username: e.target.value })}
                placeholder="username or email"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input
                type="password"
                value={newCred.password}
                onChange={(e) => setNewCred({ ...newCred, password: e.target.value })}
                placeholder="••••••••"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                value={newCred.url}
                onChange={(e) => setNewCred({ ...newCred, url: e.target.value })}
                placeholder="https://example.com"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={newCred.notes}
                onChange={(e) => setNewCred({ ...newCred, notes: e.target.value })}
                placeholder="Additional notes..."
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              className="bg-slate-800 border-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={addCredential}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Add Credential
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Credential?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete "{deleteConfirm?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCredential(deleteConfirm.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}