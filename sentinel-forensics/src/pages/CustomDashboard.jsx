import React from 'react';
import { Settings, Plus, Save, Layout as LayoutIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import FilterBar from '../components/dashboard/FilterBar';
import DashboardGrid from '../components/dashboard/DashboardGrid';
import DrilldownDrawer from '../components/dashboard/DrilldownDrawer';
import WidgetPalette from '../components/dashboard/WidgetPalette';
import LayoutManager from '../components/dashboard/LayoutManager';

const DEFAULT_LAYOUT = {
  version: '2.0',
  grid: [
    { widgetKey: 'criticalAlerts', x: 0, y: 0, w: 3, h: 2 },
    { widgetKey: 'alertTrend', x: 3, y: 0, w: 6, h: 3 },
    { widgetKey: 'threatOverview', x: 9, y: 0, w: 3, h: 3 },
    { widgetKey: 'policyCompliance', x: 0, y: 3, w: 4, h: 3 },
    { widgetKey: 'devicePosture', x: 4, y: 3, w: 5, h: 3 },
    { widgetKey: 'evidenceIntegrity', x: 9, y: 3, w: 3, h: 2 }
  ],
  globalFilters: {
    timeRange: '7d',
    severity: 'all',
    search: ''
  }
};

export default function CustomDashboard() {
  const [editMode, setEditMode] = React.useState(false);
  const [showLayoutManager, setShowLayoutManager] = React.useState(false);
  const [currentLayout, setCurrentLayout] = React.useState(DEFAULT_LAYOUT);
  const [currentLayoutId, setCurrentLayoutId] = React.useState(null);
  const [drilldown, setDrilldown] = React.useState({ isOpen: false, entityType: null, filters: null });
  const [confettiShown, setConfettiShown] = React.useState(false);
  
  const queryClient = useQueryClient();

  // Load default layout on mount
  const { data: layouts } = useQuery({
    queryKey: ['dashboard-layouts'],
    queryFn: async () => {
      const result = await base44.functions.invoke('dashboardLayoutList');
      return result.data;
    }
  });

  // Load metrics for critical alerts to trigger confetti
  const { data: metrics } = useQuery({
    queryKey: ['dashboard-metrics', currentLayout.globalFilters],
    queryFn: async () => {
      const result = await base44.functions.invoke('dashboardMetrics', currentLayout.globalFilters);
      return result.data;
    },
    refetchInterval: 30000
  });

  // Confetti celebration when critical alerts hit 0
  React.useEffect(() => {
    if (metrics?.metrics?.alerts?.critical_count === 0 && !confettiShown) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
      toast.success('🎉 Nice work! No critical alerts', {
        description: 'All critical issues have been resolved'
      });
      setConfettiShown(true);
    }
  }, [metrics, confettiShown]);

  // Load default layout
  React.useEffect(() => {
    if (layouts?.personal) {
      const defaultLayout = layouts.personal.find(l => l.is_default);
      if (defaultLayout) {
        loadLayout(defaultLayout.id);
      }
    }
  }, [layouts]);

  const saveLayoutMutation = useMutation({
    mutationFn: async ({ name, description }) => {
      await base44.functions.invoke('dashboardLayoutSave', {
        layout_id: currentLayoutId,
        name,
        description,
        layout_json: JSON.stringify(currentLayout),
        visibility: 'personal'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-layouts'] });
      toast.success('Layout saved');
      setEditMode(false);
    }
  });

  const loadLayout = async (layoutId) => {
    if (layoutId === 'new') {
      setCurrentLayout(DEFAULT_LAYOUT);
      setCurrentLayoutId(null);
      setEditMode(true);
      return;
    }

    const result = await base44.functions.invoke('dashboardLayoutList');
    const allLayouts = [...result.data.personal, ...result.data.team];
    const layout = allLayouts.find(l => l.id === layoutId);
    
    if (layout) {
      const parsed = JSON.parse(layout.layout_json);
      setCurrentLayout(parsed);
      setCurrentLayoutId(layoutId);
    }
  };

  const handleFiltersChange = (newFilters) => {
    setCurrentLayout(prev => ({
      ...prev,
      globalFilters: newFilters
    }));
  };

  const handleGridChange = (newGrid) => {
    setCurrentLayout(prev => ({
      ...prev,
      grid: newGrid
    }));
  };

  const handleWidgetClick = (widget) => {
    const widgetDef = require('../components/dashboard/widgetRegistry').getWidget(widget.widgetKey);
    if (widgetDef?.supportsDrilldown) {
      setDrilldown({
        isOpen: true,
        entityType: widgetDef.drilldownType,
        filters: currentLayout.globalFilters
      });
    }
  };

  const handleAddWidget = (widgetKey) => {
    const newGrid = [...currentLayout.grid, { widgetKey, x: 0, y: 99 }];
    handleGridChange(newGrid);
  };

  const handleRemoveWidget = (widgetKey) => {
    const newGrid = currentLayout.grid.filter(w => w.widgetKey !== widgetKey);
    handleGridChange(newGrid);
  };

  const handleSave = () => {
    const name = prompt('Enter layout name:');
    if (name) {
      saveLayoutMutation.mutate({ name, description: '' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-40">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-2xl font-bold">Security Dashboard</h1>
            <p className="text-sm text-gray-600">Real-time security monitoring</p>
          </div>

          <div className="flex items-center gap-2">
            {editMode && (
              <Button onClick={handleSave}>
                <Save className="w-4 h-4 mr-2" />
                Save Layout
              </Button>
            )}
            
            <Button
              variant={editMode ? 'default' : 'outline'}
              onClick={() => setEditMode(!editMode)}
            >
              <Settings className="w-4 h-4 mr-2" />
              {editMode ? 'Done' : 'Edit'}
            </Button>

            <Button variant="outline" onClick={() => setShowLayoutManager(true)}>
              <LayoutIcon className="w-4 h-4 mr-2" />
              Layouts
            </Button>

            {editMode && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Widget
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full md:w-96 p-0">
                  <WidgetPalette 
                    onAddWidget={handleAddWidget}
                    currentWidgets={currentLayout.grid}
                  />
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>

        <FilterBar 
          filters={currentLayout.globalFilters}
          onFiltersChange={handleFiltersChange}
        />
      </div>

      {/* Grid */}
      <DashboardGrid
        gridItems={currentLayout.grid}
        onGridChange={handleGridChange}
        editMode={editMode}
        onWidgetClick={handleWidgetClick}
        onWidgetRemove={handleRemoveWidget}
        globalFilters={currentLayout.globalFilters}
      />

      {/* Drilldown Drawer */}
      <DrilldownDrawer
        isOpen={drilldown.isOpen}
        onClose={() => setDrilldown({ isOpen: false, entityType: null, filters: null })}
        entityType={drilldown.entityType}
        filters={drilldown.filters}
      />

      {/* Layout Manager Dialog */}
      <Dialog open={showLayoutManager} onOpenChange={setShowLayoutManager}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <LayoutManager
            currentLayoutId={currentLayoutId}
            onLayoutSelect={loadLayout}
            onClose={() => setShowLayoutManager(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}