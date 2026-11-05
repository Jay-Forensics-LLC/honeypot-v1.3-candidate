import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function ToolAccess({ requiredTier, children }) {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const tierHierarchy = {
    free: 0,
    plus: 1,
    professional: 1,
    pro: 2,
    enterprise: 2,
    forensic_suite: 3
  };

  const userTier = tierHierarchy[user?.subscription_tier] ?? 0;
  const requiredTierLevel = tierHierarchy[requiredTier] ?? 0;
  const hasAccess = userTier >= requiredTierLevel;

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
        <Lock className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">Premium Feature</h3>
      <p className="text-slate-400 mb-6 max-w-md">
        This tool requires a {requiredTier.replace('_', ' ').toUpperCase()} subscription or higher.
        Upgrade your plan to unlock this feature.
      </p>
      <Link to={createPageUrl("Subscription")}>
        <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
          View Upgrade Options
        </Button>
      </Link>
    </div>
  );
}