import { toast as sonnerToast } from 'sonner';
import { CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';

/**
 * Enhanced toast notification system with consistent styling
 */
export const toast = {
  success: (title, options = {}) => {
    return sonnerToast.success(title, {
      icon: <CheckCircle className="w-5 h-5" />,
      duration: 4000,
      className: 'bg-green-900/90 border-green-500/50 text-green-100',
      ...options
    });
  },

  error: (title, options = {}) => {
    return sonnerToast.error(title, {
      icon: <AlertCircle className="w-5 h-5" />,
      duration: 6000,
      className: 'bg-red-900/90 border-red-500/50 text-red-100',
      ...options
    });
  },

  warning: (title, options = {}) => {
    return sonnerToast.warning(title, {
      icon: <AlertTriangle className="w-5 h-5" />,
      duration: 5000,
      className: 'bg-yellow-900/90 border-yellow-500/50 text-yellow-100',
      ...options
    });
  },

  info: (title, options = {}) => {
    return sonnerToast.info(title, {
      icon: <Info className="w-5 h-5" />,
      duration: 4000,
      className: 'bg-blue-900/90 border-blue-500/50 text-blue-100',
      ...options
    });
  },

  promise: (promise, messages) => {
    return sonnerToast.promise(promise, {
      loading: messages.loading || 'Loading...',
      success: messages.success || 'Success!',
      error: messages.error || 'Something went wrong',
      duration: 4000,
    });
  },

  custom: (component, options = {}) => {
    return sonnerToast.custom(component, {
      duration: 4000,
      ...options
    });
  }
};

/**
 * Success toast with action button
 */
export function successWithAction(title, description, actionLabel, onAction) {
  return toast.success(title, {
    description,
    action: {
      label: actionLabel,
      onClick: onAction
    }
  });
}

/**
 * Error toast with retry button
 */
export function errorWithRetry(title, description, onRetry) {
  return toast.error(title, {
    description,
    action: {
      label: 'Retry',
      onClick: onRetry
    }
  });
}