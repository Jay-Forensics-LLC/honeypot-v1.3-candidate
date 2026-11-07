import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * PRODUCTION: Standardized Empty State Component
 * Consistent empty state UI with optional action
 */
export default function EmptyState({ 
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction
}) {
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardContent className="p-12 text-center">
        {Icon && <Icon className="w-16 h-16 mx-auto mb-4 text-slate-600" />}
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        {description && (
          <p className="text-sm text-slate-400 mb-4 max-w-md mx-auto">{description}</p>
        )}
        {(actionLabel || secondaryActionLabel) && (
          <div className="flex gap-3 justify-center">
            {actionLabel && (
              <Button
                onClick={onAction}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {actionLabel}
              </Button>
            )}
            {secondaryActionLabel && (
              <Button
                onClick={onSecondaryAction}
                variant="outline"
                className="border-slate-700"
              >
                {secondaryActionLabel}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}