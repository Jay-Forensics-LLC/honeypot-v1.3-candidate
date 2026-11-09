/**
 * PHASE 3: Navigation Panic Button
 * 
 * Always-visible emergency navigation escape hatch.
 * If sidebar fails or navigation is broken, this provides recovery.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/utils';
import { LifeBuoy, X, Home, FileText, Database, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NavigationPanicButton() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const emergencyRoutes = [
    { name: 'Dashboard', page: 'Dashboard', icon: Home, color: 'bg-blue-600' },
    { name: 'Cases', page: 'Cases', icon: FileText, color: 'bg-green-600' },
    { name: 'Evidence', page: 'Evidence', icon: Database, color: 'bg-purple-600' },
    { name: 'Profile', page: 'Profile', icon: Settings, color: 'bg-gray-600' }
  ];

  const handleNavigation = (page) => {
    try {
      navigate(createPageUrl(page));
      setIsOpen(false);
    } catch (error) {
      console.error('Emergency navigation failed:', error);
      alert('Navigation system failure. Reloading page...');
      window.location.reload();
    }
  };

  return (
    <>
      {/* Panic Button - Fixed Position */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-[9999] w-14 h-14 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 animate-pulse"
        title="Emergency Navigation"
      >
        {isOpen ? <X className="h-6 w-6" /> : <LifeBuoy className="h-6 w-6" />}
      </button>

      {/* Emergency Menu */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-[9998] bg-white border border-red-600 rounded-lg shadow-2xl p-4 min-w-[200px]">
          <h3 className="text-sm font-bold text-red-600 mb-3 flex items-center gap-2">
            <LifeBuoy className="h-4 w-4" />
            Emergency Navigation
          </h3>
          <div className="space-y-2">
            {emergencyRoutes.map((route) => (
              <Button
                key={route.page}
                onClick={() => handleNavigation(route.page)}
                className={`w-full justify-start ${route.color} hover:opacity-90`}
                size="sm"
              >
                <route.icon className="h-4 w-4 mr-2" />
                {route.name}
              </Button>
            ))}
            <div className="pt-2 border-t">
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
                className="w-full text-xs"
              >
                Reload App
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}