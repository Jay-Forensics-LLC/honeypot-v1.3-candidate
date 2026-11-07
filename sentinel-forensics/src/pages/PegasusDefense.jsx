import ProtectedRoute from '../components/security/ProtectedRoute';
import MVTPlusScanner from '../components/pegasus/MVTPlusScanner';
import BasebandMonitor from '../components/pegasus/BasebandMonitor';
import EntropyScanner from '../components/pegasus/EntropyScanner';
import PersistenceMapper from '../components/pegasus/PersistenceMapper';
import MemorySnapshot from '../components/pegasus/MemorySnapshot';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, AlertTriangle } from 'lucide-react';

export default function PegasusDefense() {
  return (
    <ProtectedRoute 
      requiredTier="professional" 
      requiredFeature="pegasus_defense"
      featureName="Pegasus Defense Suite"
    >
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-20 md:pb-6">
        {/* Header - Optimized for mobile */}
        <div className="flex items-start md:items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-red-600 to-orange-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/20">
            <Shield className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-3xl font-bold text-white">Pegasus Defense Suite</h1>
            <p className="text-xs md:text-sm text-slate-400 mt-0.5 md:mt-1">Military-grade zero-click exploit detection</p>
          </div>
        </div>

        {/* Warning Banner - iOS optimized with safe areas */}
        <Card className="bg-red-900/20 border-red-500/30 backdrop-blur-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-start gap-2 md:gap-3">
              <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs md:text-sm text-red-200 min-w-0">
                <p className="font-semibold mb-1">Highly Sensitive Security Tool</p>
                <p className="leading-relaxed">This suite detects nation-state surveillance tools including Pegasus, Predator, and similar zero-click exploits. All scan results are encrypted and logged for chain-of-custody purposes.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scanner Components - Stacked for mobile, better touch targets */}
        <div className="grid gap-4 md:gap-6">
          <MVTPlusScanner />
          <BasebandMonitor />
          <EntropyScanner />
          <PersistenceMapper />
          <MemorySnapshot />
        </div>
      </div>
    </ProtectedRoute>
  );
}