import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { filterNavigationByVisibility, getIcon } from '../config/navigationConfig';
import { useExpertMode } from '../hooks/useExpertMode';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Command, Search } from 'lucide-react';

/**
 * CRITICAL: Quick Navigation Command Palette
 * Keyboard shortcut: Cmd/Ctrl + K
 * Always accessible fallback navigation
 */
export default function QuickNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { maxVisibility } = useExpertMode();

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navigation = filterNavigationByVisibility(maxVisibility);
  
  // Flatten all navigation items
  const allPages = navigation.flatMap(category => 
    (category.submenu || []).map(item => ({
      ...item,
      category: category.name
    }))
  );

  // Filter by search query
  const filteredPages = query
    ? allPages.filter(page =>
        page.name.toLowerCase().includes(query.toLowerCase()) ||
        page.page.toLowerCase().includes(query.toLowerCase()) ||
        page.category.toLowerCase().includes(query.toLowerCase())
      )
    : allPages.slice(0, 10);

  const handleNavigate = (page) => {
    navigate(createPageUrl(page.page));
    setIsOpen(false);
    setQuery('');
  };

  return (
    <>
      {/* Quick nav trigger button - fixed position */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-red-500 hover:bg-red-600 rounded-full shadow-lg flex items-center justify-center transition-all"
        title="Quick Navigation (Cmd/Ctrl + K)"
      >
        <Search className="w-5 h-5 text-white" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl p-0">
          <div className="border-b border-slate-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Command className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-400">Quick Navigation</span>
              <Badge variant="outline" className="ml-auto text-xs">
                Cmd+K
              </Badge>
            </div>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages..."
              className="bg-slate-800 border-slate-700 text-white"
              autoFocus
            />
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {filteredPages.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm">No pages found</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredPages.map((page) => {
                  const IconComponent = getIcon(page.icon);
                  return (
                    <button
                      key={page.page}
                      onClick={() => handleNavigate(page)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors text-left"
                    >
                      <IconComponent className="w-4 h-4 text-slate-400" />
                      <div className="flex-1">
                        <p className="text-sm text-white">{page.name}</p>
                        <p className="text-xs text-slate-500">{page.category}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-800 p-3 text-center">
            <p className="text-xs text-slate-500">
              {filteredPages.length} of {allPages.length} pages shown
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}