import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Shield, Lock } from 'lucide-react';

/**
 * MFA Enforcement Component
 * Redirects to MFA setup if user is admin and doesn't have MFA enabled
 * CRITICAL: Only enforces for admins, not regular users
 */
export default function MFAEnforcement({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
    staleTime: 60000,
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isLoading || !user) return;

    // Skip MFA check if already on MFA setup page
    if (location.pathname.includes('MFASetup') || location.pathname.includes('mfa-setup')) return;

    // CRITICAL: Only enforce for admin users
    // Regular users can use the app without MFA
    if (user.role === 'admin' && !user.mfa_enabled) {
      // Give a small delay before redirect to avoid flash
      const timer = setTimeout(() => {
        navigate(createPageUrl('MFASetup'), { 
          state: { required: true, reason: 'Admin accounts require 2FA' },
          replace: true
        });
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [user, isLoading, location.pathname, navigate]);

  // Show loading only briefly
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-blue-400 animate-pulse" />
          <p className="text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  // Only show MFA required screen for admins without MFA
  if (user?.role === 'admin' && !user.mfa_enabled && !location.pathname.includes('MFASetup') && !location.pathname.includes('mfa-setup')) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <Lock className="w-16 h-16 mx-auto mb-4 text-yellow-400" />
          <h1 className="text-2xl font-bold text-white mb-2">Two-Factor Authentication Required</h1>
          <p className="text-slate-300 mb-4">
            Admin accounts must have 2FA enabled for security.
          </p>
          <p className="text-sm text-slate-400">
            Redirecting to MFA setup...
          </p>
        </div>
      </div>
    );
  }

  // For regular users and admins with MFA, show the app
  return children;
}