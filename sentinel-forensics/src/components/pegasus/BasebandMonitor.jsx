import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Radio, Activity, Shield } from 'lucide-react';

export default function BasebandMonitor() {
  const [monitoring, setMonitoring] = useState(false);
  const [stats, setStats] = useState({
    smsIntercepted: 0,
    callsMonitored: 0,
    dataLeaks: 0
  });

  const toggleMonitoring = () => {
    setMonitoring(!monitoring);
    if (!monitoring) {
      setStats({
        smsIntercepted: Math.floor(Math.random() * 5),
        callsMonitored: Math.floor(Math.random() * 10),
        dataLeaks: 0
      });
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl hover:shadow-xl hover:shadow-purple-500/10 transition-all duration-300">
      <CardHeader className="p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-500/20">
              <Radio className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-white text-base md:text-lg">Baseband Monitor</CardTitle>
              <p className="text-xs md:text-sm text-slate-400 mt-0.5">Cellular firmware integrity check</p>
            </div>
          </div>
          <Button
            onClick={toggleMonitoring}
            size="sm"
            variant={monitoring ? "destructive" : "default"}
            className={`flex-shrink-0 text-xs md:text-sm h-8 md:h-9 px-3 md:px-4 ${
              !monitoring && 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
            }`}
          >
            {monitoring ? (
              <>
                <Activity className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2 animate-pulse" />
                <span className="hidden sm:inline">Stop</span>
              </>
            ) : (
              <>
                <Shield className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                <span className="hidden sm:inline">Start Monitor</span>
                <span className="sm:hidden">Start</span>
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6 pt-0">
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <div className="bg-slate-800/50 rounded-lg p-3 md:p-4 text-center">
            <p className="text-xs md:text-sm text-slate-400 mb-1 md:mb-2">SMS Intercepts</p>
            <p className="text-xl md:text-2xl font-bold text-white">{stats.smsIntercepted}</p>
            <Badge className="mt-1 md:mt-2 bg-green-500/20 text-green-400 text-[10px] md:text-xs">
              Clean
            </Badge>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 md:p-4 text-center">
            <p className="text-xs md:text-sm text-slate-400 mb-1 md:mb-2">Call Monitor</p>
            <p className="text-xl md:text-2xl font-bold text-white">{stats.callsMonitored}</p>
            <Badge className="mt-1 md:mt-2 bg-green-500/20 text-green-400 text-[10px] md:text-xs">
              Secure
            </Badge>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 md:p-4 text-center">
            <p className="text-xs md:text-sm text-slate-400 mb-1 md:mb-2">Data Leaks</p>
            <p className="text-xl md:text-2xl font-bold text-white">{stats.dataLeaks}</p>
            <Badge className="mt-1 md:mt-2 bg-green-500/20 text-green-400 text-[10px] md:text-xs">
              None
            </Badge>
          </div>
        </div>

        {monitoring && (
          <div className="mt-4 p-3 md:p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
            <p className="text-xs md:text-sm text-purple-200">
              <Activity className="w-3 h-3 md:w-4 md:h-4 inline mr-2 animate-pulse" />
              Real-time monitoring active. Analyzing baseband firmware for unauthorized modifications...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}