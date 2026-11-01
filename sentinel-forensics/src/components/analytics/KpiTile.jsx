import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function KpiTile({ title, value, trend, trendValue, icon: Icon, color = 'blue' }) {
  const colorClasses = {
    red: 'text-red-400 bg-red-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
    green: 'text-green-400 bg-green-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    purple: 'text-purple-400 bg-purple-500/10'
  };

  const getTrendIcon = () => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-400" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-slate-400 mb-2">{title}</p>
            <p className="text-3xl font-bold text-white">{value}</p>
            {trendValue && (
              <div className="flex items-center gap-1 mt-2">
                {getTrendIcon()}
                <span className="text-xs text-slate-400">{trendValue}</span>
              </div>
            )}
          </div>
          {Icon && (
            <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
              <Icon className="w-6 h-6" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}