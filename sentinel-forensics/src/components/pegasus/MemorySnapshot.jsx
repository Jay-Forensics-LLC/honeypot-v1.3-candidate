import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HardDrive, Camera, Download, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function MemorySnapshot() {
  const [capturing, setCapturing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [snapshot, setSnapshot] = useState(null);

  const captureSnapshot = () => {
    setCapturing(true);
    setProgress(0);
    
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setCapturing(false);
          setSnapshot({
            timestamp: new Date().toISOString(),
            size: '2.4 GB',
            hash: 'sha256:7d8e9f2a1b3c4d5e6f7a8b9c0d1e2f3a',
            processes: 247,
            threads: 1823
          });
          return 100;
        }
        return prev + 2;
      });
    }, 100);
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300">
      <CardHeader className="p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
              <HardDrive className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-white text-base md:text-lg">Memory Snapshot</CardTitle>
              <p className="text-xs md:text-sm text-slate-400 mt-0.5">Forensic RAM capture</p>
            </div>
          </div>
          <Button
            onClick={captureSnapshot}
            disabled={capturing}
            size="sm"
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 flex-shrink-0 text-xs md:text-sm h-8 md:h-9 px-3 md:px-4"
          >
            <Camera className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2" />
            <span className="hidden sm:inline">Capture</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6 pt-0 space-y-4">
        {capturing && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs md:text-sm text-slate-400">
              <span>Capturing memory snapshot...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {snapshot && (
          <div className="space-y-3 md:space-y-4">
            <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3 md:p-4">
              <div className="flex items-start gap-2 md:gap-3">
                <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-green-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-green-200 text-sm md:text-base mb-2">Snapshot Captured Successfully</p>
                  <div className="grid grid-cols-2 gap-2 text-xs md:text-sm">
                    <div>
                      <p className="text-green-300/70">Size</p>
                      <p className="text-green-200 font-mono">{snapshot.size}</p>
                    </div>
                    <div>
                      <p className="text-green-300/70">Processes</p>
                      <p className="text-green-200 font-mono">{snapshot.processes}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3 md:p-4">
              <p className="text-xs md:text-sm text-slate-400 mb-2">SHA-256 Hash</p>
              <p className="text-[10px] md:text-xs text-white font-mono break-all bg-slate-900/50 p-2 rounded">
                {snapshot.hash}
              </p>
            </div>

            <Button className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-sm md:text-base">
              <Download className="w-4 h-4 mr-2" />
              Download Snapshot
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}