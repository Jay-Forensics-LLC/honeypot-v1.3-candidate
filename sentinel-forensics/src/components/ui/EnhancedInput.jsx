import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Enhanced input with validation, error states, and visual feedback
 * @param {Object} props - Component props
 * @param {string} props.label - Input label
 * @param {string} props.error - Error message
 * @param {string} props.success - Success message
 * @param {string} props.hint - Helper text
 * @param {boolean} props.required - Required field
 * @param {string} props.type - Input type
 * @param {Function} props.validate - Validation function
 * @param {Function} props.onChange - Change handler
 * @param {string} props.value - Input value
 * @returns {JSX.Element} Enhanced input
 */
export default function EnhancedInput({
  label,
  error,
  success,
  hint,
  required = false,
  type = 'text',
  validate,
  onChange,
  value,
  className,
  ...props
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [internalError, setInternalError] = useState('');

  const handleChange = (e) => {
    const newValue = e.target.value;
    onChange?.(e);

    // Run validation if provided
    if (validate) {
      const validationResult = validate(newValue);
      if (validationResult !== true) {
        setInternalError(validationResult);
      } else {
        setInternalError('');
      }
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (validate && value) {
      const validationResult = validate(value);
      if (validationResult !== true) {
        setInternalError(validationResult);
      }
    }
  };

  const displayError = error || internalError;
  const inputType = type === 'password' && showPassword ? 'text' : type;

  return (
    <div className="space-y-2">
      {label && (
        <Label className="text-white font-medium flex items-center gap-1">
          {label}
          {required && <span className="text-red-400">*</span>}
        </Label>
      )}
      
      <div className="relative">
        <Input
          type={inputType}
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          className={cn(
            'transition-all duration-200',
            'bg-slate-800 border-slate-700 text-white',
            'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
            'min-h-[44px]', // Mobile touch target
            displayError && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
            success && 'border-green-500 focus:border-green-500 focus:ring-green-500/20',
            isFocused && 'shadow-lg',
            className
          )}
          {...props}
        />
        
        {/* Password visibility toggle */}
        {type === 'password' && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        )}

        {/* Validation icons */}
        {!type.includes('password') && (
          <>
            {displayError && (
              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-400" />
            )}
            {success && !displayError && (
              <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-400" />
            )}
          </>
        )}
      </div>

      {/* Error message */}
      {displayError && (
        <div className="flex items-start gap-2 text-sm text-red-400 animate-in fade-in slide-in-from-top-1 duration-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{displayError}</span>
        </div>
      )}

      {/* Success message */}
      {success && !displayError && (
        <div className="flex items-start gap-2 text-sm text-green-400 animate-in fade-in slide-in-from-top-1 duration-200">
          <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* Hint text */}
      {hint && !displayError && !success && (
        <p className="text-sm text-slate-400">{hint}</p>
      )}
    </div>
  );
}