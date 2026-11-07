import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, AlertTriangle, Scale, FileText } from "lucide-react";

export default function LegalAcknowledgment({ open, onAccept, onDecline }) {
  const [acceptAll, setAcceptAll] = useState(false);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="bg-slate-900 border-2 border-red-500 text-white max-w-4xl w-[95vw] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Scale className="w-5 h-5 md:w-6 md:h-6 text-red-400" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg md:text-2xl font-bold text-white">
                Legal Terms & Conditions
              </DialogTitle>
              <DialogDescription className="text-xs md:text-sm text-slate-400">
                Miami-Dade County, Florida - Digital Forensics Platform
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2 md:pr-4 -mx-2 px-2">
          <div className="space-y-4 md:space-y-6 text-xs md:text-sm pb-4">
            {/* Professional Use Warning */}
            <div className="bg-red-500/10 border-2 border-red-500 rounded-lg p-3 md:p-4">
              <div className="flex items-start gap-2 md:gap-3">
                <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-red-400 mb-2 text-sm md:text-base">⚠️ CRITICAL NOTICE</h3>
                  <p className="text-red-200">
                    This is a PROFESSIONAL DIGITAL FORENSICS platform. Misuse of this software for 
                    unauthorized surveillance, illegal hacking, or violation of privacy laws may result 
                    in criminal prosecution under Federal and Florida State law.
                  </p>
                </div>
              </div>
            </div>

            {/* Terms of Service */}
            <div className="space-y-2 md:space-y-3">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm md:text-base">
                <Shield className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
                1. Terms of Service
              </h3>
              <p className="text-slate-300 leading-relaxed">
                By using Sentinel Forensics, you agree to use this platform exclusively for lawful 
                digital forensics investigations, incident response, and cybersecurity defense. This 
                software is designed for professional use by certified forensic examiners, law enforcement, 
                incident responders, and authorized security personnel.
              </p>
            </div>

            {/* Legal Compliance */}
            <div className="space-y-2 md:space-y-3">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm md:text-base">
                <Scale className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
                2. Legal Compliance & Jurisdiction
              </h3>
              <p className="text-slate-300 leading-relaxed mb-2">
                <strong className="text-white">Florida Statutes Compliance:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 md:space-y-2 text-slate-300 ml-2 md:ml-4">
                <li>F.S. 90.803(6) - Business Records Exception (Chain of Custody)</li>
                <li>F.S. 90.901 - Authentication of Evidence</li>
                <li>F.S. 90.702 - Expert Witness Testimony Standards</li>
                <li>F.S. 934.03 - Wiretapping and Electronic Surveillance Laws</li>
                <li>F.S. 815.04 - Computer-Related Crimes</li>
              </ul>
              <p className="text-slate-300 leading-relaxed mt-3">
                <strong className="text-white">Federal Law Compliance:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 md:space-y-2 text-slate-300 ml-2 md:ml-4">
                <li>18 U.S.C. § 2510-2522 - Electronic Communications Privacy Act (ECPA)</li>
                <li>18 U.S.C. § 1030 - Computer Fraud and Abuse Act (CFAA)</li>
                <li>Federal Rules of Evidence (FRE) - Evidence Admissibility</li>
                <li>GDPR, CCPA, HIPAA - Data Privacy Compliance</li>
              </ul>
            </div>

            {/* Liability & Disclaimer */}
            <div className="space-y-2 md:space-y-3">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm md:text-base">
                <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-yellow-400" />
                3. Liability Disclaimer
              </h3>
              <p className="text-slate-300 leading-relaxed">
                Sentinel Forensics is provided "AS IS" without warranty of any kind. The developers, 
                Base44 platform, and associated parties assume NO LIABILITY for misuse, data loss, 
                legal consequences, or damages resulting from use of this software.
              </p>
              <p className="text-slate-300 leading-relaxed">
                <strong className="text-white">User Responsibilities:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 md:space-y-2 text-slate-300 ml-2 md:ml-4">
                <li>Obtain proper authorization before conducting investigations</li>
                <li>Maintain proper chain of custody for all evidence</li>
                <li>Comply with all applicable federal, state, and local laws</li>
                <li>Ensure data is handled according to privacy regulations</li>
                <li>Consult with legal counsel before submitting evidence to court</li>
              </ul>
            </div>

            {/* Evidence Admissibility */}
            <div className="space-y-2 md:space-y-3">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm md:text-base">
                <FileText className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
                4. Evidence Admissibility Notice
              </h3>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 md:p-4">
                <p className="text-yellow-200 leading-relaxed">
                  <strong className="text-yellow-300">⚠️ IMPORTANT:</strong> Digital evidence collected 
                  using this platform may NOT be legally admissible in Miami-Dade County courts until 
                  properly verified and authenticated per Florida Statute 90.803(6) and Federal Rules of Evidence.
                </p>
                <p className="text-yellow-200 leading-relaxed mt-2">
                  All evidence MUST be cryptographically verified, maintain an intact chain of custody, 
                  and be certified by a qualified forensic examiner before submission to legal proceedings.
                </p>
              </div>
            </div>

            {/* Prohibited Uses */}
            <div className="space-y-2 md:space-y-3">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm md:text-base">
                <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-red-400" />
                5. Prohibited Uses
              </h3>
              <p className="text-slate-300 leading-relaxed mb-2">
                <strong className="text-red-400">The following uses are STRICTLY PROHIBITED:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 md:space-y-2 text-red-300 ml-2 md:ml-4">
                <li>Unauthorized surveillance or monitoring of individuals</li>
                <li>Hacking, unauthorized access, or computer intrusion</li>
                <li>Violation of privacy laws or wiretapping statutes</li>
                <li>Corporate espionage or competitive intelligence gathering</li>
                <li>Stalking, harassment, or intimidation</li>
                <li>Any illegal or unethical activity</li>
              </ul>
            </div>

            {/* Miami-Dade Specific */}
            <div className="space-y-2 md:space-y-3">
              <h3 className="font-bold text-white text-sm md:text-base">6. Miami-Dade County Jurisdiction</h3>
              <p className="text-slate-300 leading-relaxed">
                This platform is designed to comply with Miami-Dade County Circuit Court requirements 
                for digital evidence. Users must consult with Florida-licensed attorneys before 
                submitting evidence collected via this platform to any court or law enforcement agency.
              </p>
            </div>

            {/* Professional Certification */}
            <div className="space-y-2 md:space-y-3">
              <h3 className="font-bold text-white text-sm md:text-base">7. Professional Certification</h3>
              <p className="text-slate-300 leading-relaxed">
                Users who testify as expert witnesses must meet Florida Statute 90.702 requirements 
                and possess relevant certifications (e.g., EnCE, GCFA, GCFE, CISSP, CEH) recognized 
                by Florida courts.
              </p>
            </div>
          </div>
        </ScrollArea>

        <div className="flex-shrink-0 space-y-3 md:space-y-4 pt-4 border-t border-slate-700">
          <div className="flex items-start gap-3 px-1">
            <Checkbox 
              id="accept-all" 
              checked={acceptAll}
              onCheckedChange={setAcceptAll}
              className="border-2 border-white data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600 mt-1 flex-shrink-0"
            />
            <label htmlFor="accept-all" className="text-xs md:text-sm text-slate-300 cursor-pointer leading-relaxed">
              I have read and agree to all Terms of Service, Legal Compliance requirements, Liability Disclaimers, 
              and acknowledge the Evidence Admissibility Notice. I understand this platform is for professional 
              forensics use only and will comply with all applicable federal, state, and local laws.
            </label>
          </div>

          <div className="flex flex-col-reverse md:flex-row justify-end gap-2 md:gap-3">
            <Button
              variant="outline"
              onClick={onDecline}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 w-full md:w-auto"
            >
              Decline & Exit
            </Button>
            <Button
              onClick={onAccept}
              disabled={!acceptAll}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed w-full md:w-auto"
            >
              Accept & Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}