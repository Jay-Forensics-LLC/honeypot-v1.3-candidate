import React from 'react';
import { Search, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { widgetCategories, getWidgetsByCategory } from './widgetRegistry';

export default function WidgetPalette({ onAddWidget, currentWidgets = [] }) {
  const [search, setSearch] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('all');

  const widgets = getWidgetsByCategory(selectedCategory);
  const filteredWidgets = widgets.filter(w => 
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.description.toLowerCase().includes(search.toLowerCase())
  );

  const isWidgetAdded = (widgetKey) => {
    return currentWidgets.some(w => w.widgetKey === widgetKey);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search widgets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Categories */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start border-b rounded-none px-4">
          {widgetCategories.map(cat => (
            <TabsTrigger key={cat.key} value={cat.key} className="text-xs">
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={selectedCategory} className="flex-1 overflow-auto p-4 space-y-3 mt-0">
          {filteredWidgets.map(widget => {
            const Icon = widget.icon;
            const added = isWidgetAdded(widget.key);

            return (
              <Card key={widget.key} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-gray-100">
                    <Icon className="w-5 h-5 text-gray-600" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-sm">{widget.name}</h4>
                      {widget.isRealtime && (
                        <Badge variant="secondary" className="text-xs">
                          Live
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mb-2">{widget.description}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>Size: {widget.defaultSize.w}x{widget.defaultSize.h}</span>
                      {widget.supportsDrilldown && <span>• Drilldown</span>}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => onAddWidget(widget.key)}
                    disabled={added}
                    className="shrink-0"
                  >
                    {added ? 'Added' : <><Plus className="w-4 h-4 mr-1" />Add</>}
                  </Button>
                </div>
              </Card>
            );
          })}

          {filteredWidgets.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              No widgets found
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}