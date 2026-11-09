import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Scale, Shield, FileText, AlertTriangle, CheckCircle } from "lucide-react";

export default function LegalDisclaimer() {
  return (
    <Card className="bg-slate-900/50 border-slate-800 border-2">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Scale className="w-6 h-6 text-blue-400" />
          Legal Notice & Compliance Statement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Copyright Notice */}
        <Alert className="bg-blue-500/10 border-blue-500/30">
          <FileText className="h-5 w-5 text-blue-400" />
          <AlertDescription className="text-blue-200 text-sm">
            <strong className="block mb-2">© 2024-2025 SENTINEL FORENSICS</strong>
            <p className="text-xs">
              All rights reserved. This software and its components are protected under United States 
              copyright law and international treaties. Unauthorized reproduction, distribution, or use 
              is strictly prohibited and may result in severe civil and criminal penalties.
            </p>
          </AlertDescription>
        </Alert>

        {/* Florida State Compliance */}
        <Alert className="bg-orange-500/10 border-orange-500/30">
          <Shield className="h-5 w-5 text-orange-400" />
          <AlertDescription className="text-orange-200 text-sm">
            <strong className="block mb-2">FLORIDA STATE COMPLIANCE NOTICE</strong>
            <div className="space-y-2 text-xs">
              <p>
                <strong>Miami-Dade County & State of Florida:</strong> This software is designed to comply 
                with Florida Statutes including but not limited to:
              </p>
              <ul className="list-disc ml-5 space-y-1">
                <li><strong>F.S. 934.03:</strong> Florida Security of Communications Act - All monitoring and 
                interception capabilities require proper authorization and consent</li>
                <li><strong>F.S. 815.04:</strong> Computer-Related Crimes - Software must only be used for 
                lawful purposes with proper authorization</li>
                <li><strong>F.S. 119.07:</strong> Public Records - Evidence collection must comply with 
                Florida public records law when applicable</li>
                <li><strong>F.S. 90.803(6):</strong> Business Records Exception - Forensic evidence must 
                meet Florida Rules of Evidence standards</li>
                <li><strong>Miami-Dade County Ordinances:</strong> Users must comply with all local cybersecurity 
                and privacy regulations</li>
              </ul>
            </div>
          </AlertDescription>
        </Alert>

        {/* Authorized Use Only */}
        <Alert className="bg-red-500/10 border-red-500/30 border-2">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <AlertDescription className="text-red-200 text-sm">
            <strong className="block mb-2 text-lg">⚠️ AUTHORIZED USE ONLY</strong>
            <div className="space-y-2 text-xs">
              <p className="font-semibold">
                This software is intended EXCLUSIVELY for:
              </p>
              <ul className="list-disc ml-5 space-y-1">
                <li>Licensed digital forensics professionals</li>
                <li>Law enforcement personnel with proper authority</li>
                <li>Corporate security teams with written authorization</li>
                <li>Cybersecurity researchers in controlled environments</li>
                <li>Individuals monitoring their OWN devices with legal ownership</li>
              </ul>
              <p className="font-semibold mt-3 text-red-300">
                PROHIBITED USES include but are not limited to:
              </p>
              <ul className="list-disc ml-5 space-y-1">
                <li>Unauthorized access to computer systems or networks</li>
                <li>Monitoring or surveillance of individuals without consent</li>
                <li>Intercepting communications without proper legal authorization</li>
                <li>Stalking, harassment, or invasion of privacy</li>
                <li>Any activity that violates federal, state, or local law</li>
              </ul>
              <p className="font-semibold mt-3 text-red-400">
                VIOLATION OF THESE TERMS MAY RESULT IN CRIMINAL PROSECUTION UNDER FLORIDA 
                STATE LAW AND FEDERAL COMPUTER FRAUD AND ABUSE ACT (18 U.S.C. § 1030)
              </p>
            </div>
          </AlertDescription>
        </Alert>

        {/* Professional Services Disclaimer */}
        <Alert className="bg-yellow-500/10 border-yellow-500/30">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          <AlertDescription className="text-yellow-200 text-sm">
            <strong className="block mb-2">PROFESSIONAL SERVICES DISCLAIMER</strong>
            <p className="text-xs">
              Sentinel Forensics is a SOFTWARE TOOL and does not constitute legal advice, professional 
              investigative services, or expert testimony. Users in Florida requiring professional forensic 
              services should consult licensed professionals including:
            </p>
            <ul className="list-disc ml-5 mt-2 text-xs space-y-1">
              <li>Florida-licensed private investigators (F.S. 493)</li>
              <li>Certified digital forensics examiners</li>
              <li>Licensed attorneys for legal matters</li>
              <li>Law enforcement agencies with jurisdiction</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Evidence Admissibility */}
        <Alert className="bg-purple-500/10 border-purple-500/30">
          <FileText className="h-5 w-5 text-purple-400" />
          <AlertDescription className="text-purple-200 text-sm">
            <strong className="block mb-2">EVIDENCE ADMISSIBILITY NOTICE</strong>
            <p className="text-xs">
              While Sentinel Forensics implements forensic-grade evidence collection and chain-of-custody 
              tracking, the admissibility of digital evidence in Florida courts depends on multiple factors 
              including proper collection procedures, authentication, and compliance with Florida Rules of 
              Evidence. Users should consult with qualified legal counsel regarding evidence admissibility 
              for specific cases in Miami-Dade County Circuit Courts or Florida State Courts.
            </p>
          </AlertDescription>
        </Alert>

        {/* Privacy & Data Protection */}
        <Alert className="bg-green-500/10 border-green-500/30">
          <Shield className="h-5 w-5 text-green-400" />
          <AlertDescription className="text-green-200 text-sm">
            <strong className="block mb-2">FLORIDA PRIVACY RIGHTS</strong>
            <p className="text-xs">
              Users must respect Florida constitutional privacy rights (Article I, Section 23, Florida Constitution) 
              and comply with applicable federal laws including:
            </p>
            <ul className="list-disc ml-5 mt-2 text-xs space-y-1">
              <li>Electronic Communications Privacy Act (ECPA)</li>
              <li>Computer Fraud and Abuse Act (CFAA)</li>
              <li>Stored Communications Act (SCA)</li>
              <li>Fourth Amendment protections against unreasonable searches</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Limitation of Liability */}
        <Alert className="bg-slate-700/30 border-slate-600">
          <Scale className="h-5 w-5 text-slate-400" />
          <AlertDescription className="text-slate-300 text-sm">
            <strong className="block mb-2">LIMITATION OF LIABILITY</strong>
            <p className="text-xs">
              Sentinel Forensics is provided "AS IS" without warranties of any kind. The developers and 
              distributors are not liable for any misuse, damages, or legal consequences arising from the 
              use of this software. Users assume full responsibility for compliance with all applicable laws 
              in Miami-Dade County, Florida, and the United States.
            </p>
          </AlertDescription>
        </Alert>

        {/* Compliance Badges */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-700">
          <Badge className="bg-blue-500 text-white">
            <CheckCircle className="w-3 h-3 mr-1" />
            Florida Compliant
          </Badge>
          <Badge className="bg-green-500 text-white">
            <CheckCircle className="w-3 h-3 mr-1" />
            Miami-Dade County
          </Badge>
          <Badge className="bg-purple-500 text-white">
            <CheckCircle className="w-3 h-3 mr-1" />
            US Copyright Protected
          </Badge>
          <Badge className="bg-orange-500 text-white">
            <CheckCircle className="w-3 h-3 mr-1" />
            ECPA Compliant
          </Badge>
        </div>

        {/* Contact Information */}
        <div className="text-xs text-slate-400 pt-4 border-t border-slate-700">
          <p>
            For legal inquiries, licensing, or compliance questions regarding Miami-Dade County operations:
          </p>
          <p className="mt-1">
            <strong>Legal Department:</strong> legal@sentinelforensics.com
          </p>
          <p>
            <strong>Compliance Officer:</strong> compliance@sentinelforensics.com
          </p>
          <p className="mt-2 text-slate-500">
            Sentinel Forensics™ is a registered trademark. Patent pending.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}