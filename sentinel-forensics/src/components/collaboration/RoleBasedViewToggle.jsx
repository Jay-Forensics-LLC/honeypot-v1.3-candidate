import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Scale,
  Code,
  Shield,
  Eye,
  ChevronDown
} from 'lucide-react';

export default function RoleBasedViewToggle({ currentView, onViewChange, userRole }) {
  const views = [
    {
      id: 'legal',
      label: 'Legal View',
      icon: Scale,
      description: 'Simplified, court-ready summaries',
      color: 'text-blue-400'
    },
    {
      id: 'technical',
      label: 'Technical View',
      icon: Code,
      description: 'Detailed forensic data',
      color: 'text-purple-400'
    },
    {
      id: 'law_enforcement',
      label: 'LEA View',
      icon: Shield,
      description: 'Investigation-focused',
      color: 'text-green-400'
    },
    {
      id: 'executive',
      label: 'Executive View',
      icon: Eye,
      description: 'High-level overview',
      color: 'text-orange-400'
    }
  ];

  const currentViewData = views.find(v => v.id === currentView) || views[0];
  const CurrentIcon = currentViewData.icon;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-400">View Mode:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
          >
            <CurrentIcon className={`w-4 h-4 mr-2 ${currentViewData.color}`} />
            {currentViewData.label}
            <ChevronDown className="w-4 h-4 ml-2 text-slate-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-slate-800 border-slate-700 text-white">
          {views.map((view) => {
            const Icon = view.icon;
            return (
              <DropdownMenuItem
                key={view.id}
                onClick={() => onViewChange(view.id)}
                className="hover:bg-slate-700 cursor-pointer"
              >
                <Icon className={`w-4 h-4 mr-2 ${view.color}`} />
                <div>
                  <div className="font-medium">{view.label}</div>
                  <div className="text-xs text-slate-400">{view.description}</div>
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {userRole && (
        <Badge variant="outline" className="border-slate-600 text-slate-300">
          Your Role: {userRole.replace('_', ' ')}
        </Badge>
      )}
    </div>
  );
}