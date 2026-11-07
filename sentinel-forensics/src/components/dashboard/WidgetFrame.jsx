import React from 'react';
import { motion } from 'framer-motion';
import { MoreVertical, X, RefreshCw, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Lazy-loaded widget components
const widgetComponents = {
  AlertTrendWidget: React.lazy(() => import('./widgets/AlertTrendWidget')),
  CriticalAlertsWidget: React.lazy(() => import('./widgets/CriticalAlertsWidget')),
  ThreatOverviewWidget: React.lazy(() => import('./widgets/ThreatOverviewWidget')),
  PolicyComplianceWidget: React.lazy(() => import('./widgets/PolicyComplianceWidget')),
  EvidenceIntegrityWidget: React.lazy(() => import('./widgets/EvidenceIntegrityWidget')),
  ActivityFeedWidget: React.lazy(() => import('./widgets/ActivityFeedWidget')),
  AlertsBySeverityWidget: React.lazy(() => import('./widgets/AlertsBySeverityWidget')),
  DevicePostureWidget: React.lazy(() => import('./widgets/DevicePostureWidget'))
};

export default function WidgetFrame({ 
  widget, 
  editMode, 
  isDragging, 
  onRemove, 
  onClick,
  globalFilters,
  localSettings 
}) {
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  
  const WidgetComponent = widgetComponents[widget.component];
  const Icon = widget.icon;

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey(prev => prev + 1);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={editMode ? { scale: 1.02 } : {}}
      transition={{ duration: 0.2 }}
      className={isDragging ? 'opacity-50' : ''}
    >
      <Card className="h-full flex flex-col overflow-hidden hover:shadow-lg transition-shadow">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-gray-600" />
            <h3 className="font-semibold text-sm">{widget.name}</h3>
            {widget.isRealtime && (
              <div className="relative">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping" />
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {!editMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            )}
            
            {editMode ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-600 hover:text-red-700"
                onClick={onRemove}
              >
                <X className="w-3 h-3" />
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onClick}>
                    <TrendingUp className="w-4 h-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRefresh}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 p-4 overflow-auto">
          <React.Suspense fallback={
            <div className="h-full flex items-center justify-center">
              <div className="animate-pulse space-y-3 w-full">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
              </div>
            </div>
          }>
            {WidgetComponent && (
              <WidgetComponent 
                globalFilters={globalFilters}
                localSettings={localSettings}
                refreshKey={refreshKey}
              />
            )}
          </React.Suspense>
        </div>
      </Card>
    </motion.div>
  );
}