import { Shield } from "lucide-react";

export default function SentinelLogo({ size = "md", variant = "full", className = "" }) {
  const sizes = {
    xs: { icon: "w-4 h-4", text: "text-xs" },
    sm: { icon: "w-6 h-6", text: "text-sm" },
    md: { icon: "w-8 h-8", text: "text-base" },
    lg: { icon: "w-12 h-12", text: "text-xl" },
    xl: { icon: "w-16 h-16", text: "text-2xl" }
  };

  const sizeClasses = sizes[size] || sizes.md;

  if (variant === "icon") {
    return (
      <div className={`relative ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-red-700 rounded-lg blur-lg opacity-30 animate-pulse"></div>
        <div className="relative bg-gradient-to-br from-red-600 to-red-800 rounded-lg p-2 shadow-2xl shadow-red-500/50">
          <Shield className={`${sizeClasses.icon} text-white`} />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-red-700 rounded-lg blur-lg opacity-30 animate-pulse"></div>
        <div className="relative bg-gradient-to-br from-red-600 to-red-800 rounded-lg p-2 shadow-2xl shadow-red-500/50">
          <Shield className={`${sizeClasses.icon} text-white`} />
        </div>
      </div>
      {variant === "full" && (
        <div>
          <h1 className={`${sizeClasses.text} font-bold text-white leading-tight`}>
            Sentinel Forensics
          </h1>
          <p className="text-xs text-slate-400">Digital Investigation Suite</p>
        </div>
      )}
      {variant === "compact" && (
        <span className={`${sizeClasses.text} font-bold text-white`}>
          Sentinel Forensics
        </span>
      )}
    </div>
  );
}