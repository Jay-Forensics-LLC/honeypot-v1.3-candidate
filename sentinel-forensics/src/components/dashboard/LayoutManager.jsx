import React from 'react';
import { Plus, Star, Copy, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function LayoutManager({ currentLayoutId, onLayoutSelect, onClose }) {
  const [newLayoutName, setNewLayoutName] = React.useState('');
  const queryClient = useQueryClient();

  const { data: layouts, isLoading } = useQuery({
    queryKey: ['dashboard-layouts'],
    queryFn: async () => {
      const result = await base44.functions.invoke('dashboardLayoutList');
      return result.data;
    }
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (layoutId) => {
      await base44.functions.invoke('dashboardLayoutSetDefault', { layout_id: layoutId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-layouts'] });
      toast.success('Default layout updated');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (layoutId) => {
      await base44.functions.invoke('dashboardLayoutDelete', { layout_id: layoutId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-layouts'] });
      toast.success('Layout deleted');
    }
  });

  const handleCreateNew = () => {
    if (!newLayoutName.trim()) {
      toast.error('Please enter a layout name');
      return;
    }
    
    onLayoutSelect('new', newLayoutName);
    setNewLayoutName('');
    onClose();
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Manage Layouts</h2>

      {/* Create New */}
      <div className="mb-6 p-4 border rounded-lg bg-gray-50">
        <div className="flex gap-2">
          <Input
            placeholder="New layout name..."
            value={newLayoutName}
            onChange={(e) => setNewLayoutName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateNew()}
          />
          <Button onClick={handleCreateNew}>
            <Plus className="w-4 h-4 mr-2" />
            Create
          </Button>
        </div>
      </div>

      {/* Layouts List */}
      <Tabs defaultValue="personal">
        <TabsList className="w-full">
          <TabsTrigger value="personal" className="flex-1">
            My Layouts ({layouts?.personal?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="team" className="flex-1">
            <Users className="w-4 h-4 mr-2" />
            Team ({layouts?.team?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="space-y-2 mt-4">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : layouts?.personal?.length > 0 ? (
            layouts.personal.map(layout => (
              <Card key={layout.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">{layout.name}</h3>
                      {layout.is_default && (
                        <Badge variant="secondary">
                          <Star className="w-3 h-3 mr-1" />
                          Default
                        </Badge>
                      )}
                      {layout.visibility === 'team' && (
                        <Badge>
                          <Users className="w-3 h-3 mr-1" />
                          Team
                        </Badge>
                      )}
                    </div>
                    {layout.description && (
                      <p className="text-sm text-gray-600">{layout.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!layout.is_default && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefaultMutation.mutate(layout.id)}
                      >
                        <Star className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onLayoutSelect(layout.id)}
                    >
                      Load
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => deleteMutation.mutate(layout.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center text-gray-500 py-8">
              No personal layouts yet
            </div>
          )}
        </TabsContent>

        <TabsContent value="team" className="space-y-2 mt-4">
          {layouts?.team?.length > 0 ? (
            layouts.team.map(layout => (
              <Card key={layout.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{layout.name}</h3>
                    <p className="text-sm text-gray-600">by {layout.owner_user_id}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onLayoutSelect(layout.id);
                      onClose();
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Duplicate
                  </Button>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center text-gray-500 py-8">
              No team layouts available
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}