import { ExternalLink } from 'lucide-react';

export default function PrivacyPolicyLink() {
  return (
    <div className="text-center text-xs text-slate-500">
      <a 
        href="https://jayforensics.com/privacy" 
        target="_blank" 
        rel="noopener noreferrer"
        className="hover:text-slate-400 inline-flex items-center gap-1 transition-colors"
      >
        Privacy Policy
        <ExternalLink className="w-3 h-3" />
      </a>
      <span className="mx-2">•</span>
      <a 
        href="https://jayforensics.com/terms" 
        target="_blank" 
        rel="noopener noreferrer"
        className="hover:text-slate-400 inline-flex items-center gap-1 transition-colors"
      >
        Terms of Service
        <ExternalLink className="w-3 h-3" />
      </a>
      <span className="mx-2">•</span>
      <a 
        href="mailto:legal@jayforensics.com"
        className="hover:text-slate-400 transition-colors"
      >
        Legal Contact
      </a>
      <p className="mt-1 text-[10px] text-slate-600">
        © {new Date().getFullYear()} Sentinel Forensics. All rights reserved.
      </p>
    </div>
  );
}