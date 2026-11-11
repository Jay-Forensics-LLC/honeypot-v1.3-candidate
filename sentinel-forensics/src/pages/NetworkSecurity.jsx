import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Globe, 
  Shield,
  Droplet,
  Network,
  Activity
} from "lucide-react";

import LeakDetector from "../components/network/LeakDetector";

export default function NetworkSecurity() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Network className="w-8 h-8 text-blue-400" />
          Network Security Suite
        </h1>
        <p className="text-slate-400">VPN, Proxy, and privacy leak protection</p>
      </div>

      {/* Stats Overview */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <Shield className="w-8 h-8 text-green-400 mb-2" />
            <p className="text-2xl font-bold text-white">VPN</p>
            <p className="text-xs text-slate-400">Connection manager</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <Globe className="w-8 h-8 text-blue-400 mb-2" />
            <p className="text-2xl font-bold text-white">Proxy Pool</p>
            <p className="text-xs text-slate-400">Anonymous routing</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <Droplet className="w-8 h-8 text-cyan-400 mb-2" />
            <p className="text-2xl font-bold text-white">Leak Detector</p>
            <p className="text-xs text-slate-400">Privacy validation</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <Activity className="w-8 h-8 text-purple-400 mb-2" />
            <p className="text-2xl font-bold text-white">Live Monitor</p>
            <p className="text-xs text-slate-400">Traffic analysis</p>
          </CardContent>
        </Card>
      </div>

      {/* Modules */}
      <Tabs defaultValue="vpn" className="space-y-6">
        <TabsList className="bg-slate-900/50 grid grid-cols-3 gap-2">
          <TabsTrigger value="vpn" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            VPN Manager
          </TabsTrigger>
          <TabsTrigger value="proxy" className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Proxy Pool
          </TabsTrigger>
          <TabsTrigger value="leak" className="flex items-center gap-2">
            <Droplet className="w-4 h-4" />
            Leak Detector
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vpn">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <p className="text-slate-400">VPN management coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proxy">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <p className="text-slate-400">Proxy pool management coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leak">
          <LeakDetector />
        </TabsContent>
      </Tabs>
    </div>
  );
}