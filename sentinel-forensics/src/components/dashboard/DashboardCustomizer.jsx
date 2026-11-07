import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Settings, Save, RotateCcw } from "lucide-react";
import { widgetRegistry } from "./WidgetLibrary";
import { toast } from "sonner";

export default function DashboardCustomizer({ layout, onLayoutChange, onSave }) {
  const [open, setOpen] = useState(false);
  const [tempLayout, setTempLayout] = useState(layout);

  const handleToggleWidget = (widgetId) => {
    setTempLayout(prev => {
      if (prev.includes(widgetId)) {
        return prev.filter(id => id !== widgetId);
      } else {
        return [...prev, widgetId];
      }
    });
  };

  const handleSave = () => {
    onLayoutChange(tempLayout);
    onSave(tempLayout);
    setOpen(false);
    toast.success('Dashboard layout saved');
  };

  const handleReset = () => {
    const defaultLayout = Object.keys(widgetRegistry);
    setTempLayout(defaultLayout);
    onLayoutChange(defaultLayout);
    onSave(defaultLayout);
    toast.success('Dashboard reset to default');
  };

  const categories = [...new Set(Object.values(widgetRegistry).map(w => w.category))];

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        className="border-slate-700 text-white hover:bg-slate-800"
      >
        <Settings className="w-4 h-4 mr-2" />
        Customize Dashboard
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-400" />
              Customize Dashboard
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Select Widgets to Display</h3>
              <p className="text-xs text-slate-400 mb-4">
                Choose which widgets to show on your security operations dashboard
              </p>
            </div>

            {categories.map(category => (
              <div key={category} className="space-y-3">
                <Badge className="bg-blue-500/20 text-blue-400 capitalize">
                  {category}
                </Badge>
                <div className="grid gap-3">
                  {Object.entries(widgetRegistry)
                    .filter(([_, widget]) => widget.category === category)
                    .map(([widgetId, widget]) => (
                      <div
                        key={widgetId}
                        className={`p-4 rounded-lg border transition-all ${
                          tempLayout.includes(widgetId)
                            ? 'bg-blue-500/10 border-blue-500/30'
                            : 'bg-slate-800/50 border-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={widgetId}
                            checked={tempLayout.includes(widgetId)}
                            onCheckedChange={() => handleToggleWidget(widgetId)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <Label
                              htmlFor={widgetId}
                              className="text-sm font-medium text-white cursor-pointer"
                            >
                              {widget.title}
                            </Label>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}

            <div className="flex justify-between pt-4 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={handleReset}
                className="border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Default
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setTempLayout(layout);
                    setOpen(false);
                  }}
                  className="border-slate-700 text-white hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Layout
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}