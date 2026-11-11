import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertCircle, AlertTriangle, Info, Bug, Loader2 } from 'lucide-react';
import moment from 'moment';

export default function LogStreamWidget({ logs, loading, onLogClick }) {
  const getSeverityIcon = (severity) => {
    const icons = {
      critical: <AlertCircle className="w-4 h-4 text-red-400" />,
      error: <AlertCircle className="w-4 h-4 text-orange-400" />,
      warning: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
      info: <Info className="w-4 h-4 text-blue-400" />,
      debug: <Bug className="w-4 h-4 text-slate-400" />
    };
    return icons[severity] || icons.info;
  };

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-300 border-red-500/50',
      error: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
      warning: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
      info: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
      debug: 'bg-slate-500/20 text-slate-300 border-slate-500/50'
    };
    return colors[severity] || colors.info;
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Activity className="w-5 h-5 text-green-400" />
          Live Log Stream
          {loading && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && logs.length === 0 ? (
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-slate-400" />
            <p className="text-slate-400">Loading logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">No logs found</p>
            <p className="text-xs text-slate-500 mt-2">Logs will appear here as they are ingested</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.log_id}
                onClick={() => onLogClick(log)}
                className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors border border-slate-700/50"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getSeverityIcon(log.severity)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="outline" className={getSeverityColor(log.severity)}>
                        {log.severity.toUpperCase()}
                      </Badge>
                      <Badge className="bg-blue-500/20 text-blue-300">
                        {log.event_type}
                      </Badge>
                      <Badge className="bg-purple-500/20 text-purple-300">
                        {log.source_type}
                      </Badge>
                      {log.alert_generated && (
                        <Badge className="bg-red-500/20 text-red-300">
                          🚨 ALERT
                        </Badge>
                      )}
                      <span className="text-xs text-slate-500 ml-auto">
                        {moment(log.timestamp).fromNow()}
                      </span>
                    </div>
                    
                    <p className="text-white text-sm mb-2">{log.message}</p>
                    
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>Source: {log.source_name || log.source_id}</span>
                      {log.normalized_fields?.source_ip && (
                        <span>IP: {log.normalized_fields.source_ip}</span>
                      )}
                      {log.normalized_fields?.user_id && (
                        <span>User: {log.normalized_fields.user_id}</span>
                      )}
                    </div>

                    {log.threat_indicators && log.threat_indicators.length > 0 && (
                      <div className="mt-2 flex gap-2">
                        {log.threat_indicators.map((indicator, idx) => (
                          <Badge key={idx} className="bg-red-900/30 text-red-300 text-xs">
                            {indicator.indicator_type}: {indicator.indicator_value}
                          </Badge>
                        ))}
                      </div>
                    )}
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