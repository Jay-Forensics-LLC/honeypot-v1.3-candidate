import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Action feedback component for inline messages
 * @param {Object} props - Component props
 * @param {string} props.type - Feedback type (success, error, warning, info)
 * @param {string} props.message - Feedback message
 * @param {boolean} props.show - Show/hide state
 * @param {Function} props.onDismiss - Dismiss handler
 * @param {number} props.autoDismiss - Auto dismiss after ms
 * @returns {JSX.Element} Action feedback
 */
export default function ActionFeedback({
  type = 'info',
  message,
  show = false,
  onDismiss,
  autoDismiss = 0
}) {
  const [isVisible, setIsVisible] = React.useState(show);

  React.useEffect(() => {
    setIsVisible(show);
    
    if (show && autoDismiss > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onDismiss?.();
      }, autoDismiss);
      
      return () => clearTimeout(timer);
    }
  }, [show, autoDismiss, onDismiss]);

  const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
    info: Info
  };

  const styles = {
    success: 'bg-green-900/50 border-green-500/50 text-green-300',
    error: 'bg-red-900/50 border-red-500/50 text-red-300',
    warning: 'bg-yellow-900/50 border-yellow-500/50 text-yellow-300',
    info: 'bg-blue-900/50 border-blue-500/50 text-blue-300'
  };

  const Icon = icons[type];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'flex items-start gap-3 p-4 rounded-lg border',
            'mb-4',
            styles[type]
          )}
        >
          <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="flex-1 text-sm">{message}</p>
          {onDismiss && (
            <button
              onClick={() => {
                setIsVisible(false);
                onDismiss();
              }}
              className="text-current hover:opacity-70 transition-opacity"
              aria-label="Dismiss"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}