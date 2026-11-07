import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Settings, 
  Eye, 
  EyeOff, 
  GripVertical,
  Save,
  RotateCcw
} from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

export default function SidebarSettings() {
  const queryClient = useQueryClient();
  
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const [menuItems, setMenuItems] = useState([
    { id: "dashboard", title: "Dashboard", visible: true, tier: "free" },
    { id: "cases", title: "Cases", visible: true, tier: "free" },
    { id: "evidence", title: "Evidence Vault", visible: true, tier: "free" },
    { id: "network-monitor", title: "Network Monitor", visible: true, tier: "free" },
    { id: "network-security", title: "Network Security", visible: true, tier: "professional" },
    { id: "threat-detection", title: "Threat Detection", visible: true, tier: "free" },
    { id: "active-defense", title: "Active Defense", visible: true, tier: "professional" },
    { id: "sentinel-scanner", title: "Sentinel Scanner", visible: true, tier: "professional" },
    { id: "correlation-engine", title: "Correlation Engine", visible: true, tier: "professional" },
    { id: "advanced-security", title: "Advanced Security", visible: true, tier: "enterprise" },
    { id: "social-media", title: "Social Media & Auto", visible: true, tier: "enterprise" },
    { id: "apt-defense", title: "APT Defense Center", visible: true, tier: "forensic_suite" },
    { id: "opsec", title: "OpSec", visible: true, tier: "free" },
    { id: "reports", title: "Reports", visible: true, tier: "free" },
    { id: "tools", title: "Tools", visible: true, tier: "free" },
  ]);

  useEffect(() => {
    if (user?.preferences?.sidebar_config) {
      setMenuItems(user.preferences.sidebar_config);
    }
  }, [user]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (config) => {
      return base44.auth.updateMe({
        preferences: {
          ...user.preferences,
          sidebar_config: config
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(menuItems);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setMenuItems(items);
  };

  const toggleVisibility = (id) => {
    setMenuItems(menuItems.map(item => 
      item.id === id ? { ...item, visible: !item.visible } : item
    ));
  };

  const saveSettings = () => {
    updateSettingsMutation.mutate(menuItems);
  };

  const resetToDefault = () => {
    setMenuItems(menuItems.map(item => ({ ...item, visible: true })));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Sidebar Settings</h1>
          <p className="text-slate-400">Customize your navigation menu</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={resetToDefault}
            className="border-slate-700 text-slate-300"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to Default
          </Button>
          <Button
            onClick={saveSettings}
            disabled={updateSettingsMutation.isPending}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {updateSettingsMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-400" />
            Menu Items Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 mb-4">
            <p className="text-sm text-slate-400">
              Drag to reorder items • Toggle visibility to show/hide menu items
            </p>
          </div>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="menu-items">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-2"
                >
                  {menuItems.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex items-center justify-between p-4 rounded-lg border ${
                            snapshot.isDragging
                              ? 'border-blue-500 bg-slate-800'
                              : 'border-slate-700 bg-slate-800/50'
                          } transition-all`}
                        >
                          <div className="flex items-center gap-4">
                            <div {...provided.dragHandleProps}>
                              <GripVertical className="w-5 h-5 text-slate-400 cursor-grab" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium">{item.title}</span>
                                {item.tier !== 'free' && (
                                  <Badge className="text-xs bg-blue-500/20 text-blue-400">
                                    {item.tier.replace('_', ' ').toUpperCase()}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-slate-500">Position: {index + 1}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Label className="text-sm text-slate-400">
                              {item.visible ? 'Visible' : 'Hidden'}
                            </Label>
                            <Switch
                              checked={item.visible}
                              onCheckedChange={() => toggleVisibility(item.id)}
                            />
                            {item.visible ? (
                              <Eye className="w-5 h-5 text-green-400" />
                            ) : (
                              <EyeOff className="w-5 h-5 text-slate-500" />
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </CardContent>
      </Card>
    </div>
  );
}