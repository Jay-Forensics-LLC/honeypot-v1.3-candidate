import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Waves, Scan, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function EntropyScanner() {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);

  const startEntropyScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setResults({
        entropyScore: 87.3,
        anomalies: 2,
        encryptedFiles: 145,
        suspiciousPatterns: ['High entropy in /var/mobile', 'Unusual plist modifications']
      });
    }, 3000);
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl hover:shadow-xl hover:shadow-cyan-500/10 transition-all duration-300">
      <CardHeader className="p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-cyan-500/20">
              <Waves className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-white text-base md:text-lg">Entropy Scanner</CardTitle>
              <p className="text-xs md:text-sm text-slate-400 mt-0.5">Statistical anomaly detection</p>
            </div>
          </div>
          <Button
            onClick={startEntropyScan}
            disabled={scanning}
            size="sm"
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 flex-shrink-0 text-xs md:text-sm h-8 md:h-9 px-3 md:px-4"
          >
            <Scan className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2" />
            <span className="hidden sm:inline">Analyze</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6 pt-0 space-y-4">
        {scanning && (
          <div className="space-y-2">
            <p className="text-xs md:text-sm text-slate-400">Calculating file system entropy patterns...</p>
            <Progress value={66} className="h-2" />
          </div>
        )}

        {results && (
          <div className="space-y-3 md:space-y-4">
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 text-center">
                <p className="text-[10px] md:text-xs text-slate-400 mb-1">Entropy Score</p>
                <p className="text-lg md:text-xl font-bold text-cyan-400">{results.entropyScore}%</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 text-center">
                <p className="text-[10px] md:text-xs text-slate-400 mb-1">Anomalies</p>
                <p className="text-lg md:text-xl font-bold text-orange-400">{results.anomalies}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 text-center">
                <p className="text-[10px] md:text-xs text-slate-400 mb-1">Encrypted</p>
                <p className="text-lg md:text-xl font-bold text-purple-400">{results.encryptedFiles}</p>
              </div>
            </div>

            {results.anomalies > 0 && (
              <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-3 md:p-4">
                <div className="flex items-start gap-2 md:gap-3">
                  <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-orange-200 text-xs md:text-sm mb-2">Suspicious Patterns Detected</p>
                    <ul className="space-y-1 text-[10px] md:text-xs text-orange-300">
                      {results.suspiciousPatterns.map((pattern, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-orange-500 flex-shrink-0">•</span>
                          <span className="break-words">{pattern}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}