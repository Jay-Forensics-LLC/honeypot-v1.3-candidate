import React, { createContext, useContext, useEffect } from 'react';
import { FEATURE_FLAGS, DEMO_USER, getDemoMessage } from '../config/featureFlags';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Calendar, Info } from 'lucide-react';

const DemoModeContext = createContext({
  isDemoMode: false,
  demoUser: null,
  isFeatureEnabled: () => true,
});

export const useDemoMode = () => useContext(DemoModeContext);

export function DemoModeProvider({ children }) {
  const demoInfo = getDemoMessage();
  
  useEffect(() => {
    if (FEATURE_FLAGS.PUBLIC_DEMO_MODE) {
      console.log('🎭 Demo Mode Active - Authentication Disabled');
      console.log(`📅 Trial ends: ${FEATURE_FLAGS.FREE_TRIAL_UNTIL}`);
    }
  }, []);

  const value = {
    isDemoMode: FEATURE_FLAGS.PUBLIC_DEMO_MODE,
    demoUser: FEATURE_FLAGS.PUBLIC_DEMO_MODE ? DEMO_USER : null,
    isFeatureEnabled: (feature) => FEATURE_FLAGS[feature] !== false,
    getDemoMessage: () => demoInfo,
  };

  return (
    <DemoModeContext.Provider value={value}>
      {/* PRODUCTION: Demo banner disabled */}
      {children}
    </DemoModeContext.Provider>
  );
}