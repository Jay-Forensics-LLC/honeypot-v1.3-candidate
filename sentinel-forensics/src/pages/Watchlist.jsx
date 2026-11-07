import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Shield, 
  Plus, 
  Trash2,
  Search,
  AlertTriangle,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { safeString, formatEnumTitle } from "../components/utils/SafetyUtils";
import SentinelCrypto from "../components/utils/SentinelCrypto";

export default function Watchlist() {
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();

  const [newEntry, setNewEntry] = useState({
    name: '',
    entry_type: 'ble_mac',
    entry_value: '',
    threat_level: 'suspicious',
    description: '',
    alert_on_detection: true,
    tags: []
  });

  const { data: watchlist = [], isLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => base44.entities.Watchlist.list(),
    initialData: []
  });

  const addEntryMutation = useMutation({
    mutationFn: async () => {
      const entry = {
        ...newEntry,
        watchlist_id: `WL-${Date.now()}-${SentinelCrypto.generateId().substring(0, 8)}`,
        detection_count: 0
      };
      return await base44.entities.Watchlist.create(entry);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      setIsAdding(false);
      setNewEntry({
        name: '',
        entry_type: 'ble_mac',
        entry_value: '',
        threat_level: 'suspicious',
        description: '',
        alert_on_detection: true,
        tags: []
      });
      toast.success('Watchlist entry added');
    }
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (entryId) => base44.entities.Watchlist.delete(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success('Entry removed from watchlist');
    }
  });

  const filteredWatchlist = watchlist.filter(entry =>
    safeString(entry.name).toLowerCase().includes(searchTerm.toLowerCase()) ||
    safeString(entry.entry_value).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getThreatColor = (level) => {
    const colors = {
      benign: 'bg-green-500/20 text-green-400 border-green-500/50',
      suspicious: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      malicious: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      known_threat: 'bg-red-500/20 text-red-400 border-red-500/50'
    };
    return colors[level] || colors.suspicious;
  };

  const getEntryTypeIcon = (type) => {
    return Shield;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Watchlist</h1>
          <p className="text-slate-400">Monitor known threats and suspicious entities</p>
        </div>
        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800">
              <Plus className="w-4 h-4 mr-2" />
              Add to Watchlist
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Watchlist Entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Entry Name *</Label>
                  <Input
                    value={newEntry.name}
                    onChange={(e) => setNewEntry({...newEntry, name: e.target.value})}
                    placeholder="e.g., Suspicious BLE Device"
                    className="bg-slate-800 border-slate-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Entry Type *</Label>
                  <Select value={newEntry.entry_type} onValueChange={(value) => setNewEntry({...newEntry, entry_type: value})}>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ble_mac">BLE MAC Address</SelectItem>
                      <SelectItem value="ble_uuid">BLE UUID</SelectItem>
                      <SelectItem value="wifi_bssid">WiFi BSSID</SelectItem>
                      <SelectItem value="wifi_ssid">WiFi SSID</SelectItem>
                      <SelectItem value="ip_address">IP Address</SelectItem>
                      <SelectItem value="domain">Domain</SelectItem>
                      <SelectItem value="pattern">Pattern</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Entry Value *</Label>
                <Input
                  value={newEntry.entry_value}
                  onChange={(e) => setNewEntry({...newEntry, entry_value: e.target.value})}
                  placeholder="e.g., AA:BB:CC:DD:EE:FF or D0611E78-*"
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="space-y-2">
                <Label>Threat Level *</Label>
                <Select value={newEntry.threat_level} onValueChange={(value) => setNewEntry({...newEntry, threat_level: value})}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="benign">Benign</SelectItem>
                    <SelectItem value="suspicious">Suspicious</SelectItem>
                    <SelectItem value="malicious">Malicious</SelectItem>
                    <SelectItem value="known_threat">Known Threat</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={newEntry.description}
                  onChange={(e) => setNewEntry({...newEntry, description: e.target.value})}
                  placeholder="Why is this entry being monitored..."
                  className="bg-slate-800 border-slate-700 h-24"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="alert_on_detection"
                  checked={newEntry.alert_on_detection}
                  onChange={(e) => setNewEntry({...newEntry, alert_on_detection: e.target.checked})}
                  className="w-4 h-4"
                />
                <Label htmlFor="alert_on_detection" className="cursor-pointer">
                  Alert on detection
                </Label>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => addEntryMutation.mutate()}
                  disabled={addEntryMutation.isPending || !newEntry.name || !newEntry.entry_value}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {addEntryMutation.isPending ? 'Adding...' : 'Add to Watchlist'}
                </Button>
                <Button variant="outline" onClick={() => setIsAdding(false)} className="border-slate-700">
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search watchlist..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-700 text-white"
            />
          </div>
        </CardContent>
      </Card>

      {/* Watchlist Entries */}
      <div className="grid gap-4">
        {isLoading ? (
          <Card className="bg-slate-900/50 border-slate-800 p-12">
            <div className="text-center text-slate-400">
              <Shield className="w-16 h-16 mx-auto mb-4 animate-pulse" />
              <p>Loading watchlist...</p>
            </div>
          </Card>
        ) : filteredWatchlist.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800 p-12">
            <div className="text-center text-slate-400">
              <Eye className="w-16 h-16 mx-auto mb-4" />
              <p className="text-lg">No watchlist entries</p>
              <p className="text-sm mt-2">Add entities to monitor for threats</p>
            </div>
          </Card>
        ) : (
          filteredWatchlist.map((entry) => {
            const EntryIcon = getEntryTypeIcon(entry.entry_type);
            return (
              <Card key={entry.id} className={`bg-slate-900/50 border hover:shadow-lg transition-all ${getThreatColor(entry.threat_level)}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getThreatColor(entry.threat_level)}`}>
                        <EntryIcon className="w-6 h-6" />
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-white">
                            {safeString(entry.name, 'Unnamed Entry')}
                          </h3>
                          <Badge className={getThreatColor(entry.threat_level)}>
                            {formatEnumTitle(entry.threat_level)}
                          </Badge>
                          {entry.alert_on_detection && (
                            <Badge className="bg-blue-500/20 text-blue-400">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Alert Enabled
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-slate-400 text-sm mb-3">{safeString(entry.description, 'No description')}</p>
                        
                        <div className="grid grid-cols-3 gap-4 text-xs">
                          <div>
                            <p className="text-slate-500 mb-1">Type</p>
                            <p className="text-white">{formatEnumTitle(entry.entry_type)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 mb-1">Value</p>
                            <p className="text-white font-mono">{safeString(entry.entry_value, 'N/A')}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 mb-1">Detections</p>
                            <p className="text-white">{entry.detection_count || 0}</p>
                          </div>
                        </div>

                        {entry.last_detected && (
                          <p className="text-xs text-slate-500 mt-2">
                            Last detected: {format(new Date(entry.last_detected), 'MMM d, yyyy HH:mm')}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteEntryMutation.mutate(entry.id)}
                      disabled={deleteEntryMutation.isPending}
                      className="border-red-500 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}