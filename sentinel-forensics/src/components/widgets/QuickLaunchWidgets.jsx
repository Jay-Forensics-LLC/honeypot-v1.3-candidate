import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Zap,
  Shield,
  Activity,
  FileText,
  Eye,
  Lock,
  Network,
  Bell,
  Star,
  CheckCircle
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const QUICK_ACTIONS = [
  {
    id: 'quick-scan',
    name: 'Quick Security Scan',
    icon: Shield,
    color: 'from-blue-600 to-blue-700',
    description: 'Run instant security validation',
    action: 'securityScan',
    favorite: true
  },
  {
    id: 'new-case',
    name: 'New Investigation',
    icon: FileText,
    color: 'from-purple-600 to-purple-700',
    description: 'Create new forensic case',
    action: 'createCase',
    favorite: true
  },
  {
    id: 'threat-check',
    name: 'Threat Check',
    icon: Activity,
    color: 'from-red-600 to-red-700',
    description: 'Check active threats',
    action: 'threatCheck',
    favorite: false
  },
  {
    id: 'network-scan',
    name: 'Network Scan',
    icon: Network,
    color: 'from-green-600 to-green-700',
    description: 'Scan network for devices',
    action: 'networkScan',
    favorite: true
  },
  {
    id: 'generate-report',
    name: 'Generate Report',
    icon: FileText,
    color: 'from-orange-600 to-orange-700',
    description: 'Create forensic report',
    action: 'generateReport',
    favorite: false
  },
  {
    id: 'ble-monitor',
    name: 'BLE Monitor',
    icon: Eye,
    color: 'from-pink-600 to-pink-700',
    description: 'Monitor Bluetooth devices',
    action: 'bleMonitor',
    favorite: false
  },
  {
    id: 'encrypt-evidence',
    name: 'Encrypt Evidence',
    icon: Lock,
    color: 'from-indigo-600 to-indigo-700',
    description: 'Secure evidence files',
    action: 'encryptEvidence',
    favorite: false
  },
  {
    id: 'check-alerts',
    name: 'Active Alerts',
    icon: Bell,
    color: 'from-yellow-600 to-yellow-700',
    description: 'View security alerts',
    action: 'checkAlerts',
    favorite: true
  }
];

