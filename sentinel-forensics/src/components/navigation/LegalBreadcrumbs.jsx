import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCaseContext } from './CaseSelectorHeader';
import { createPageUrl } from '../utils';
import { ChevronRight, Home } from 'lucide-react';

export default function LegalBreadcrumbs() {
  const location = useLocation();
  const { activeCaseId } = useCaseContext();

  const { data: activeCase } = useQuery({
    queryKey: ['breadcrumb-case', activeCaseId],
    queryFn: async () => {
      if (!activeCaseId) return null;
      try {
        const forensicCases = await base44.entities.Case.filter({ id: activeCaseId });
        if (forensicCases.length > 0) return forensicCases[0];
        
        const legalCases = await base44.entities.LegalCase.filter({ id: activeCaseId });
        if (legalCases.length > 0) return legalCases[0];
        
        return null;
      } catch {
        return null;
      }
    },
    enabled: !!activeCaseId,
    staleTime: 10 * 60 * 1000,
  });

  const pathSegments = location.pathname.split('/').filter(Boolean);
  
  const breadcrumbs = [
    { name: 'Home', path: '/', icon: Home }
  ];

  if (activeCase) {
    breadcrumbs.push({
      name: activeCase.case_name || activeCase.matter_title || 'Active Case',
      path: null,
      isCurrent: true
    });
  }

  if (pathSegments.length > 0) {
    const pageName = pathSegments[0];
    const friendlyName = pageName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
    
    breadcrumbs.push({
      name: friendlyName,
      path: `/${pageName}`,
      isCurrent: pathSegments.length === 1
    });

    if (pathSegments.length > 1) {
      const subPage = pathSegments[1];
      breadcrumbs.push({
        name: subPage.charAt(0).toUpperCase() + subPage.slice(1),
        path: null,
        isCurrent: true
      });
    }
  }

  return (
    <nav className="flex items-center gap-2 text-sm text-slate-400 px-4 py-2 bg-[#0F0F10] border-b border-[#1E1E1E]">
      {breadcrumbs.map((crumb, index) => (
        <React.Fragment key={index}>
          {index > 0 && <ChevronRight className="w-4 h-4 text-slate-600" />}
          {crumb.path ? (
            <Link
              to={crumb.path}
              className="flex items-center gap-1 hover:text-white transition-colors"
            >
              {crumb.icon && <crumb.icon className="w-4 h-4" />}
              <span>{crumb.name}</span>
            </Link>
          ) : (
            <span className={`flex items-center gap-1 ${crumb.isCurrent ? 'text-white font-medium' : ''}`}>
              {crumb.icon && <crumb.icon className="w-4 h-4" />}
              <span>{crumb.name}</span>
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}