import React, { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

/**
 * PHASE 6: Memoized Statistics Card Component
 * Standardizes stat displays across dashboards
 */
const StatCard = memo(function StatCard({ 
  label, 
  value, 
  icon: Icon, 
  color = 'blue',
  isLoading = false,
  onClick
}) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    red: 'from-red-500 to-red-600',
    green: 'from-green-500 to-green-600',
    yellow: 'from-yellow-500 to-yellow-600',
    orange: 'from-orange-500 to-orange-600'
  };

  return (
    <Card 
      className={`bg-slate-900/50 border-slate-800 ${onClick ? 'cursor-pointer hover:border-blue-500/50 transition-all' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400 mb-1">{label}</p>
            <p className="text-2xl md:text-3xl font-bold text-white">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : value}
            </p>
          </div>
          {Icon && (
            <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center`}>
              <Icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

export default StatCard;