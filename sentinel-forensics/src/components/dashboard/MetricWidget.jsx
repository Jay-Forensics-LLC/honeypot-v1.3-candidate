import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function MetricWidget({ widget, data, isLoading }) {
  const value = data?.value || 0;
  const previousValue = data?.previousValue || 0;
  const trend = value - previousValue;
  const trendPercent = previousValue > 0 ? ((trend / previousValue) * 100).toFixed(1) : 0;

  const getTrendIcon = () => {
    if (trend > 0) return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (trend < 0) return <TrendingDown className="w-4 h-4 text-red-400" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-400">{widget.widget_name}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse">
            <div className="h-8 bg-slate-700 rounded w-24 mb-2" />
            <div className="h-4 bg-slate-700 rounded w-16" />
          </div>
        ) : (
          <>
            <div className="text-3xl font-bold text-white mb-2">{value.toLocaleString()}</div>
            <div className="flex items-center gap-2 text-sm">
              {getTrendIcon()}
              <span className={trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-slate-400'}>
                {Math.abs(trendPercent)}%
              </span>
              <span className="text-slate-500">vs previous period</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}