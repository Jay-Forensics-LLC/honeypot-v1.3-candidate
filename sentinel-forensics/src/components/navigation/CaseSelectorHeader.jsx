import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { FolderOpen, ChevronDown, Check, X } from 'lucide-react';

export function useCaseContext() {
  const [activeCaseId, setActiveCaseId] = React.useState(() => {
    return localStorage.getItem('sentinel_active_case_id') || null;
  });

  const updateActiveCase = (caseId) => {
    setActiveCaseId(caseId);
    if (caseId) {
      localStorage.setItem('sentinel_active_case_id', caseId);
    } else {
      localStorage.removeItem('sentinel_active_case_id');
    }
  };

  return { activeCaseId, setActiveCaseId: updateActiveCase };
}

export default function CaseSelectorHeader() {
  const { data: user } = useUser();
  const { activeCaseId, setActiveCaseId } = useCaseContext();

  const { data: cases = [] } = useQuery({
    queryKey: ['all-cases', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      try {
        const forensicCases = await base44.entities.Case.filter(
          { organization_id: user.organization_id },
          '-created_date',
          50
        );
        return forensicCases;
      } catch {
        return [];
      }
    },
    enabled: !!user?.organization_id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: legalCases = [] } = useQuery({
    queryKey: ['legal-cases-selector', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      try {
        return await base44.entities.LegalCase.filter(
          { organization_id: user.organization_id },
          '-created_date',
          50
        );
      } catch {
        return [];
      }
    },
    enabled: !!user?.organization_id,
    staleTime: 5 * 60 * 1000,
  });

  const allCases = [...cases, ...legalCases];
  const activeCase = allCases.find(c => c.id === activeCaseId);

  return (
    <div className="px-4 py-3 border-b border-[#1E1E1E] shrink-0 bg-gradient-to-r from-slate-900/30 to-transparent">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FolderOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-500 flex-shrink-0">Active Case:</span>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between bg-slate-800/50 border-slate-700 hover:bg-slate-800 text-white max-w-full"
            >
              <span className="truncate flex-1 text-left">
                {activeCase ? (
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {activeCase.case_number || activeCase.case_name?.substring(0, 10) || 'Case'}
                    </Badge>
                    {activeCase.case_name || activeCase.matter_title || 'Unnamed Case'}
                  </span>
                ) : (
                  'Select a case...'
                )}
              </span>
              <ChevronDown className="w-4 h-4 ml-2 flex-shrink-0 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            className="w-80 bg-slate-900 border-slate-800 max-h-96 overflow-y-auto"
            align="start"
          >
            {allCases.length === 0 ? (
              <DropdownMenuItem disabled className="text-slate-400">
                No cases available
              </DropdownMenuItem>
            ) : (
              <>
                {allCases.map((caseItem) => (
                  <DropdownMenuItem
                    key={caseItem.id}
                    onClick={() => setActiveCaseId(caseItem.id)}
                    className="text-white hover:bg-slate-800 cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {caseItem.case_number || caseItem.case_name?.substring(0, 10) || 'Case'}
                        </Badge>
                        {caseItem.case_type && (
                          <Badge variant="secondary" className="text-xs">
                            {caseItem.case_type.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">
                        {caseItem.case_name || caseItem.matter_title || 'Unnamed Case'}
                      </p>
                      {caseItem.status && (
                        <p className="text-xs text-slate-400">{caseItem.status}</p>
                      )}
                    </div>
                    {activeCaseId === caseItem.id && (
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 ml-2" />
                    )}
                  </DropdownMenuItem>
                ))}
                
                {activeCaseId && (
                  <>
                    <DropdownMenuSeparator className="bg-slate-800" />
                    <DropdownMenuItem
                      onClick={() => setActiveCaseId(null)}
                      className="text-red-400 hover:bg-slate-800 cursor-pointer flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Clear Case Selection
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {activeCase && (
        <div className="mt-2 p-2 bg-blue-900/10 border border-blue-500/30 rounded text-xs text-blue-300">
          <strong>Case Scope Active:</strong> All views filtered to this case
        </div>
      )}
    </div>
  );
}