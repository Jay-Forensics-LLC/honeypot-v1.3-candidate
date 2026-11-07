import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Map, MapPin, AlertTriangle } from 'lucide-react';

export default function PersistenceMapper() {
  const [mapping, setMapping] = useState(false);
  const [persistencePoints, setPersistencePoints] = useState([]);

  const startMapping = () => {
    setMapping(true);
    setTimeout(() => {
      setMapping(false);
      setPersistencePoints([
        { location: '/Library/LaunchDaemons', threat: 'medium', description: 'LaunchDaemon found' },
        { location: '/System/Library/Caches', threat: 'low', description: 'Cached process detected' },
        { location: 'UserDefaults plist modified', threat: 'high', description: 'Persistence mechanism active' }
      ]);
    }, 2500);
  };

  const threatColors = {
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    high: 'bg-red-500/20 text-red-400 border-red-500/50'
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl hover:shadow-xl hover:shadow-green-500/10 transition-all duration-300">
      <CardHeader className="p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-green-500/20">
              <Map className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-white text-base md:text-lg">Persistence Mapper</CardTitle>
              <p className="text-xs md:text-sm text-slate-400 mt-0.5">Identify implant locations</p>
            </div>
          </div>
          <Button
            onClick={startMapping}
            disabled={mapping}
            size="sm"
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 flex-shrink-0 text-xs md:text-sm h-8 md:h-9 px-3 md:px-4"
          >
            <MapPin className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2" />
            <span className="hidden sm:inline">Map System</span>
            <span className="sm:hidden">Map</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6 pt-0 space-y-3 md:space-y-4">
        {mapping && (
          <div className="flex items-center justify-center py-6 md:py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 md:h-12 md:w-12 border-b-2 border-green-500 mx-auto mb-3 md:mb-4"></div>
              <p className="text-xs md:text-sm text-slate-400">Mapping persistence mechanisms...</p>
            </div>
          </div>
        )}

        {persistencePoints.length > 0 && !mapping && (
          <div className="space-y-2 md:space-y-3">
            {persistencePoints.map((point, idx) => (
              <div key={idx} className="bg-slate-800/50 rounded-lg p-3 md:p-4 border border-slate-700 hover:border-slate-600 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs md:text-sm text-white font-mono break-all">{point.location}</p>
                  </div>
                  <Badge variant="outline" className={`${threatColors[point.threat]} text-[10px] md:text-xs flex-shrink-0`}>
                    {point.threat}
                  </Badge>
                </div>
                <p className="text-[10px] md:text-xs text-slate-400 ml-6 md:ml-7">{point.description}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}