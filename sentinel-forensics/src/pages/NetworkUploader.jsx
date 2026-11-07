import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  Network
} from 'lucide-react';
import { toast } from 'sonner';

export default function NetworkUploader() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState(null);
  const [caseId, setCaseId] = useState('');
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
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

      // Create network log entry
      const logEntry = await base44.entities.NetworkTrafficLog.create({
        timestamp: new Date().toISOString(),
        source_ip: 'uploaded',
        destination_ip: 'uploaded',
        protocol: 'PCAP',
        metadata: {
          file_name: file.name,
          file_size: file.size,
          file_hash: fileHash,
          file_url: file_url,
          uploaded_by: (await base44.auth.me())?.email
        },
        associated_case_id: caseId || null
      });

      setUploadProgress(100);

      return {
        file_url,
        file_hash: fileHash,
        file_size: file.size,
        log_id: logEntry.id
      };
    },
    onSuccess: (results) => {
      setUploadResults(results);
      queryClient.invalidateQueries({ queryKey: ['network-logs'] });
      toast.success('Network capture uploaded successfully!');
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
    uploadMutation.mutate(selectedFile);
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Network Capture Uploader</h1>
        <p className="text-slate-400">Upload PCAP, PCAPNG, or network log files for analysis</p>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Upload Network Capture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-white">Case ID (Optional)</Label>
            <Input
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="Link to existing case"
              className="bg-slate-800 border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Upload File</Label>
            <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-500 transition-colors bg-slate-800/50">
              <Input
                type="file"
                accept=".pcap,.pcapng,.cap,.log"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
                id="file-upload-network"
              />
              <label htmlFor="file-upload-network" className="cursor-pointer block">
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
                      className="mt-2"
                    >
                      Change File
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-12 h-12 mx-auto text-slate-400" />
                    <p className="text-slate-300">Click to upload network capture</p>
                    <p className="text-sm text-slate-500">
                      Supports: .pcap, .pcapng, .cap, .log
                    </p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-400">
                <span>Processing network capture...</span>
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
                      <p className="text-green-300/70 mb-1">File Size</p>
                      <p className="text-white font-mono">{(uploadResults.file_size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <div className="bg-slate-800/50 rounded p-3">
                      <p className="text-green-300/70 mb-1">SHA-256 Hash</p>
                      <p className="text-white font-mono text-xs truncate" title={uploadResults.file_hash}>
                        {uploadResults.file_hash.substring(0, 16)}...
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
                </div>
              </div>
            </div>
          )}

          <Button
            onClick={handleFileUpload}
            disabled={!selectedFile || uploadMutation.isPending}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
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
            <Network className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200">
              <p className="font-semibold mb-2">Supported Formats:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-300/80">
                <li>PCAP/PCAPNG files from Wireshark or tcpdump</li>
                <li>Network log files (.log, .txt)</li>
                <li>Files are automatically hashed (SHA-256) for integrity verification</li>
                <li>All uploads maintain chain-of-custody for legal admissibility</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}