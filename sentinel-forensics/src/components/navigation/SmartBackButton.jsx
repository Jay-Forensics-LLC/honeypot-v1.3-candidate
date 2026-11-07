import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';

// Root routes where back button should NOT appear
const ROOT_ROUTES = [
  '/',
  '/Dashboard',
  '/Home',
];

export default function SmartBackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  // Normalize current path
  const currentPath = location.pathname;

  // Don't show on root routes
  const isRootRoute = ROOT_ROUTES.some(route => 
    currentPath === route || currentPath === route.toLowerCase()
  );

  if (isRootRoute) {
    return null;
  }

  // Check if browser has history
  const hasHistory = window.history.length > 2;

  const handleBack = () => {
    if (hasHistory) {
      navigate(-1);
    } else {
      // Fallback to Dashboard
      navigate(createPageUrl('Dashboard'));
    }
  };

  return (
    <button
      onClick={handleBack}
      className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg shadow-2xl transition-all border border-slate-700 min-h-[44px] min-w-[44px]"
      title={hasHistory ? 'Go back' : 'Go to Dashboard'}
    >
      <ArrowLeft className="w-5 h-5" />
      <span className="text-sm font-medium">Back</span>
    </button>
  );
}