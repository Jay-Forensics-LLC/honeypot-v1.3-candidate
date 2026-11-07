import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Enhanced button with loading states, animations, and full responsiveness
 * @param {Object} props - Component props
 * @param {boolean} props.isLoading - Loading state
 * @param {React.Component} props.icon - Icon component
 * @param {string} props.loadingText - Text to show when loading
 * @param {string} props.variant - Button variant
 * @param {string} props.size - Button size
 * @param {Function} props.onClick - Click handler
 * @param {boolean} props.disabled - Disabled state
 * @param {string} props.className - Additional classes
 * @param {React.ReactNode} props.children - Button content
 * @returns {JSX.Element} Enhanced button
 */
export default function EnhancedButton({
  isLoading = false,
  icon: Icon,
  loadingText,
  variant = 'default',
  size = 'default',
  onClick,
  disabled = false,
  className,
  children,
  ...props
}) {
  const handleClick = (e) => {
    if (isLoading || disabled) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={cn(
        'transition-all duration-200',
        'active:scale-95',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'hover:shadow-lg',
        'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        // Mobile touch target size
        'min-h-[44px] min-w-[44px]',
        className
      )}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          {loadingText || 'Loading...'}
        </>
      ) : (
        <>
          {Icon && <Icon className="w-4 h-4 mr-2" />}
          {children}
        </>
      )}
    </Button>
  );
}