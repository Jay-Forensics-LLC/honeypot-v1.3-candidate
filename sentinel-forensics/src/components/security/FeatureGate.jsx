import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, Home, Code } from 'lucide-react';
import { createPageUrl } from '../utils';
import { useExpertMode } from '../hooks/useExpertMode';
import { isRouteAllowed } from '../config/navigationConfig';

/**
 * Feature Gate Component
 * 
 * DEVELOPMENT MODE: Gates are DISABLED to ensure full navigation access
 * PRODUCTION MODE: Enforces least-privilege access to features
 * 
 * This ensures testers/developers can access ALL features during testing
 * while production users get proper access control.
 * 
 * SECURITY: Only enforces restrictions in production environments.
 */
export default function FeatureGate({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { expertMode, toggleExpertMode, maxVisibility, isDeveloper } = useExpertMode();

  // CRITICAL: Check if we're in production
  const isProduction = import.meta.env?.MODE === 'production' || 
                       import.meta.env?.PROD === true;

  // DEVELOPMENT OVERRIDE: Always allow access in non-production
  // This ensures full navigation accessibility during testing
  if (!isProduction) {
    return <>{children}</>;
  }

  // SECURITY FIX: Use pathname for gate matching (more reliable than page name)
  const pathname = location.pathname;

  // Check if route is allowed for current visibility (PRODUCTION ONLY)
  const allowed = isRouteAllowed(pathname, maxVisibility);

  // If allowed, render children (gate open)
  if (allowed) {
    return <>{children}</>;
  }

  return (
    <div className="w-full h-full bg-[#0B0B0C] flex items-center justify-center p-6">
      <Card className="bg-slate-900/50 border-slate-800 max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center">
              <Lock className="w-6 h-6 text-yellow-500" />
            </div>
            <Badge variant="outline" className="text-yellow-500 border-yellow-500/50">
              {expertMode ? (isDeveloper ? 'Internal' : 'Beta') : 'Not in Beta v1'}
            </Badge>
          </div>
          <CardTitle className="text-white">
            This feature is not in Beta v1 scope
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-slate-400 text-sm">
            {!expertMode ? (
              <>
                This page is not part of the Beta v1 workflow validation.
                Enable <strong>Expert Mode</strong> to access additional features,
                or return to the Dashboard to continue testing core workflows.
              </>
            ) : (
              <>
                This page requires <strong>Developer Mode</strong>, which is restricted
                to internal team members. Return to the Dashboard or explore other
                Beta features.
              </>
            )}
          </p>

          <div className="space-y-2">
            <Button
              onClick={() => navigate(createPageUrl('Dashboard'))}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Home className="w-4 h-4 mr-2" />
              Return to Dashboard
            </Button>

            {!expertMode && (
              <Button
                onClick={toggleExpertMode}
                variant="outline"
                className="w-full border-slate-700 hover:bg-slate-800"
              >
                <Code className="w-4 h-4 mr-2" />
                Enable Expert Mode
              </Button>
            )}
          </div>

          <div className="pt-4 border-t border-slate-800">
            <p className="text-xs text-slate-500">
              <strong>Beta v1 Scope:</strong> Dashboard, Cases, Evidence, Devices,
              Network Monitor, BLE Monitor, Reports, Profile
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}