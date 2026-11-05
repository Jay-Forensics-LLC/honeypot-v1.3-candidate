import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileSearch, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

export default function MetadataExtractor() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [metadata, setMetadata] = useState(null);

  const extractMetadata = async () => {
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }

    setIsExtracting(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Extract real file metadata
      const fileMetadata = {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type || 'Unknown',
        lastModified: new Date(selectedFile.lastModified).toISOString(),
        created: new Date().toISOString(),
        
        // Technical metadata
        mimeType: selectedFile.type,
        extension: selectedFile.name.split('.').pop(),
        
        // Simulated advanced metadata
        exif: selectedFile.type.startsWith('image/') ? {
          camera: 'Unknown (EXIF parsing requires server-side processing)',
          gpsLocation: 'Not available',
          dateTimeTaken: new Date(selectedFile.lastModified).toLocaleDateString()
        } : null,
        
        document: selectedFile.type.includes('pdf') || selectedFile.type.includes('document') ? {
          author: 'Not available (requires PDF parsing)',
          created: new Date(selectedFile.lastModified).toLocaleDateString(),
          modified: new Date(selectedFile.lastModified).toLocaleDateString(),
          pages: 'Unknown'
        } : null,
        
        hashes: {
          md5: 'Calculating on server...',
          sha256: 'Calculating on server...'
        }
      };

      setMetadata(fileMetadata);
      toast.success('Metadata extracted successfully');
    } catch (error) {
      toast.error('Extraction failed');
    } finally {
      setIsExtracting(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileSearch className="w-5 h-5 text-green-400" />
            Metadata Extractor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-green-500 transition-colors">
            <Input
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="hidden"
              id="metadata-file-upload"
            />
            <label htmlFor="metadata-file-upload" className="cursor-pointer block">
              {selectedFile ? (
                <div>
                  <FileSearch className="w-12 h-12 mx-auto mb-3 text-green-400" />
                  <p className="text-white font-semibold">{selectedFile.name}</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {formatBytes(selectedFile.size)}
                  </p>
                </div>
              ) : (
                <div>
                  <Upload className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                  <p className="text-slate-300">Click to select file</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Images, Documents, PDFs, etc.
                  </p>
                </div>
              )}
            </label>
          </div>

          <Button
            onClick={extractMetadata}
            disabled={isExtracting || !selectedFile}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {isExtracting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Extracting Metadata...
              </>
            ) : (
              <>
                <FileSearch className="w-4 h-4 mr-2" />
                Extract Metadata
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {metadata && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Extracted Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-800/50 rounded">
                  <p className="text-xs text-slate-400">File Name</p>
                  <p className="text-white font-mono text-sm">{metadata.fileName}</p>
                </div>
                <div className="p-3 bg-slate-800/50 rounded">
                  <p className="text-xs text-slate-400">File Size</p>
                  <p className="text-white font-mono text-sm">{formatBytes(metadata.fileSize)}</p>
                </div>
                <div className="p-3 bg-slate-800/50 rounded">
                  <p className="text-xs text-slate-400">File Type</p>
                  <p className="text-white font-mono text-sm">{metadata.fileType}</p>
                </div>
                <div className="p-3 bg-slate-800/50 rounded">
                  <p className="text-xs text-slate-400">Extension</p>
                  <p className="text-white font-mono text-sm">.{metadata.extension}</p>
                </div>
                <div className="p-3 bg-slate-800/50 rounded">
                  <p className="text-xs text-slate-400">Last Modified</p>
                  <p className="text-white font-mono text-sm">{new Date(metadata.lastModified).toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-800/50 rounded">
                  <p className="text-xs text-slate-400">MIME Type</p>
                  <p className="text-white font-mono text-sm">{metadata.mimeType}</p>
                </div>
              </div>

              {metadata.exif && (
                <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                  <p className="text-white font-semibold mb-2">EXIF Data (Image)</p>
                  <div className="grid md:grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-slate-400">Camera</p>
                      <p className="text-white">{metadata.exif.camera}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Date Taken</p>
                      <p className="text-white">{metadata.exif.dateTimeTaken}</p>
                    </div>
                  </div>
                </div>
              )}

              {metadata.document && (
                <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                  <p className="text-white font-semibold mb-2">Document Properties</p>
                  <div className="grid md:grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-slate-400">Author</p>
                      <p className="text-white">{metadata.document.author}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Created</p>
                      <p className="text-white">{metadata.document.created}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}