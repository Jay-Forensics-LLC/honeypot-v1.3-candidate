import { Scale, Shield, FileText } from "lucide-react";

export default function LegalFooter() {
  return (
    <footer className="bg-slate-900/50 border-t border-slate-800 mt-12 py-6 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-3 gap-6 mb-4">
          <div>
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <Scale className="w-4 h-4 text-blue-400" />
              Legal
            </h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>
                <button className="hover:text-white transition-colors">
                  Terms of Service
                </button>
              </li>
              <li>
                <button className="hover:text-white transition-colors">
                  Privacy Policy
                </button>
              </li>
              <li>
                <button className="hover:text-white transition-colors">
                  EULA
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400" />
              Compliance
            </h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>Florida State Compliance</li>
              <li>Miami-Dade County</li>
              <li>Federal Regulations</li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" />
              Copyright
            </h3>
            <p className="text-sm text-slate-400">
              © 2024-2025 Sentinel Forensics
              <br />
              All Rights Reserved
              <br />
              Patent Pending
            </p>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4">
          <p className="text-xs text-slate-500 text-center">
            <strong className="text-slate-400">LEGAL NOTICE:</strong> Sentinel Forensics is designed for 
            authorized use only. Misuse may violate Florida State Law (F.S. 815.04, 934.03) and federal 
            law (18 U.S.C. § 1030). Users must comply with all applicable regulations in Miami-Dade County, 
            Florida, and the United States.
          </p>
          <p className="text-xs text-slate-500 text-center mt-2">
            For legal inquiries: legal@sentinelforensics.com | Compliance: compliance@sentinelforensics.com
          </p>
        </div>
      </div>
    </footer>
  );
}