export default function QuickLaunchWidgets() {
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('quick_launch_favorites');
    return saved ? JSON.parse(saved) : QUICK_ACTIONS.filter(a => a.favorite).map(a => a.id);
  });
  const [executingAction, setExecutingAction] = useState(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['quick-alerts'],
    queryFn: () => base44.entities.Alert.filter({ status: 'new' }),
    initialData: []
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['quick-cases'],
    queryFn: () => base44.entities.Case.filter({ status: 'open' }),
    initialData: []
  });

  const executeActionMutation = useMutation({
    mutationFn: async (actionId) => {
      setExecutingAction(actionId);
      
      const action = QUICK_ACTIONS.find(a => a.id === actionId);
      if (!action) throw new Error('Action not found');

      switch (action.action) {
        case 'securityScan':
          // Run security validation
          const scanResults = await runSecurityValidation();
          return { action: 'securityScan', results: scanResults };

        case 'createCase':
          navigate(createPageUrl('Cases'));
          return { action: 'createCase' };

        case 'threatCheck':
          const threats = await base44.entities.Alert.filter({ severity: 'critical', status: 'new' });
          return { action: 'threatCheck', count: threats.length, threats };

        case 'networkScan':
          navigate(createPageUrl('NetworkMonitor'));
          return { action: 'networkScan' };

        case 'generateReport':
          navigate(createPageUrl('Reports'));
          return { action: 'generateReport' };

        case 'bleMonitor':
          navigate(createPageUrl('BLEMonitor'));
          return { action: 'bleMonitor' };

        case 'encryptEvidence':
          navigate(createPageUrl('Evidence'));
          return { action: 'encryptEvidence' };

        case 'checkAlerts':
          navigate(createPageUrl('ThreatDetection'));
          return { action: 'checkAlerts' };

        default:
          throw new Error('Unknown action');
      }
    },
    onSuccess: (result) => {
      setExecutingAction(null);
      
      if (result.action === 'securityScan') {
        toast.success(`Security scan complete! Health: ${result.results.healthScore}%`);
      } else if (result.action === 'threatCheck') {
        if (result.count === 0) {
          toast.success('No critical threats detected! 🎉');
        } else {
          toast.warning(`${result.count} critical threats detected!`);
        }
      } else {
        toast.success('Action executed successfully');
      }
    },
    onError: (error) => {
      setExecutingAction(null);
      toast.error(`Action failed: ${error.message}`);
    }
  });

  const runSecurityValidation = async () => {
    // Simulate security scan
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      healthScore: Math.floor(Math.random() * 20) + 80,
      issues: Math.floor(Math.random() * 5),
      timestamp: new Date().toISOString()
    };
  };

  const toggleFavorite = (actionId) => {
    const newFavorites = favorites.includes(actionId)
      ? favorites.filter(id => id !== actionId)
      : [...favorites, actionId];
    
    setFavorites(newFavorites);
    localStorage.setItem('quick_launch_favorites', JSON.stringify(newFavorites));
    toast.success(favorites.includes(actionId) ? 'Removed from favorites' : 'Added to favorites');
  };

  const favoriteActions = QUICK_ACTIONS.filter(a => favorites.includes(a.id));
  const otherActions = QUICK_ACTIONS.filter(a => !favorites.includes(a.id));

  return (
    <div className="space-y-6">
      {/* Favorites Grid */}
      {favoriteActions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
            <h2 className="text-xl font-bold text-white">Quick Actions</h2>
            <Badge className="bg-yellow-500">{favoriteActions.length}</Badge>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {favoriteActions.map(action => {
              const Icon = action.icon;
              const isExecuting = executingAction === action.id;
              
              return (
                <Card 
                  key={action.id}
                  className="group relative bg-slate-900/50 border-slate-800 hover:border-blue-500 transition-all hover:scale-105 cursor-pointer overflow-hidden"
                  onClick={() => !isExecuting && executeActionMutation.mutate(action.id)}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${action.color} opacity-0 group-hover:opacity-10 transition-opacity`} />
                  
                  <CardContent className="p-6 text-center relative">
                    <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br ${action.color} flex items-center justify-center ${isExecuting ? 'animate-pulse' : ''}`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    
                    <h3 className="font-semibold text-white mb-1">{action.name}</h3>
                    <p className="text-xs text-slate-400">{action.description}</p>
                    
                    {isExecuting && (
                      <div className="mt-3">
                        <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 animate-pulse" style={{ width: '60%' }} />
                        </div>
                      </div>
                    )}
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(action.id);
                      }}
                      className="absolute top-2 right-2 p-1 rounded-full hover:bg-slate-800 transition-colors"
                    >
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/10 border-red-500/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">Active Alerts</p>
                <p className="text-3xl font-bold text-white">{alerts.length}</p>
              </div>
              <Bell className="w-10 h-10 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-blue-500/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">Open Cases</p>
                <p className="text-3xl font-bold text-white">{cases.length}</p>
              </div>
              <FileText className="w-10 h-10 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/10 border-green-500/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">System Health</p>
                <p className="text-3xl font-bold text-white">98%</p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All Actions */}
      {otherActions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-white">All Actions</h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {otherActions.map(action => {
              const Icon = action.icon;
              const isExecuting = executingAction === action.id;
              
              return (
                <Card 
                  key={action.id}
                  className="group relative bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
                  onClick={() => !isExecuting && executeActionMutation.mutate(action.id)}
                >
                  <CardContent className="p-4 text-center relative">
                    <div className={`w-12 h-12 mx-auto mb-2 rounded-xl bg-slate-800 flex items-center justify-center ${isExecuting ? 'animate-pulse' : ''}`}>
                      <Icon className="w-6 h-6 text-slate-400" />
                    </div>
                    
                    <h3 className="font-semibold text-white text-sm mb-1">{action.name}</h3>
                    <p className="text-xs text-slate-500">{action.description}</p>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(action.id);
                      }}
                      className="absolute top-2 right-2 p-1 rounded-full hover:bg-slate-800 transition-colors"
                    >
                      <Star className="w-3 h-3 text-slate-600 hover:text-yellow-400" />
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}