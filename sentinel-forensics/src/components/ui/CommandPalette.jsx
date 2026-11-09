
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  Search,
  FileText,
  Database,
  AlertTriangle,
  Target,
  FolderOpen,
  Shield,
  Activity,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export default function CommandPalette({ open, onClose }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState({
    cases: [],
    evidence: [],
    alerts: [],
    threats: [],
    hunts: []
  });
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();

  // Quick commands
  const quickCommands = [
    {
      id: "new-case",
      label: "Create New Case",
      icon: FolderOpen,
      action: () => {
        navigate(createPageUrl("Cases"));
        onClose();
      }
    },
    {
      id: "upload-evidence",
      label: "Upload Evidence",
      icon: Database,
      action: () => {
        navigate(createPageUrl("Evidence"));
        onClose();
      }
    },
    {
      id: "threat-detection",
      label: "View Threat Alerts",
      icon: AlertTriangle,
      action: () => {
        navigate(createPageUrl("ThreatDetection"));
        onClose();
      }
    },
    {
      id: "threat-hunting",
      label: "Start Threat Hunt",
      icon: Target,
      action: () => {
        navigate(createPageUrl("ThreatHunting"));
        onClose();
      }
    },
    {
      id: "network-monitor",
      label: "Network Monitor",
      icon: Activity,
      action: () => {
        navigate(createPageUrl("NetworkMonitor"));
        onClose();
      }
    }
  ];

  // Perform search across multiple entities
  const performSearch = async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults({
        cases: [],
        evidence: [],
        alerts: [],
        threats: [],
        hunts: []
      });
      return;
    }

    setIsSearching(true);

    try {
      const lowerQuery = query.toLowerCase();

      // Search Cases
      const allCases = await base44.entities.Case.list('-created_date', 100);
      const matchingCases = allCases.filter(c => 
        c.title?.toLowerCase().includes(lowerQuery) ||
        c.case_number?.toLowerCase().includes(lowerQuery) ||
        c.description?.toLowerCase().includes(lowerQuery)
      ).slice(0, 5);

      // Search Evidence
      const allEvidence = await base44.entities.EvidenceV2.list('-collection_timestamp', 100);
      const matchingEvidence = allEvidence.filter(e =>
        e.title?.toLowerCase().includes(lowerQuery) ||
        e.evidence_number?.toLowerCase().includes(lowerQuery) ||
        e.description?.toLowerCase().includes(lowerQuery)
      ).slice(0, 5);

      // Search Alerts
      const allAlerts = await base44.entities.Alert.list('-detection_timestamp', 100);
      const matchingAlerts = allAlerts.filter(a =>
        a.title?.toLowerCase().includes(lowerQuery) ||
        a.description?.toLowerCase().includes(lowerQuery) ||
        a.source?.toLowerCase().includes(lowerQuery)
      ).slice(0, 5);

      // Search APT Threats
      const allThreats = await base44.entities.APTGroup.list('-last_updated', 50);
      const matchingThreats = allThreats.filter(t =>
        t.group_name?.toLowerCase().includes(lowerQuery) ||
        t.aliases?.some(a => a.toLowerCase().includes(lowerQuery))
      ).slice(0, 5);

      // Search Threat Hunts
      const allHunts = await base44.entities.ThreatHunt.list('-created_at', 50);
      const matchingHunts = allHunts.filter(h =>
        h.hunt_name?.toLowerCase().includes(lowerQuery) ||
        h.hunt_type?.toLowerCase().includes(lowerQuery)
      ).slice(0, 5);

      setSearchResults({
        cases: matchingCases,
        evidence: matchingEvidence,
        alerts: matchingAlerts,
        threats: matchingThreats,
        hunts: matchingHunts
      });
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed', {
        description: error.message
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery) {
        performSearch(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Calculate all selectable items
  const getAllItems = () => {
    const items = [];

    if (searchQuery.trim().length < 2) {
      // Show quick commands when not searching
      return quickCommands.map(cmd => ({
        type: 'command',
        data: cmd
      }));
    }

    // Add search results
    searchResults.cases.forEach(c => items.push({ type: 'case', data: c }));
    searchResults.evidence.forEach(e => items.push({ type: 'evidence', data: e }));
    searchResults.alerts.forEach(a => items.push({ type: 'alert', data: a }));
    searchResults.threats.forEach(t => items.push({ type: 'threat', data: t }));
    searchResults.hunts.forEach(h => items.push({ type: 'hunt', data: h }));

    return items;
  };

  const allItems = getAllItems();

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!open) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % allItems.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + allItems.length) % allItems.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (allItems[selectedIndex]) {
            handleSelectItem(allItems[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex, allItems]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults, searchQuery]);

  // Handle item selection
  const handleSelectItem = (item) => {
    if (item.type === 'command') {
      item.data.action();
      return;
    }

    switch (item.type) {
      case 'case':
        navigate(createPageUrl("Cases"));
        toast.success(`Opening case: ${item.data.case_number}`);
        break;
      case 'evidence':
        // Updated evidence detail navigation to use item.data.id as per the outline's intent
        navigate(`${createPageUrl("EvidenceDetail")}/${item.data.id}`);
        break;
      case 'alert':
        navigate(createPageUrl("ThreatDetection"));
        toast.success(`Navigating to alert: ${item.data.title}`);
        break;
      case 'threat':
        navigate(createPageUrl("ThreatIntelligence"));
        toast.success(`Viewing threat: ${item.data.group_name}`);
        break;
      case 'hunt':
        navigate(createPageUrl("ThreatHunting"));
        toast.success(`Opening hunt: ${item.data.hunt_name}`);
        break;
    }

    onClose();
  };

  // Get icon for result type
  const getResultIcon = (type) => {
    switch (type) {
      case 'case':
        return FolderOpen;
      case 'evidence':
        return Database;
      case 'alert':
        return AlertTriangle;
      case 'threat':
        return Shield;
      case 'hunt':
        return Target;
      case 'command':
        return Command;
      default:
        return FileText;
    }
  };

  // Get badge color for result type
  const getBadgeColor = (type) => {
    switch (type) {
      case 'case':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'evidence':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
      case 'alert':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'threat':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'hunt':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  // Format result label
  const getResultLabel = (item) => {
    switch (item.type) {
      case 'case':
        return `${item.data.case_number} - ${item.data.title}`;
      case 'evidence':
        return `${item.data.evidence_number} - ${item.data.title}`;
      case 'alert':
        return item.data.title;
      case 'threat':
        return item.data.group_name;
      case 'hunt':
        return item.data.hunt_name;
      case 'command':
        return item.data.label;
      default:
        return 'Unknown';
    }
  };

  // Get result description
  const getResultDescription = (item) => {
    switch (item.type) {
      case 'case':
        return `${item.data.case_type} • ${item.data.status}`;
      case 'evidence':
        return `${item.data.evidence_type} • ${item.data.threat_classification || 'unknown'}`;
      case 'alert':
        return `${item.data.severity} • ${item.data.alert_type}`;
      case 'threat':
        return `${item.data.threat_level} • ${item.data.activity_status}`;
      case 'hunt':
        return `${item.data.hunt_type} • ${item.data.status}`;
      default:
        return '';
    }
  };

  const totalResults = searchResults.cases.length + 
                      searchResults.evidence.length + 
                      searchResults.alerts.length + 
                      searchResults.threats.length + 
                      searchResults.hunts.length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <Search className="w-5 h-5 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cases, evidence, alerts, threats... or type a command"
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-white placeholder:text-slate-400"
            autoFocus
          />
          {isSearching && <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />}
        </div>

        <div className="max-h-[500px] overflow-y-auto">
          {allItems.length === 0 && searchQuery.trim().length >= 2 && !isSearching ? (
            <div className="text-center py-12 text-slate-400">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No results found for "{searchQuery}"</p>
              <p className="text-sm mt-1">Try different keywords or check spelling</p>
            </div>
          ) : allItems.length === 0 && searchQuery.trim().length < 2 ? (
            <div className="p-4">
              <p className="text-xs text-slate-400 mb-3 px-2">QUICK COMMANDS</p>
              <div className="text-center py-8 text-slate-400">
                <Command className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Start typing to search or use quick commands</p>
              </div>
            </div>
          ) : (
            <div className="p-2">
              {searchQuery.trim().length >= 2 && totalResults > 0 && (
                <p className="text-xs text-slate-400 mb-2 px-2">
                  FOUND {totalResults} RESULT{totalResults !== 1 ? 'S' : ''}
                </p>
              )}
              
              {searchQuery.trim().length < 2 && (
                <p className="text-xs text-slate-400 mb-2 px-2">QUICK COMMANDS</p>
              )}

              <div className="space-y-1">
                {allItems.map((item, index) => {
                  const Icon = getResultIcon(item.type);
                  const isSelected = index === selectedIndex;

                  return (
                    <button
                      key={`${item.type}-${item.data.id || index}`}
                      onClick={() => handleSelectItem(item)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
                        isSelected
                          ? 'bg-blue-500/20 border border-blue-500/50'
                          : 'hover:bg-slate-800/50 border border-transparent'
                      }`}
                    >
                      <Icon className={`w-5 h-5 flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                            {getResultLabel(item)}
                          </p>
                          {item.type !== 'command' && (
                            <Badge className={`text-xs ${getBadgeColor(item.type)}`}>
                              {item.type}
                            </Badge>
                          )}
                        </div>
                        {getResultDescription(item) && (
                          <p className="text-xs text-slate-400 truncate">
                            {getResultDescription(item)}
                          </p>
                        )}
                      </div>
                      {isSelected && <ArrowRight className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-800 bg-slate-950/50">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">↑↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">Enter</kbd>
                Select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">Esc</kbd>
                Close
              </span>
            </div>
            <span>Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">Ctrl+K</kbd> anytime</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
