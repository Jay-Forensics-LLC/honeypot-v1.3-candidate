import React, { useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/components/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { 
  Wifi, 
  Shield, 
  Lock,
  FileSearch,
  Fingerprint,
  Database,
  Terminal,
  Scan,
  Smartphone,
  Crown,
  Search,
  Filter,
  Check,
  ChevronRight,
  FileText,
  Eye,
  Zap,
  Globe,
  HardDrive,
  Archive,
  FileCode,
  AlertCircle,
  Radio,
  Link as LinkIcon,
  Users,
  Map,
  Clock,
  Blocks
} from "lucide-react";

import NetworkScanner from "../components/tools/NetworkScanner";
import HashCalculator from "../components/tools/HashCalculator";
import MetadataExtractor from "../components/tools/MetadataExtractor";
import PortScanner from "../components/tools/PortScanner";
import ToolAccess from "../components/tools/ToolAccess";
import EncryptionUtility from "../components/security/EncryptionUtility";
import DatabaseAnalyzer from "../components/tools/DatabaseAnalyzer";
import MemorySnapshot from "../components/pegasus/MemorySnapshot";
import MVTPlusScanner from "../components/pegasus/MVTPlusScanner";
import OCRProcessor from "../components/evidence/OCRProcessor";
import RedactionTool from "../components/forensics/RedactionTool";
import ForensicZIPGenerator from "../components/forensics/ForensicZIPGenerator";

export default function Tools() {
  const [activeTab, setActiveTab] = useState("scanner");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTier, setFilterTier] = useState("all");
  const [isPending, startTransition] = useTransition();
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
    staleTime: 10 * 60 * 1000
  });

  // Comprehensive forensic tools suite
  const toolCategories = [
    {
      id: "scanner",
      name: "Network Scanner",
      description: "Scan and analyze network topology and connected devices",
      icon: Wifi,
      color: "from-blue-500 to-blue-600",
      tier: "free",
      component: NetworkScanner
    },
    {
      id: "hash",
      name: "Hash Calculator",
      description: "Calculate SHA-256 hashes for evidence integrity verification",
      icon: Fingerprint,
      color: "from-purple-500 to-purple-600",
      tier: "free",
      component: HashCalculator
    },
    {
      id: "metadata",
      name: "Metadata Extractor",
      description: "Extract and analyze file metadata for forensic investigation",
      icon: FileSearch,
      color: "from-green-500 to-green-600",
      tier: "free",
      component: MetadataExtractor
    },
    {
      id: "port",
      name: "Port Scanner",
      description: "Identify open ports and potential security vulnerabilities",
      icon: Scan,
      color: "from-orange-500 to-orange-600",
      tier: "professional",
      component: PortScanner
    },
    {
      id: "ocr",
      name: "OCR Text Extractor",
      description: "Extract text from images and scanned documents",
      icon: FileText,
      color: "from-teal-500 to-teal-600",
      tier: "free",
      component: OCRProcessor
    },
    {
      id: "redaction",
      name: "PII Redaction Tool",
      description: "Automatically redact sensitive information from documents",
      icon: Eye,
      color: "from-yellow-500 to-yellow-600",
      tier: "professional",
      component: RedactionTool,
      route: "PIIRedactor"
    },
    {
      id: "zip",
      name: "Forensic Package Generator",
      description: "Create court-ready evidence packages with chain of custody",
      icon: Archive,
      color: "from-indigo-500 to-indigo-600",
      tier: "professional",
      component: ForensicZIPGenerator
    },
    {
      id: "encryption",
      name: "Encryption Tools",
      description: "Encrypt and decrypt evidence with military-grade algorithms",
      icon: Lock,
      color: "from-red-500 to-red-600",
      tier: "professional",
      component: EncryptionUtility
    },
    {
      id: "database",
      name: "Database Forensics",
      description: "Analyze and recover data from databases",
      icon: Database,
      color: "from-pink-500 to-pink-600",
      tier: "enterprise",
      component: DatabaseAnalyzer
    },
    {
      id: "memory",
      name: "Memory Analyzer",
      description: "Analyze memory dumps for malware and hidden processes",
      icon: Terminal,
      color: "from-cyan-500 to-cyan-600",
      tier: "enterprise",
      component: MemorySnapshot
    },
    {
      id: "mobile",
      name: "Mobile Forensics (MVT)",
      description: "Extract and analyze data from mobile devices (MVT integration)",
      icon: Smartphone,
      color: "from-indigo-500 to-indigo-600",
      tier: "forensic_suite",
      component: MVTPlusScanner
    },
    {
      id: "yara",
      name: "YARA Rule Scanner",
      description: "Scan files and memory for malware signatures",
      icon: FileCode,
      color: "from-violet-500 to-violet-600",
      tier: "enterprise",
      route: "YARARules"
    },
    {
      id: "virustotal",
      name: "VirusTotal Lookup",
      description: "Check file hashes and URLs against VirusTotal database",
      icon: Globe,
      color: "from-blue-500 to-cyan-600",
      tier: "professional",
      route: "ThreatIntelligence"
    },
    {
      id: "disk",
      name: "Disk Imaging",
      description: "Create forensic disk images with verification",
      icon: HardDrive,
      color: "from-slate-500 to-slate-600",
      tier: "forensic_suite",
      route: "ForensicModule"
    },
    {
      id: "timeline",
      name: "Timeline Reconstruction",
      description: "Reconstruct event timelines from multiple evidence sources",
      icon: Clock,
      color: "from-orange-500 to-red-600",
      tier: "professional",
      route: "GeoTimeline"
    },
    {
      id: "correlation",
      name: "Evidence Correlation",
      description: "Find relationships between evidence items automatically",
      icon: LinkIcon,
      color: "from-purple-500 to-pink-600",
      tier: "enterprise",
      route: "AutoCorrelation"
    },
    {
      id: "ble",
      name: "BLE Device Monitor",
      description: "Monitor and analyze Bluetooth Low Energy devices",
      icon: Radio,
      color: "from-blue-400 to-blue-500",
      tier: "free",
      route: "BLEMonitor"
    },
    {
      id: "geo",
      name: "Geolocation Analysis",
      description: "Map and analyze location data from evidence",
      icon: Map,
      color: "from-green-500 to-emerald-600",
      tier: "professional",
      route: "GeoTimeline"
    },
    {
      id: "watchlist",
      name: "IOC Watchlist",
      description: "Monitor indicators of compromise and threat actors",
      icon: AlertCircle,
      color: "from-red-500 to-orange-600",
      tier: "professional",
      route: "IOCWatchlist"
    },
    {
      id: "blockchain",
      name: "Blockchain Verification",
      description: "Verify evidence integrity using blockchain anchoring",
      icon: Blocks,
      color: "from-indigo-500 to-purple-600",
      tier: "forensic_suite",
      route: "ChainOfCustody"
    }
  ];

  const tierHierarchy = {
    free: 0,
    plus: 1,
    professional: 1,
    pro: 2,
    enterprise: 2,
    forensic_suite: 3
  };

  const userTierLevel = user?.subscription_tier ? (tierHierarchy[user.subscription_tier] ?? 0) : 0;

  const filteredTools = toolCategories.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = filterTier === "all" || tool.tier === filterTier;
    return matchesSearch && matchesTier;
  });

  const getTierBadge = (tier) => {
    switch(tier) {
      case 'free':
        return { bg: 'bg-slate-600', text: 'FREE', icon: null };
      case 'professional':
        return { bg: 'bg-blue-600', text: 'PLUS', icon: null };
      case 'enterprise':
        return { bg: 'bg-purple-600', text: 'PRO', icon: Crown };
      case 'forensic_suite':
        return { bg: 'bg-gradient-to-r from-purple-600 to-pink-600', text: 'FORENSIC', icon: Shield };
      default:
        return { bg: 'bg-slate-600', text: 'FREE', icon: null };
    }
  };

  const tierCounts = {
    all: toolCategories.length,
    free: toolCategories.filter(t => t.tier === 'free').length,
    professional: toolCategories.filter(t => t.tier === 'professional').length,
    enterprise: toolCategories.filter(t => t.tier === 'enterprise').length,
    forensic_suite: toolCategories.filter(t => t.tier === 'forensic_suite').length
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
        {/* Header */}
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Forensic Tools Suite</h1>
            <p className="text-slate-400 text-base">Advanced utilities for digital forensics and security analysis</p>
          </div>

          {/* User Status */}
          {user && (
            <Card className="bg-gradient-to-r from-slate-900 to-slate-800 border-slate-700">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-medium">{user.full_name || user.email}</p>
                    <p className="text-slate-400 text-sm">
                      {user.subscription_tier ? (
                        <span className="flex items-center gap-1">
                          <Check className="w-3 h-3 text-green-400" />
                          {user.subscription_tier.replace('_', ' ').toUpperCase()} Plan
                        </span>
                      ) : (
                        'Free Plan'
                      )}
                    </p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => startTransition(() => navigate(createPageUrl('Pricing')))}
                  className="border-slate-600 hover:bg-slate-700"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {['all', 'free', 'professional', 'enterprise', 'forensic_suite'].map((tier) => {
                const label = tier === 'all' ? 'All' : 
                             tier === 'forensic_suite' ? 'Forensic' : 
                             tier.charAt(0).toUpperCase() + tier.slice(1);
                return (
                  <Button
                    key={tier}
                    variant={filterTier === tier ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterTier(tier)}
                    className={`whitespace-nowrap min-w-fit px-4 ${
                      filterTier === tier 
                        ? 'bg-red-600 hover:bg-red-700 border-red-600 text-white' 
                        : 'border-slate-700 bg-slate-800 text-white hover:bg-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {filterTier !== tier && <Filter className="w-3 h-3" />}
                      <span>{label}</span>
                      <span className="opacity-70">({tierCounts[tier]})</span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTools.map((tool) => {
            const Icon = tool.icon;
            const hasAccess = userTierLevel >= tierHierarchy[tool.tier];
            const badge = getTierBadge(tool.tier);
            const BadgeIcon = badge.icon;
            
            return (
              <Card 
                key={tool.id}
                className={`bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all cursor-pointer group ${
                  activeTab === tool.id ? 'ring-2 ring-red-500 border-red-500' : ''
                }`}
                onClick={() => {
                  if (tool.route) {
                    startTransition(() => navigate(createPageUrl(tool.route)));
                  } else {
                    startTransition(() => setActiveTab(tool.id));
                  }
                }}
              >
                <CardHeader>
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-12 h-12 bg-gradient-to-br ${tool.color} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <Badge className={`${badge.bg} text-white border-0 flex items-center gap-1`}>
                      {BadgeIcon && <BadgeIcon className="w-3 h-3" />}
                      {badge.text}
                    </Badge>
                  </div>
                  <CardTitle className="text-white text-lg group-hover:text-red-400 transition-colors">
                    {tool.name}
                  </CardTitle>
                  <CardDescription className="text-slate-400 text-sm">
                    {tool.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {hasAccess ? (
                        <span className="flex items-center gap-1 text-green-400 text-sm">
                          <Check className="w-4 h-4" />
                          Available
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-400 text-sm">
                          <Lock className="w-4 h-4" />
                          Locked
                        </span>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-red-400 group-hover:translate-x-1 transition-all" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Active Tool */}
        {activeTab && (() => {
          const tool = toolCategories.find(t => t.id === activeTab);
          return tool?.component ? (
            <Card className="bg-slate-900/80 border-slate-800">
              <CardHeader className="border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {(() => {
                      const Icon = tool?.icon;
                      const badge = getTierBadge(tool?.tier);
                      const BadgeIcon = badge?.icon;
                      return (
                        <>
                          <div className={`w-14 h-14 bg-gradient-to-br ${tool?.color} rounded-xl flex items-center justify-center`}>
                            <Icon className="w-7 h-7 text-white" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <CardTitle className="text-white text-xl">{tool?.name}</CardTitle>
                              <Badge className={`${badge?.bg} text-white border-0 flex items-center gap-1`}>
                                {BadgeIcon && <BadgeIcon className="w-3 h-3" />}
                                {badge?.text}
                              </Badge>
                            </div>
                            <CardDescription className="text-slate-400">{tool?.description}</CardDescription>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {(() => {
                  const ToolComponent = tool?.component;
                  return (
                    <ToolAccess requiredTier={tool?.tier}>
                      <ToolComponent />
                    </ToolAccess>
                  );
                })()}
              </CardContent>
            </Card>
          ) : null;
        })()}

        {filteredTools.length === 0 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg mb-2">No tools found</p>
              <p className="text-slate-500 text-sm">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}