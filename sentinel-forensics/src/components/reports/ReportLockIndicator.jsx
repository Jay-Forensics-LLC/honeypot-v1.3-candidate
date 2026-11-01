import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Lock, Shield, CheckCircle, AlertTriangle, FileText } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DateUtils } from '../utils/DateUtils';

export default function ReportLockIndicator({ run, showDetails = false }) {
  if (!run) return null;

  const getStateConfig = (state, isLocked) => {
    if (isLocked) {
      return {
        icon: Lock,
        label: 'LOCKED FINAL',
        color: 'bg-blue-500/20 text-blue-300 border border-blue-500/50',
        tooltip: 'Immutable final artifact - cannot be modified or regenerated'
      };
    }

    switch (state) {
      case 'draft':
        return {
          icon: FileText,
          label: 'DRAFT',
          color: 'bg-slate-500/20 text-slate-300',
          tooltip: 'Report generated but not reviewed'
        };
      case 'under_review':
        return {
          icon: Shield,
          label: 'UNDER REVIEW',
          color: 'bg-yellow-500/20 text-yellow-300',
          tooltip: 'Pending attorney/counsel review'
        };
      case 'approved':
        return {
          icon: CheckCircle,
          label: 'APPROVED',
          color: 'bg-green-500/20 text-green-300',
          tooltip: 'Approved by reviewer - ready to lock as final'
        };
      case 'rejected':
        return {
          icon: AlertTriangle,
          label: 'REJECTED',
          color: 'bg-red-500/20 text-red-300',
          tooltip: 'Rejected by reviewer - see comments'
        };
      default:
        return {
          icon: FileText,
          label: 'UNKNOWN',
          color: 'bg-slate-500/20 text-slate-300',
          tooltip: 'Unknown state'
        };
    }
  };

  const config = getStateConfig(run.review_state, run.is_locked_final);
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={config.color}>
            <Icon className="w-3 h-3 mr-1" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-800 border-slate-700 text-white max-w-xs">
          <p className="text-xs">{config.tooltip}</p>
          {showDetails && run.is_locked_final && (
            <div className="mt-2 pt-2 border-t border-slate-700 text-xs">
              <p>Finalized: {DateUtils.safeFormatDateTime(run.finalized_at)}</p>
              <p>By: {run.finalized_by}</p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}