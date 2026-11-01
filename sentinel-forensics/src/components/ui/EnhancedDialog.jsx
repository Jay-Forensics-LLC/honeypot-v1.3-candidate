import React, { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Enhanced dialog with better mobile support and loading states
 * @param {Object} props - Component props
 * @param {boolean} props.open - Open state
 * @param {Function} props.onOpenChange - Open state change handler
 * @param {string} props.title - Dialog title
 * @param {string} props.description - Dialog description
 * @param {React.ReactNode} props.children - Dialog content
 * @param {React.ReactNode} props.footer - Custom footer
 * @param {boolean} props.showCloseButton - Show close button
 * @param {string} props.size - Dialog size
 * @param {boolean} props.preventClose - Prevent closing
 * @param {boolean} props.isLoading - Loading state
 * @returns {JSX.Element} Enhanced dialog
 */
export default function EnhancedDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  showCloseButton = true,
  size = 'default',
  preventClose = false,
  isLoading = false,
  ...props
}) {
  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  const handleOpenChange = (newOpen) => {
    if (preventClose && !newOpen) return;
    onOpenChange?.(newOpen);
  };

  const sizeClasses = {
    sm: 'max-w-md',
    default: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw]'
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} {...props}>
      <DialogContent
        className={cn(
          'bg-slate-900 border-slate-800 text-white',
          'max-h-[90vh] overflow-y-auto',
          // Mobile optimization
          'w-[95vw] sm:w-full',
          sizeClasses[size],
          // Smooth animations
          'animate-in fade-in-0 zoom-in-95 duration-200',
          // Remove close button on mobile if needed
          'sm:rounded-lg rounded-lg'
        )}
      >
        {isLoading && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto mb-2" />
              <p className="text-slate-300">Processing...</p>
            </div>
          </div>
        )}

        {showCloseButton && !preventClose && (
          <button
            onClick={() => handleOpenChange(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <DialogHeader className="space-y-2 pb-4">
          {title && (
            <DialogTitle className="text-xl font-bold text-white">
              {title}
            </DialogTitle>
          )}
          {description && (
            <DialogDescription className="text-slate-400">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-4">
          {children}
        </div>

        {footer && (
          <DialogFooter className="pt-4 border-t border-slate-800">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}