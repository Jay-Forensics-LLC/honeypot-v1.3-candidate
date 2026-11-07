import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Globe } from 'lucide-react';

export default function ThreatMapWidget({ logs }) {
  const geoData = useMemo(() => {
    const countries = {};
    
    logs.forEach(log => {
      if (log.geo_location?.country) {
        const country = log.geo_location.country;
        if (!countries[country]) {
          countries[country] = {
            country,
            count: 0,
            critical: 0,
            threat_score: 0
          };
        }
        
        countries[country].count++;
        
        if (log.severity === 'critical' || log.severity === 'error') {
          countries[country].critical++;
        }
        
        if (log.threat_indicators && log.threat_indicators.length > 0) {
          countries[country].threat_score += log.threat_indicators.reduce(
            (sum, ind) => sum + (ind.threat_score || 0), 
            0
          );
        }
      }
    });

    return Object.values(countries)
      .sort((a, b) => b.threat_score - a.threat_score)
      .slice(0, 10);
  }, [logs]);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Globe className="w-5 h-5 text-blue-400" />
          Geographic Threat Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        {geoData.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">No geographic data available</p>
          </div>
        ) : (
          <div className="space-y-3">
            {geoData.map((country, idx) => (
              <div
                key={country.country}
                className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Badge className="bg-blue-500/20 text-blue-300">
                    #{idx + 1}
                  </Badge>
                  <div>
                    <p className="font-medium text-white">{country.country}</p>
                    <p className="text-xs text-slate-400">
                      {country.count} events • {country.critical} critical
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-400">
                      Threat: {country.threat_score.toFixed(0)}
                    </p>
                  </div>
                  <div className="w-32 bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-yellow-500 to-red-500 h-2 rounded-full"
                      style={{
                        width: `${Math.min(100, (country.threat_score / 100) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}