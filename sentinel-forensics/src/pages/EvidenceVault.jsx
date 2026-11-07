import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Upload,
  Download,
  Shield,
  File,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Database,
  Search
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadEvidenceFile } from '../functions/uploadEvidenceFile';
import { downloadEvidenceFile } from '../functions/downloadEvidenceFile';

export default function EvidenceVault() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [classificationFilter, setClassificationFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    file: null,
    description: '',
    classification: 'other',
    case_id: '',
    device_id: '',
    access_level: 'team'
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['evidence-files', classificationFilter],
    queryFn: async () => {
      const query = classificationFilter !== 'all' ? { classification: classificationFilter } : {};
      return await base44.entities.EvidenceFile.filter(query, '-uploaded_at', 100);
    },
    staleTime: 30000
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!formData.file) {
        throw new Error('No file selected');
      }

      const data = new FormData();
      data.append('file', formData.file);
      data.append('description', formData.description);
      data.append('classification', formData.classification);
      data.append('access_level', formData.access_level);
      if (formData.case_id) data.append('case_id', formData.case_id);
      if (formData.device_id) data.append('device_id', formData.device_id);

      const response = await uploadEvidenceFile(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-files'] });
      setUploadOpen(false);
      setFormData({
        file: null,
        description: '',
        classification: 'other',
        case_id: '',
        device_id: '',
        access_level: 'team'
      });
      toast.success('Evidence file uploaded successfully');
    },
    onError: (error) => {
      toast.error('Upload failed', { description: error.message });
    }
  });

  const downloadMutation = useMutation({
    mutationFn: async (fileId) => {
      const response = await downloadEvidenceFile({ file_id: fileId });
      return response.data;
    },
    onSuccess: (data) => {
      window.open(data.storage_url, '_blank');
      queryClient.invalidateQueries({ queryKey: ['evidence-files'] });
      toast.success('Download started');
    },
    onError: (error) => {
      toast.error('Download failed', { description: error.message });
    }
  });

  const filteredFiles = files.filter(file =>
    searchQuery ?
      file.filename_original?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.description?.toLowerCase().includes(searchQuery.toLowerCase())
    : true
  );

  const formatFileSize = (bytes) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${bytes} B`;
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Evidence Vault</h1>
            <p className="text-slate-400">Secure storage for forensic evidence files</p>
          </div>
          <Button
            onClick={() => setUploadOpen(true)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 min-h-[44px]"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Evidence
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Database className="w-10 h-10 text-blue-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{files.length}</p>
                  <p className="text-xs text-slate-400">Total Files</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-10 h-10 text-green-400" />
                <div>
                  <p className="text-3xl font-bold text-white">
                    {files.filter(f => f.scan_status === 'clean').length}
                  </p>
                  <p className="text-xs text-slate-400">Clean</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-10 h-10 text-orange-400" />
                <div>
                  <p className="text-3xl font-bold text-white">
                    {files.filter(f => f.scan_status === 'pending').length}
                  </p>
                  <p className="text-xs text-slate-400">Pending Scan</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Shield className="w-10 h-10 text-purple-400" />
                <div>
                  <p className="text-3xl font-bold text-white">
                    {files.filter(f => f.hash_verified).length}
                  </p>
                  <p className="text-xs text-slate-400">Hash Verified</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="pl-10 bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <Select value={classificationFilter} onValueChange={setClassificationFilter}>
            <SelectTrigger className="w-56 bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-white">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="memory_dump">Memory Dump</SelectItem>
              <SelectItem value="disk_image">Disk Image</SelectItem>
              <SelectItem value="log_export">Log Export</SelectItem>
              <SelectItem value="network_capture">Network Capture</SelectItem>
              <SelectItem value="malware_sample">Malware Sample</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {filteredFiles.map(file => (
            <Card key={file.id} className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <File className="w-10 h-10 text-blue-400 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold text-white">{file.filename_original}</h4>
                        <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                          {file.classification}
                        </Badge>
                        {file.scan_status === 'clean' && (
                          <Badge className="bg-green-500/20 text-green-400 text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Clean
                          </Badge>
                        )}
                        {file.scan_status === 'pending' && (
                          <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                            Scanning...
                          </Badge>
                        )}
                      </div>

                      {file.description && (
                        <p className="text-sm text-slate-400 mb-2">{file.description}</p>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-500">
                        <div>
                          <span className="text-slate-400">Size:</span> {formatFileSize(file.size_bytes)}
                        </div>
                        <div>
                          <span className="text-slate-400">Uploaded:</span> {new Date(file.uploaded_at).toLocaleDateString()}
                        </div>
                        <div>
                          <span className="text-slate-400">By:</span> {file.uploaded_by_user_id}
                        </div>
                        <div>
                          <span className="text-slate-400">Downloads:</span> {file.download_count || 0}
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 mt-2 font-mono">
                        SHA256: {file.file_hash_sha256.substring(0, 16)}...
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => downloadMutation.mutate(file.file_id)}
                    disabled={downloadMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Upload Dialog */}
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl">
            <DialogHeader>
              <DialogTitle>Upload Evidence File</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div>
                <Label className="text-white">Select File</Label>
                <Input
                  type="file"
                  onChange={(e) => setFormData({ ...formData, file: e.target.files[0] })}
                  className="bg-slate-800 border-slate-700 text-white"
                />
                {formData.file && (
                  <p className="text-xs text-slate-400 mt-1">
                    {formData.file.name} ({formatFileSize(formData.file.size)})
                  </p>
                )}
              </div>

              <div>
                <Label className="text-white">Classification</Label>
                <Select
                  value={formData.classification}
                  onValueChange={(value) => setFormData({ ...formData, classification: value })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="memory_dump">Memory Dump</SelectItem>
                    <SelectItem value="disk_image">Disk Image</SelectItem>
                    <SelectItem value="log_export">Log Export</SelectItem>
                    <SelectItem value="network_capture">Network Capture</SelectItem>
                    <SelectItem value="screenshot">Screenshot</SelectItem>
                    <SelectItem value="malware_sample">Malware Sample</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-white">Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe the evidence..."
                  className="bg-slate-800 border-slate-700 text-white h-24"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => setUploadOpen(false)}
                  variant="outline"
                  className="flex-1 border-slate-700 text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => uploadMutation.mutate()}
                  disabled={uploadMutation.isPending || !formData.file}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}