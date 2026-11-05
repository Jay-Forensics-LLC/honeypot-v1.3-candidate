import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, Shield, FileCheck, Briefcase, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '../components/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const templates = [
  {
    key: 'executive',
    label: 'Executive',
    icon: Briefcase,
    description: 'High-level KPIs and strategic metrics'
  },
  {
    key: 'soc',
    label: 'SOC Operations',
    icon: Shield,
    description: 'Real-time threat monitoring and alerts'
  },
  {
    key: 'forensics',
    label: 'Forensics',
    icon: TrendingUp,
    description: 'Evidence tracking and case analysis'
  },
  {
    key: 'compliance',
    label: 'Compliance',
    icon: FileCheck,
    description: 'Policy enforcement and audit status'
  }
];

export default function DashboardsHub() {
  const navigate = useNavigate();

  const { data: layouts, isLoading } = useQuery({
    queryKey: ['dashboard-layouts'],
    queryFn: async () => {
      const result = await base44.functions.invoke('dashboardLayoutList');
      return result.data;
    }
  });

  const handleTemplateClick = (templateKey) => {
    navigate(createPageUrl('CustomDashboard') + `?template=${templateKey}`);
  };

  const handleLayoutClick = (layoutId) => {
    navigate(createPageUrl('CustomDashboard') + `?layoutId=${layoutId}`);
  };

  const handleDefaultDashboard = () => {
    const defaultLayout = layouts?.personal?.find(l => l.is_default);
    if (defaultLayout) {
      handleLayoutClick(defaultLayout.id);
    } else {
      navigate(createPageUrl('CustomDashboard'));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboards</h1>
            <p className="text-gray-600">Choose a template or create a custom dashboard</p>
          </div>
          <Button onClick={() => navigate(createPageUrl('CustomDashboard'))}>
            <Plus className="w-4 h-4 mr-2" />
            New Dashboard
          </Button>
        </div>

        {/* Templates */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Dashboard Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map(template => {
              const Icon = template.icon;
              return (
                <Card 
                  key={template.key}
                  className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => handleTemplateClick(template.key)}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-100">
                        <Icon className="w-6 h-6 text-blue-600" />
                      </div>
                      {template.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600">{template.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* My Layouts */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">My Layouts</h2>
            {layouts?.personal?.length > 5 && (
              <Button variant="outline" size="sm">View All</Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-200 rounded animate-pulse" />
              ))}
            </div>
          ) : layouts?.personal?.length > 0 ? (
            <div className="space-y-2">
              {layouts.personal.slice(0, 5).map(layout => (
                <Card 
                  key={layout.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleLayoutClick(layout.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <LayoutDashboard className="w-5 h-5 text-gray-400" />
                        <div>
                          <div className="font-medium">{layout.name}</div>
                          <div className="text-xs text-gray-600">
                            Updated {new Date(layout.updated_date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      {layout.is_default && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          Default
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No saved layouts yet. Create your first dashboard!
              </CardContent>
            </Card>
          )}
        </section>

        {/* Quick Actions */}
        <section className="flex gap-4">
          <Button 
            size="lg" 
            className="flex-1"
            onClick={handleDefaultDashboard}
          >
            <LayoutDashboard className="w-5 h-5 mr-2" />
            Open Default Dashboard
          </Button>
          <Button 
            size="lg" 
            variant="outline"
            className="flex-1"
            onClick={() => navigate(createPageUrl('CustomDashboard'))}
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Custom
          </Button>
        </section>
      </div>
    </div>
  );
}