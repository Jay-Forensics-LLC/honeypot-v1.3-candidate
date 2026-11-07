import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Calendar,
  DollarSign,
  TrendingDown,
  Sparkles,
  Loader2,
  AlertTriangle,
  Clock,
  RefreshCw
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

export default function AssetLifecycleManager({ asset, onUpdate }) {
  const [isCalculating, setIsCalculating] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);

  const calculateDepreciation = async () => {
    setIsCalculating(true);
    try {
      const response = await base44.functions.invoke('calculateAssetDepreciation', {
        asset_id: asset.id
      });
      
      toast.success('Depreciation calculated', {
        description: `Current value: $${response.data.current_value}`
      });
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error('Calculation failed', { description: error.message });
    } finally {
      setIsCalculating(false);
    }
  };

  const predictEOL = async () => {
    setIsPredicting(true);
    try {
      const response = await base44.functions.invoke('predictAssetEOL', {
        asset_id: asset.id
      });
      
      toast.success('EOL prediction complete', {
        description: response.data.recommendation_summary
      });
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error('Prediction failed', { description: error.message });
    } finally {
      setIsPredicting(false);
    }
  };

  const warrantyExpiry = asset.warranty_expiry;
  const leaseEnd = asset.lease_info?.lease_end;
  const daysToWarrantyExpiry = warrantyExpiry ? differenceInDays(new Date(warrantyExpiry), new Date()) : null;
  const daysToLeaseEnd = leaseEnd ? differenceInDays(new Date(leaseEnd), new Date()) : null;

  return (
    <div className="space-y-4">
      {/* Expiration Alerts */}
      {daysToWarrantyExpiry !== null && daysToWarrantyExpiry <= 90 && daysToWarrantyExpiry >= 0 && (
        <Card className="bg-orange-950/20 border-orange-500/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              <div>
                <p className="text-sm font-semibold text-orange-300">Warranty Expiring Soon</p>
                <p className="text-xs text-orange-400">
                  {daysToWarrantyExpiry} days remaining until {format(new Date(warrantyExpiry), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {daysToLeaseEnd !== null && daysToLeaseEnd <= 90 && daysToLeaseEnd >= 0 && (
        <Card className="bg-purple-950/20 border-purple-500/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-purple-400" />
              <div>
                <p className="text-sm font-semibold text-purple-300">Lease Ending Soon</p>
                <p className="text-xs text-purple-400">
                  {daysToLeaseEnd} days remaining until {format(new Date(leaseEnd), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Depreciation */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-blue-400" />
              Depreciation
            </CardTitle>
            <Button
              size="sm"
              onClick={calculateDepreciation}
              disabled={isCalculating || !asset.purchase_price}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isCalculating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {asset.depreciation?.current_value ? (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Original Value</span>
                <span className="text-lg font-bold text-white">${asset.purchase_price}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Current Value</span>
                <span className="text-lg font-bold text-green-400">
                  ${asset.depreciation.current_value}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Depreciation</span>
                <span className="text-lg font-bold text-red-400">
                  -${(asset.purchase_price - asset.depreciation.current_value).toFixed(2)}
                </span>
              </div>
              {asset.depreciation.last_calculated && (
                <p className="text-xs text-slate-500">
                  Last calculated: {format(new Date(asset.depreciation.last_calculated), 'MMM d, yyyy')}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400">Click to calculate current asset value</p>
          )}
        </CardContent>
      </Card>

      {/* Lease Information */}
      {asset.lease_info?.is_leased && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-400" />
              Lease Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Lessor</span>
              <span className="text-sm text-white">{asset.lease_info.lessor}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Monthly Cost</span>
              <span className="text-sm text-white">${asset.lease_info.monthly_cost}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Lease End</span>
              <span className="text-sm text-white">
                {format(new Date(asset.lease_info.lease_end), 'MMM d, yyyy')}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* EOL Prediction */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              AI EOL Prediction
            </CardTitle>
            <Button
              size="sm"
              onClick={predictEOL}
              disabled={isPredicting}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isPredicting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Predict'
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {asset.eol_prediction ? (
            <>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-slate-400">Predicted EOL</span>
                  <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                    {asset.eol_prediction.confidence}% confidence
                  </Badge>
                </div>
                <p className="text-xl font-bold text-white">
                  {format(new Date(asset.eol_prediction.predicted_eol_date), 'MMMM d, yyyy')}
                </p>
              </div>

              {asset.eol_prediction.factors && asset.eol_prediction.factors.length > 0 && (
                <div>
                  <p className="text-sm text-slate-400 mb-2">Key Factors:</p>
                  <ul className="space-y-1">
                    {asset.eol_prediction.factors.map((factor, idx) => (
                      <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                        <span className="text-purple-400">•</span>
                        {factor}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {asset.eol_prediction.replacement_suggestions && asset.eol_prediction.replacement_suggestions.length > 0 && (
                <div>
                  <p className="text-sm text-slate-400 mb-2">Replacement Suggestions:</p>
                  <div className="space-y-2">
                    {asset.eol_prediction.replacement_suggestions.slice(0, 3).map((suggestion, idx) => (
                      <div key={idx} className="p-2 bg-slate-800/50 rounded">
                        <div className="flex justify-between items-start mb-1">
                          <p className="text-sm font-semibold text-white">{suggestion.product_name}</p>
                          <span className="text-xs text-green-400">${suggestion.estimated_cost}</span>
                        </div>
                        <p className="text-xs text-slate-400">{suggestion.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400">Click to predict end-of-life and get replacement recommendations</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}