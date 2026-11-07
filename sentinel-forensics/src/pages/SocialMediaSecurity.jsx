import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Instagram, Shield } from "lucide-react";
import AutomationWorkflow from "../components/automation/AutomationWorkflow";

export default function SocialMediaSecurity() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Social Media & Automation</h1>
        <p className="text-slate-400">Advanced social media monitoring and automated security workflows</p>
      </div>

      <Tabs defaultValue="social" className="space-y-6">
        <TabsList className="bg-slate-900/50">
          <TabsTrigger value="social">
            <Instagram className="w-4 h-4 mr-2" />
            Social Media
          </TabsTrigger>
          <TabsTrigger value="automation">
            <Shield className="w-4 h-4 mr-2" />
            Automation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="social">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <p className="text-slate-400">Social media monitoring coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation">
          <AutomationWorkflow />
        </TabsContent>
      </Tabs>
    </div>
  );
}