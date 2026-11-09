import React, { memo } from 'react';
import { Button } from '@/components/ui/button';

/**
 * PHASE 6: Memoized Page Header Component
 * Standardizes page headers across the app
 */
const PageHeader = memo(function PageHeader({ 
  title, 
  description, 
  icon: Icon,
  actions = [] 
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          {Icon && <Icon className="w-8 h-8 text-blue-400" />}
          <h1 className="text-3xl font-bold text-white">{title}</h1>
        </div>
        {description && (
          <p className="text-slate-400">{description}</p>
        )}
      </div>
      {actions.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {actions.map((action, idx) => (
            <Button
              key={idx}
              onClick={action.onClick}
              disabled={action.disabled}
              variant={action.variant || 'default'}
              className={action.className}
            >
              {action.icon && <action.icon className="w-4 h-4 mr-2" />}
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
});

export default PageHeader;