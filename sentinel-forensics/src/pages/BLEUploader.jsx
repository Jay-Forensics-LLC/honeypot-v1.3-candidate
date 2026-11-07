
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  Radio
} from 'lucide-react';
import { toast } from 'sonner';

export default function BLEUploader() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState(null);
  const [sessionName, setSessionName] = useState('');
  const [locationTag, setLocationTag] = useState('');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      if (!sessionName) {
        throw new Error('Session name is required');
      }

      setUploadProgress(10);

      // Upload file to storage
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploadProgress(40);

      // Calculate file hash
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      setUploadProgress(70);

      // Create scan session
      const session = await base44.entities.ScanSession.create({
        session_id: `BLE-${Date.now()}`,
        session_type: 'ble',
        location_tag: locationTag || 'Uploaded via BLE Uploader',
        start_timestamp: new Date().toISOString(),
        status: 'analyzing',
        risk_score: 0,
        anomaly_count: 0,
        observation_count: 0,
        session_hash: fileHash,
        device_info: {
          device_id: 'web_upload',
          platform: 'web',
          user_agent: navigator.userAgent
        },
        tags: ['uploaded', 'pcap']
      });

      // Store file reference
      await base44.entities.EvidenceFile.create({
        session_id: session.session_id,
        file_id: `FILE-${Date.now()}`,
        file_name: file.name,
        file_type: 'pcap',
        file_url: file_url,
        file_size_bytes: file.size,
        file_hash_sha256: fileHash,
        uploaded_timestamp: new Date().toISOString(),
        metadata: {
          uploaded_by: user?.email,
          session_name: sessionName,
          location_tag: locationTag
        },
        encrypted: false
      });

      setUploadProgress(100);

      return {
        file_url,
        file_hash: fileHash,
        file_size: file.size,
        session_id: session.session_id,
        session: session
      };
    },
    onSuccess: (results) => {
      setUploadResults(results);
      queryClient.invalidateQueries({ queryKey: ['ble-sessions'] });
      toast.success('BLE capture uploaded successfully!', {
        description: 'File hashed and session created. Processing may take a few minutes.'
      });
    },
    onError: (error) => {
      setUploadProgress(0);
      toast.error('Upload failed: ' + error.message);
    }
  });

  const handleFileUpload = () => {
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }
    if (!sessionName.trim()) {
      toast.error('Please enter a session name');
      return;
    }
    uploadMutation.mutate(selectedFile);
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">BLE Capture Uploader</h1>
        <p className="text-slate-400">Upload Bluetooth Low Energy packet captures for stalking detection and analysis</p>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Upload BLE Capture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-white">Session Name *</Label>
            <Input
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g., Home Scan - Oct 30"
              className="bg-slate-800 border-slate-700 text-white min-h-[44px]"
              style={{ fontSize: '16px' }}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Location Tag (Optional)</Label>
            <Input
              value={locationTag}
              onChange={(e) => setLocationTag(e.target.value)}
              placeholder="e.g., Home, Office, Public Park"
              className="bg-slate-800 border-slate-700 text-white min-h-[44px]"
              style={{ fontSize: '16px' }}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Upload File *</Label>
            <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-500 transition-colors bg-slate-800/50">
              <Input
                type="file"
                accept=".pcap,.pcapng,.cap"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
                id="file-upload-ble"
              />
              <label htmlFor="file-upload-ble" className="cursor-pointer block">
                {selectedFile ? (
                  <div className="space-y-2">
                    <FileText className="w-12 h-12 mx-auto text-blue-400" />
                    <p className="text-white font-semibold">{selectedFile.name}</p>
                    <p className="text-sm text-slate-400">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedFile(null);
                      }}
                      className="mt-2 min-h-[44px]"
                    >
                      Change File
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-12 h-12 mx-auto text-slate-400" />
                    <p className="text-slate-300">Click to upload BLE capture</p>
                    <p className="text-sm text-slate-500">
                      Supports: .pcap, .pcapng, .cap
                    </p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-400">
                <span>Processing BLE capture...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}

          {uploadResults && (
            <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-green-200 mb-3">Upload Complete!</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-slate-800/50 rounded p-3">
                      <p className="text-green-300/70 mb-1">Session ID</p>
                      <p className="text-white font-mono text-xs">{uploadResults.session_id}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded p-3">
                      <p className="text-green-300/70 mb-1">File Size</p>
                      <p className="text-white font-mono">{(uploadResults.file_size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <div className="bg-slate-800/50 rounded p-3 col-span-2">
                      <p className="text-green-300/70 mb-1">SHA-256 Hash</p>
                      <p className="text-white font-mono text-xs truncate" title={uploadResults.file_hash}>
                        {uploadResults.file_hash.substring(0, 32)}...
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(uploadResults.file_hash);
                          toast.success('Hash copied to clipboard');
                        }}
                        className="mt-1 h-6 text-xs"
                      >
                        Copy Full Hash
                      </Button>
                    </div>
                  </div>
                  <Button
                    onClick={() => window.location.href = '/Sessions'}
                    className="mt-4 w-full bg-blue-600 hover:bg-blue-700 min-h-[44px]"
                  >
                    View in Sessions →
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Button
            onClick={handleFileUpload}
            disabled={!selectedFile || !sessionName || uploadMutation.isPending}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 min-h-[44px]"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload & Hash
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Format Help */}
      <Card className="bg-blue-900/20 border-blue-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Radio className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200">
              <p className="font-semibold mb-2">Supported Formats:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-300/80">
                <li>PCAP/PCAPNG files from Wireshark, tcpdump, or BLE sniffers</li>
                <li>Files are automatically hashed (SHA-256) for integrity verification</li>
                <li>Supports captures from Nordic nRF Sniffer, Ubertooth, or similar tools</li>
                <li>All uploads maintain chain-of-custody for legal admissibility</li>
              </ul>
              <p className="mt-3 text-sm text-blue-300">
                <strong>Capture BLE Traffic:</strong> Use nRF Sniffer for Bluetooth LE + Wireshark to capture advertising packets, GATT operations, and connection events.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
