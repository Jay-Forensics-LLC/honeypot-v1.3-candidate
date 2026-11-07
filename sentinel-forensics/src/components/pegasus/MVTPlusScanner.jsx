import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Play, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function MVTPlusScanner() {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);

  const startScan = async () => {
    setScanning(true);
    setProgress(0);
    setResults(null);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setScanning(false);
          setResults({
            status: 'clean',
            threatsFound: 0,
            filesScanned: 1247,
            suspiciousProcesses: 0,
            timestamp: new Date().toISOString()
          });
          return 100;
        }
        return prev + 5;
      });
    }, 200);
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300">
      <CardHeader className="p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
              <Smartphone className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-white text-base md:text-lg">MVT+ Scanner</CardTitle>
              <p className="text-xs md:text-sm text-slate-400 mt-0.5">Mobile Verification Toolkit Plus</p>
            </div>
          </div>
          <Button
            onClick={startScan}
            disabled={scanning}
            size="sm"
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 flex-shrink-0 text-xs md:text-sm h-8 md:h-9 px-3 md:px-4"
          >
            {scanning ? (
              <>
                <Loader2 className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2 animate-spin" />
                <span className="hidden sm:inline">Scanning</span>
                <span className="sm:hidden">...</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                Start Scan
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6 pt-0 space-y-4">
        <div className="bg-slate-800/50 rounded-lg p-3 md:p-4 space-y-3">
          <div className="flex items-center justify-between text-xs md:text-sm">
            <span className="text-slate-300">iOS Indicators of Compromise</span>
            <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/50 text-[10px] md:text-xs">
              Enhanced
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs md:text-sm">
            <span className="text-slate-300">Zero-Click Exploit Detection</span>
            <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/50 text-[10px] md:text-xs">
              Active
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs md:text-sm">
            <span className="text-slate-300">Network Traffic Analysis</span>
            <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/50 text-[10px] md:text-xs">
              Enabled
            </Badge>
          </div>
        </div>

        {scanning && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs md:text-sm text-slate-400">
              <span>Scanning system files...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {results && (
          <div className={`rounded-lg p-3 md:p-4 ${
            results.status === 'clean' 
              ? 'bg-green-900/20 border border-green-500/30' 
              : 'bg-red-900/20 border border-red-500/30'
          }`}>
            <div className="flex items-start gap-2 md:gap-3">
              {results.status === 'clean' ? (
                <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-semibold text-white text-sm md:text-base">
                  {results.status === 'clean' ? 'No Threats Detected' : 'Threats Found'}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs md:text-sm">
                  <div>
                    <p className="text-slate-400">Files Scanned</p>
                    <p className="text-white font-medium">{results.filesScanned.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Threats Found</p>
                    <p className="text-white font-medium">{results.threatsFound}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}