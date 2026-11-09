import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Lock,
  Unlock,
  Upload,
  Download,
  FileText,
  Shield,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Database,
  Tag
} from 'lucide-react';
import { toast } from 'sonner';
import { EvidenceLockerCrypto } from '../components/utils/EvidenceLockerCrypto';
import { DateUtils } from '../components/utils/DateUtils';

export default function EvidenceLocker() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadTags, setUploadTags] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [passphraseStrength, setPassphraseStrength] = useState(0);

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: artifacts = [], isLoading } = useQuery({
    queryKey: ['locker-artifacts'],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('lockerList', {
        limit: 100
      });
      return data.artifacts || [];
    },
    enabled: isUnlocked
  });

  const handleUnlock = () => {
    const validation = EvidenceLockerCrypto.validatePassphrase(passphrase);
    
    if (!validation.valid) {
      toast.error('Weak passphrase', {
        description: validation.errors.join(', ')
      });
      return;
    }

    // Store passphrase in memory only (never sent to server)
    sessionStorage.setItem('locker_passphrase', passphrase);
    setIsUnlocked(true);
    toast.success('Evidence Locker unlocked');
  };

  const handleLock = () => {
    sessionStorage.removeItem('locker_passphrase');
    setIsUnlocked(false);
    setPassphrase('');
    toast.info('Evidence Locker locked');
  };

  const handlePassphraseChange = (value) => {
    setPassphrase(value);
    const strength = EvidenceLockerCrypto.calculateStrength(value);
    setPassphraseStrength(strength);
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('No file selected');

      const storedPassphrase = sessionStorage.getItem('locker_passphrase');
      if (!storedPassphrase) throw new Error('Locker is locked');

      setUploadProgress(10);

      // Compute plaintext hash
      const plaintextHash = await EvidenceLockerCrypto.hashFile(selectedFile);
      setUploadProgress(20);

      // Encrypt file client-side
      const encrypted = await EvidenceLockerCrypto.encryptFile(selectedFile, storedPassphrase);
      setUploadProgress(50);

      // Prepare metadata
      const tags = uploadTags.split(',').map(t => t.trim()).filter(Boolean);
      const metadata = EvidenceLockerCrypto.createArtifactMetadata(
        selectedFile,
        tags,
        uploadNotes
      );

      // Create form data
      const formData = new FormData();
      formData.append('ciphertext', new Blob([encrypted.ciphertext]));
      formData.append('metadata', JSON.stringify(metadata));
      formData.append('salt', EvidenceLockerCrypto.arrayBufferToBase64(encrypted.salt));
      formData.append('iv', EvidenceLockerCrypto.arrayBufferToBase64(encrypted.iv));
      formData.append('plaintext_hash', plaintextHash);

      setUploadProgress(70);

      // Upload to server
      const response = await fetch('/api/functions/lockerUpload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await base44.auth.getToken()}`
        },
        body: formData
      });

      setUploadProgress(90);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();
      setUploadProgress(100);

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locker-artifacts'] });
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setUploadTags('');
      setUploadNotes('');
      setUploadProgress(0);
      toast.success('Artifact encrypted and uploaded');
    },
    onError: (error) => {
      setUploadProgress(0);
      toast.error('Upload failed', {
        description: error.message
      });
    }
  });

  const downloadMutation = useMutation({
    mutationFn: async (artifact) => {
      const storedPassphrase = sessionStorage.getItem('locker_passphrase');
      if (!storedPassphrase) throw new Error('Locker is locked');

      // Download encrypted artifact
      const { data } = await base44.functions.invoke('lockerDownload', {
        id: artifact.id
      });

      // Decode base64
      const ciphertext = EvidenceLockerCrypto.base64ToArrayBuffer(data.artifact.ciphertext_base64);
      const salt = EvidenceLockerCrypto.base64ToArrayBuffer(data.artifact.salt_base64);
      const iv = EvidenceLockerCrypto.base64ToArrayBuffer(data.artifact.iv_base64);

      // Decrypt client-side
      const decryptedBlob = await EvidenceLockerCrypto.decryptFile(
        ciphertext,
        salt,
        iv,
        storedPassphrase,
        data.artifact.original_type
      );

      // Trigger download
      const url = URL.createObjectURL(decryptedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.artifact.filename;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();

      return data.artifact.filename;
    },
    onSuccess: (filename) => {
      toast.success(`Decrypted: ${filename}`);
    },
    onError: (error) => {
      toast.error('Decryption failed', {
        description: error.message
      });
    }
  });

  const exportManifestMutation = useMutation({
    mutationFn: async () => {
      if (artifacts.length === 0) throw new Error('No artifacts to export');

      // Create CSV manifest
      const headers = ['Filename', 'Size (bytes)', 'Tags', 'Uploaded', 'Plaintext Hash', 'Ciphertext Hash', 'Manifest Hash'];
      const rows = artifacts.map(a => [
        a.filename,
        a.original_size,
        (a.tags || []).join('; '),
        DateUtils.safeFormatDateTime(a.upload_timestamp),
        a.plaintext_hash,
        a.ciphertext_hash,
        a.manifest_hash
      ]);

      const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

      // Download CSV
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evidence-locker-manifest-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();

      return csv;
    },
    onSuccess: () => {
      toast.success('Manifest exported as CSV');
    },
    onError: (error) => {
      toast.error('Export failed', {
        description: error.message
      });
    }
  });

  const getStrengthColor = (strength) => {
    if (strength < 40) return 'bg-red-500';
    if (strength < 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStrengthText = (strength) => {
    if (strength < 40) return 'Weak';
    if (strength < 70) return 'Medium';
    return 'Strong';
  };

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900/50 border-slate-800">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl text-white">Evidence Locker</CardTitle>
            <p className="text-sm text-slate-400 mt-2">
              Client-side AES-256-GCM encryption. Your passphrase never leaves your device.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-yellow-500/10 border-yellow-500/30">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <AlertDescription className="text-yellow-300 text-sm">
                <strong>Important:</strong> Your passphrase cannot be recovered if lost. Store it securely.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label className="text-white">Passphrase</Label>
              <div className="relative">
                <Input
                  type={showPassphrase ? 'text' : 'password'}
                  value={passphrase}
                  onChange={(e) => handlePassphraseChange(e.target.value)}
                  placeholder="Enter strong passphrase..."
                  className="bg-slate-800 border-slate-700 text-white pr-10"
                  onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
                />
                <button
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {passphrase && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Strength:</span>
                    <span className={`font-semibold ${
                      passphraseStrength < 40 ? 'text-red-400' :
                      passphraseStrength < 70 ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                      {getStrengthText(passphraseStrength)}
                    </span>
                  </div>
                  <Progress value={passphraseStrength} className="h-2" />
                </div>
              )}
            </div>

            <Button
              onClick={handleUnlock}
              disabled={!passphrase}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <Unlock className="w-4 h-4 mr-2" />
              Unlock Locker
            </Button>

            <div className="text-xs text-slate-400 text-center space-y-1">
              <p>✓ PBKDF2 key derivation (310,000 iterations)</p>
              <p>✓ AES-256-GCM encryption</p>
              <p>✓ Zero-knowledge architecture</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Evidence Locker</h1>
          <p className="text-sm md:text-base text-slate-400">
            Client-side encrypted artifact storage with hash chain integrity
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            onClick={() => setUploadDialogOpen(true)}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 flex-1 sm:flex-none"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload
          </Button>
          <Button
            onClick={handleLock}
            variant="outline"
            className="border-slate-700"
          >
            <Lock className="w-4 h-4 mr-2" />
            Lock
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <Database className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{artifacts.length}</p>
                <p className="text-xs text-slate-400">Encrypted Artifacts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {(artifacts.reduce((sum, a) => sum + (a.original_size || 0), 0) / 1024 / 1024).toFixed(2)}
                </p>
                <p className="text-xs text-slate-400">Total Size (MB)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">AES-256</p>
                <p className="text-xs text-slate-400">Encryption Standard</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => exportManifestMutation.mutate()}
          disabled={exportManifestMutation.isPending || artifacts.length === 0}
          variant="outline"
          className="border-slate-700"
        >
          {exportManifestMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FileText className="w-4 h-4 mr-2" />
          )}
          Export Manifest CSV
        </Button>
      </div>

      {/* Artifacts List */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Encrypted Artifacts</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">
              <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" />
              <p>Loading artifacts...</p>
            </div>
          ) : artifacts.length === 0 ? (
            <div className="text-center py-12">
              <Database className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 mb-4">No artifacts in locker</p>
              <Button
                onClick={() => setUploadDialogOpen(true)}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload First Artifact
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {artifacts.map((artifact) => (
                <Card key={artifact.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-white truncate">{artifact.filename}</h4>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {artifact.tags?.map(tag => (
                              <Badge key={tag} className="bg-blue-500/20 text-blue-400 text-xs">
                                <Tag className="w-3 h-3 mr-1" />
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-400">
                            <div>
                              <span className="text-slate-500">Size:</span> {(artifact.original_size / 1024).toFixed(2)} KB
                            </div>
                            <div className="truncate">
                              <span className="text-slate-500">Hash:</span> {artifact.plaintext_hash.substring(0, 16)}...
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-500">Uploaded:</span> {DateUtils.safeFormatDateTime(artifact.upload_timestamp)}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          onClick={() => downloadMutation.mutate(artifact)}
                          disabled={downloadMutation.isPending}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {downloadMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Upload & Encrypt Artifact</DialogTitle>
            <DialogDescription className="text-slate-400">
              File will be encrypted client-side with AES-256-GCM before upload
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-white">File</Label>
              <div className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center hover:border-purple-500 transition-colors">
                <Input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="artifact-upload"
                />
                <label htmlFor="artifact-upload" className="cursor-pointer block">
                  {selectedFile ? (
                    <div className="space-y-2">
                      <FileText className="w-12 h-12 mx-auto text-purple-400" />
                      <p className="text-white font-semibold">{selectedFile.name}</p>
                      <p className="text-sm text-slate-400">
                        {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-12 h-12 mx-auto text-slate-400" />
                      <p className="text-slate-300">Click to select file</p>
                      <p className="text-xs text-slate-500">Any file type supported</p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-white">Tags (comma-separated)</Label>
              <Input
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                placeholder="e.g., BLE, NETWORK, INTEGRITY"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white">Notes (optional)</Label>
              <Textarea
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                placeholder="Add any notes about this artifact..."
                className="bg-slate-800 border-slate-700 text-white h-20"
              />
            </div>

            {uploadProgress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Upload Progress</span>
                  <span className="text-white">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => {
                  setUploadDialogOpen(false);
                  setSelectedFile(null);
                  setUploadTags('');
                  setUploadNotes('');
                  setUploadProgress(0);
                }}
                disabled={uploadMutation.isPending}
                className="border-slate-700"
              >
                Cancel
              </Button>
              <Button
                onClick={() => uploadMutation.mutate()}
                disabled={!selectedFile || uploadMutation.isPending}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Encrypting...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    Encrypt & Upload
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