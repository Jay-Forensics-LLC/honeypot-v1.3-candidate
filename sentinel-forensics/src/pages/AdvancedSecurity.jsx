
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Brain, FileText, Eye, Smartphone } from "lucide-react";
import AdvancedBehaviorAnalysis from "../components/security/AdvancedBehaviorAnalysis";
import DeviceProtection from "../components/security/DeviceProtection";
import AutomatedReportGenerator from "../components/security/AutomatedReportGenerator";
import SurveillanceDetector from "../components/security/SurveillanceDetector";

export default function AdvancedSecurity() {
  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Advanced Security Suite</h1>
          <p className="text-slate-400">AI-powered threat prediction, device protection, and real-time surveillance detection</p>
        </div>

        <Tabs defaultValue="behavior" className="space-y-6">
          <TabsList className="bg-slate-900/50 grid grid-cols-2 lg:grid-cols-4">
            <TabsTrigger value="behavior">
              <Brain className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">AI Behavior</span>
            </TabsTrigger>
            <TabsTrigger value="device">
              <Smartphone className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Device Protection</span>
            </TabsTrigger>
            <TabsTrigger value="reports">
              <FileText className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Reports</span>
            </TabsTrigger>
            <TabsTrigger value="surveillance">
              <Eye className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Surveillance</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="behavior">
            <AdvancedBehaviorAnalysis />
          </TabsContent>

          <TabsContent value="device">
            <DeviceProtection />
          </TabsContent>

          <TabsContent value="reports">
            <AutomatedReportGenerator />
          </TabsContent>

          <TabsContent value="surveillance">
            <SurveillanceDetector />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
