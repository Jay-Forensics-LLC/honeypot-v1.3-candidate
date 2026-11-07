import { Shield, Loader2 } from 'lucide-react';

/**
 * PERFORMANCE OPTIMIZED LoadingFallback v2.0
 * - Removed timeout logic (causes re-renders)
 * - Simple, fast loading state
 * - No state management
 */
export function LoadingFallback() {
  return (
    <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
      <div className="text-center">
        <div className="relative inline-block mb-6">
          <Shield className="w-16 h-16 text-red-500" />
          <Loader2 className="w-8 h-8 text-blue-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Loading...</h2>
        <p className="text-slate-400 text-sm">Please wait</p>
      </div>
    </div>
  );
}

export default LoadingFallback;