import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Clock, Star } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [search, setSearch] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const { data } = useQuery({
    queryKey: ['home-nav-summary'],
    queryFn: async () => {
      const result = await base44.functions.invoke('homeNavSummary');
      return result.data;
    },
    enabled: open
  });

  // Pages
  const pages = [
    { type: 'page', label: 'Home', route: 'Home' },
    { type: 'page', label: 'Dashboards', route: 'Dashboards' },
    { type: 'page', label: 'Review Hub', route: 'Review' },
    { type: 'page', label: 'Cases', route: 'Cases' },
    { type: 'page', label: 'Evidence', route: 'Evidence' },
    { type: 'page', label: 'Devices', route: 'Devices' },
    { type: 'page', label: 'Custom Dashboard', route: 'CustomDashboard' }
  ];

  // Recent items
  const recents = (data?.recents || []).map(r => ({
    type: r.type,
    label: r.title,
    subtitle: r.subtitle,
    route: r.type === 'case' ? 'CaseDetail' : 
            r.type === 'evidence' ? 'EvidenceDetail' :
            r.type === 'device' ? 'DeviceDetail' : 'Dashboard',
    id: r.id
  }));

  // Saved dashboards
  const dashboards = (data?.dashboards?.recentLayouts || []).map(l => ({
    type: 'dashboard',
    label: l.name,
    subtitle: 'Dashboard',
    route: 'CustomDashboard',
    id: l.id
  }));

  // Combine all items
  const allItems = [...pages, ...recents, ...dashboards];

  // Filter items
  const filteredItems = search
    ? allItems.filter(item =>
        item.label.toLowerCase().includes(search.toLowerCase()) ||
        item.subtitle?.toLowerCase().includes(search.toLowerCase())
      )
    : allItems;

  // Handle keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (!open) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % filteredItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          handleSelect(filteredItems[selectedIndex]);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex, filteredItems]);

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [open]);

  const handleSelect = (item) => {
    let url = createPageUrl(item.route);
    if (item.id) {
      url += item.type === 'dashboard' ? `?layoutId=${item.id}` : `/${item.id}`;
    }
    navigate(url);
    onOpenChange(false);
  };

  const getIcon = (item) => {
    if (item.type === 'page') return '📄';
    if (item.type === 'case') return '📁';
    if (item.type === 'evidence') return '🔍';
    if (item.type === 'device') return '📱';
    if (item.type === 'dashboard') return '📊';
    return '•';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search pages, recent items, dashboards..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            className="border-0 focus-visible:ring-0"
            autoFocus
          />
        </div>

        <div className="overflow-auto max-h-[60vh]">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No results found
            </div>
          ) : (
            <div className="p-2">
              {filteredItems.map((item, idx) => (
                <button
                  key={`${item.type}-${item.label}-${idx}`}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors ${
                    idx === selectedIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className="text-xl">{getIcon(item)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.label}</div>
                    {item.subtitle && (
                      <div className="text-xs text-gray-600 truncate">{item.subtitle}</div>
                    )}
                  </div>
                  {(item.type === 'case' || item.type === 'evidence' || item.type === 'device') && (
                    <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-600 flex items-center justify-between">
          <span>↑↓ Navigate • ↵ Select • Esc Close</span>
          <span>Ctrl/Cmd + K</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}