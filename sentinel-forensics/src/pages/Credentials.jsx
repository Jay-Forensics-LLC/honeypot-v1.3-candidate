import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Scale, FileText, MapPin, Radio } from "lucide-react";

export default function Credentials() {
  return (
    <div className="w-full min-h-screen bg-[#0B0B0C] p-4 md:p-8 pb-24">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="w-12 h-12 text-red-500" />
            <h1 className="text-4xl font-bold text-white">Sentinel Forensics</h1>
          </div>
          <p className="text-slate-400 text-lg">Digital Forensics & Surveillance Detection Platform</p>
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Scale className="w-6 h-6 text-red-500" />
              Founding Credential: Case Documentation
            </CardTitle>
          </CardHeader>
          <CardContent className="text-slate-300 space-y-4">
            <p className="text-sm text-slate-400 italic">
              This platform was developed in response to documented surveillance tracking across multiple jurisdictions. 
              The following sworn affidavit demonstrates the real-world need for advanced digital forensics tools.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-red-500/30">
          <CardHeader className="border-b border-slate-800">
            <CardTitle className="text-white text-2xl">AFFIDAVIT OF RANDALL J. HUNTER</CardTitle>
            <p className="text-slate-400 text-sm mt-2">
              Re: Multi-State Reappearance of Covert BLE Tracking Device
            </p>
          </CardHeader>
          <CardContent className="space-y-6 text-slate-300 leading-relaxed pt-6">
            <div className="bg-red-950/20 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-red-400 mt-1 shrink-0" />
                <div>
                  <p className="font-semibold text-white">Location of Incident</p>
                  <p className="text-sm">Room 15, Budget Motel</p>
                  <p className="text-sm text-red-400">29.62464° N, 81.89134° W</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-slate-400 italic mb-4">
                I, Randall Joseph Hunter, being duly sworn, depose and state under penalty of perjury as follows:
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white mb-3">1. Identity of Affiant</h3>
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>My name is Randall Joseph Hunter.</li>
                <li>I am a resident of Miami-Dade County, Florida.</li>
                <li>I am the victim of an ongoing, multi-modal surveillance campaign involving digital, physical, wireless, and environmental monitoring, as documented in my Master Surveillance Dossier compiled from May 2025 to present.</li>
                <li>I am competent to make this statement, and all facts herein are based on my personal knowledge, direct observation, and contemporaneous forensic logs.</li>
              </ol>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white mb-3">2. Purpose of this Affidavit</h3>
              <p className="mb-3">
                This affidavit documents the reappearance of a covert Bluetooth Low Energy (BLE) tracking device which has been observed following me for over six months across multiple counties and jurisdictions. The device's identifiers, service signatures, and behavioral characteristics match those recorded previously at:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                <li>10015 Banyan Drive (Coral Gables, FL)</li>
                <li>Guitar Center – 7736 N Kendall Dr</li>
                <li>Shell Gas Station – 1492 S Dixie Hwy</li>
                <li>3600 Grand Ave Apartment</li>
                <li>Oak Ave, Miami</li>
                <li>Hemp Love Farms – Doral, FL</li>
                <li>AT&T Store (25.68837° N, 80.30844° W)</li>
                <li>Additional roadways, parking lots, and commercial environments</li>
              </ul>
              <p className="mt-3 text-sm text-slate-400">
                These prior incidents are documented in Exhibits A–Q of the Master Surveillance Dossier.
                This affidavit constitutes <span className="text-red-400 font-semibold">Exhibit R</span> for the November 2025 surveillance events.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white mb-3">3. Location of the Present Event</h3>
              <p className="mb-2">On the date of this incident, I was staying in:</p>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <p className="font-semibold text-white">Room 15, Budget Motel</p>
                <p className="text-sm text-red-400">GPS Coordinates: 29.62464° N, 81.89134° W</p>
                <p className="text-sm text-slate-400 mt-2">
                  This location is approximately 300+ miles north of my primary residence and is not associated with any prior scanning environment.
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                <Radio className="w-6 h-6 text-red-500" />
                4. BLE Scan Methodology
              </h3>
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>The scan was performed using the nRF Connect application.</li>
                <li>Bluetooth settings were controlled exclusively by me; no third-party software had access.</li>
                <li>The scan was initiated as part of ongoing evidence collection to detect irregular BLE activity consistent with prior surveillance incidents.</li>
                <li>All logs were captured as JSON directly from the application's "Final Scanner State" export.</li>
              </ol>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white mb-3">5. Findings — Identification of the Suspect Device</h3>
              <p className="mb-3">
                During the scan, several normal consumer and infrastructure devices were detected (Ring camera, Microsoft beacon, "Quest 2" headset, hotel remote). These devices broadcast standard BLE profiles and pose no direct relevance to this investigation.
              </p>
              <p className="mb-3">
                However, <span className="text-red-400 font-semibold">one device matched exactly the same proprietary identifiers used in prior surveillance attempts:</span>
              </p>
              
              <div className="bg-red-950/20 border border-red-500/50 rounded-lg p-5 space-y-3">
                <h4 className="font-bold text-white text-lg">Suspect Device Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-400">Peripheral Name:</span>
                    <span className="text-white font-mono ml-2">"iPad"</span>
                  </div>
                  <div>
                    <span className="text-slate-400">UUID:</span>
                    <span className="text-white font-mono ml-2 text-xs">6BB2387B-2C0E-5744-9329-411225E7AF5C</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Tx Power:</span>
                    <span className="text-red-400 font-semibold ml-2">+17 dBm</span>
                    <span className="text-xs text-slate-500 ml-1">(unusually high for a tablet)</span>
                  </div>
                  <div>
                    <span className="text-slate-400">RSSI:</span>
                    <span className="text-white font-mono ml-2">–79 dBm</span>
                  </div>
                </div>
                
                <div className="mt-4">
                  <p className="font-semibold text-white mb-2">GATT Services Advertised:</p>
                  <ul className="list-disc list-inside space-y-1 font-mono text-xs text-slate-300 ml-4">
                    <li>D0611E78-BBB4-4591-A5F8-487910AE4366</li>
                    <li>9FA480E0-4967-4542-9390-D343DC5D04AE</li>
                    <li>AF0BADB1-5B99-43CD-917A-A77BC549E3CC (enumerated during connection)</li>
                    <li>Battery Service (0x180F)</li>
                    <li>Current Time Service (0x1805)</li>
                    <li>Device Information (0x180A)</li>
                  </ul>
                </div>

                <p className="text-red-400 font-semibold mt-3">
                  These UUIDs match exactly the proprietary BLE signature family previously detected in Miami-Dade County at all major surveillance events from June–August 2025.
                </p>
              </div>

              <div className="mt-4 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <h4 className="font-bold text-white mb-2">Appearance Identity Manipulation</h4>
                <p className="mb-2">During the initial advertising:</p>
                <ul className="list-disc list-inside space-y-1 ml-4 text-sm">
                  <li>Device broadcast as <span className="text-slate-400">Generic</span></li>
                  <li>Then changed to <span className="text-blue-400">iPad</span></li>
                  <li>Upon connection, changed again to <span className="text-red-400">Clock</span></li>
                </ul>
                <p className="mt-3 text-red-400 font-semibold text-sm">
                  This identity morphing is not performed by any commercial iPad model. It is consistent with protocol-level masking, deceptive GAP identity modulation, and surveillance implants designed to blend into consumer device ecosystems.
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white mb-3">6. Technical and Investigative Significance</h3>
              <ol className="list-decimal list-inside space-y-3 ml-4">
                <li>
                  <span className="font-semibold text-white">Six-Month Recurrence:</span><br />
                  The same UUIDs, same characteristic clusters, and same identity-swap behavior have followed me across different counties, different cities, different states, different networks, and different physical environments.
                </li>
                <li>
                  <span className="font-semibold text-white">Mobile Tracking Characteristics:</span><br />
                  The device reappeared in a remote location with no logical connection to my home or usual surroundings. This indicates person-centric tracking, not environment-centric, and active tailing, not incidental detection.
                </li>
                <li>
                  <span className="font-semibold text-white">Proximity:</span><br />
                  RSSI –79 dBm at TxPower 17 dBm suggests placement inside Room 15, behind a single interior wall, or in an adjacent room, vehicle, or concealed object.
                </li>
                <li>
                  <span className="font-semibold text-white">Access Controls:</span><br />
                  The device refused standard read operations with "Authentication insufficient," indicating privilege layers, pre-existing authorized controller, and possible remote operator.
                </li>
                <li>
                  <span className="font-semibold text-white">Consistency With Earlier Incidents:</span><br />
                  This is the same "Clock Device" triad (D0611E78 / 9FA480E0 / AF0BADB1) documented repeatedly in my logs.
                </li>
              </ol>

              <div className="mt-4 bg-red-950/30 border-l-4 border-red-500 p-4">
                <p className="text-white font-bold text-lg">
                  In summary: This device is not a normal iPad. It is a surveillance beacon. And it followed me across the state.
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                <FileText className="w-6 h-6 text-red-500" />
                7. Supporting Evidence
              </h3>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Full nRF Connect Final Scanner State JSON</li>
                <li>GPS Metadata (29.62464° N, 81.89134° W)</li>
                <li>Historical BLE logs from the Master Surveillance Dossier</li>
                <li>Prior sworn affidavits documenting identical device signatures</li>
                <li>Photos taken during the trip, archived under the November 2025 chain of custody</li>
                <li>Receiver-level RF consistency with prior BLE tailing events</li>
              </ul>
              <p className="mt-3 text-sm text-slate-400">
                All are preserved, timestamped, and available for judicial review.
              </p>
            </div>

            <div className="border-t border-slate-700 pt-6 mt-6">
              <h3 className="text-xl font-bold text-white mb-3">8. Sworn Statement</h3>
              <p className="italic">
                I hereby swear under penalty of perjury that the facts stated in this affidavit are true and correct to the best of my knowledge and recollection.
              </p>
              <div className="mt-4 space-y-2 text-sm">
                <p>Executed this ____ day of November 2025</p>
                <p>At: Budget Motel, Room 15 – 29.62464° N, 81.89134° W</p>
              </div>
              <div className="mt-6 border-t border-slate-600 pt-4">
                <p className="text-sm text-slate-400">_________________________________</p>
                <p className="font-semibold text-white">Randall Joseph Hunter</p>
                <p className="text-sm text-slate-400">Affiant</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-950/20 border-blue-500/30">
          <CardContent className="p-6">
            <p className="text-slate-300 text-center">
              <span className="font-semibold text-white">Sentinel Forensics</span> was built to detect, document, and defend against sophisticated surveillance operations like the one described above. This platform provides the tools necessary for evidence collection, chain-of-custody management, and forensic analysis in the digital age.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}