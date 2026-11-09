import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '../components/hooks/useUser';
import PageHeader from '../components/common/PageHeader';
import StatCard from '../components/common/StatCard';
import { RouteErrorBoundary } from '../components/errors/RouteErrorBoundary';
import LoadingState from '../components/common/LoadingState';
import ErrorState from '../components/common/ErrorState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ShoppingCart,
  Sparkles,
  Loader2,
  CheckCircle,
  Clock,
  DollarSign,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ProcurementAutomation() {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useUser();

  const { data: orders = [] } = useQuery({
    queryKey: ['procurement-orders'],
    queryFn: () => base44.entities.ProcurementOrder.filter({
      organization_id: user.organization_id
    }, '-created_date', 100),
    enabled: !!user
  });

  const { data: assets = [] } = useQuery({
    queryKey: ['assets-needing-replacement'],
    queryFn: async () => {
      const allAssets = await base44.entities.Asset.filter({
        organization_id: user.organization_id
      });
      return allAssets.filter(a => a.eol_prediction?.predicted_eol_date);
    },
    enabled: !!user
  });

  const generateOrderMutation = useMutation({
    mutationFn: async (asset_id) => {
      const response = await base44.functions.invoke('generateProcurementOrder', {
        asset_id
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-orders'] });
      toast.success('Procurement order generated');
    }
  });

  const approveOrderMutation = useMutation({
    mutationFn: async (order_id) => {
      return await base44.entities.ProcurementOrder.update(order_id, {
        status: 'approved',
        approved_by: user.email,
        approved_date: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-orders'] });
      toast.success('Order approved');
    }
  });

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      pending_approval: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      approved: 'bg-green-500/20 text-green-400 border-green-500/30',
      ordered: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      received: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    };
    return colors[status] || colors.draft;
  };

  return (
    <RouteErrorBoundary routeName="ProcurementAutomation" errorTitle="Procurement Error">
      <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">AI Procurement Automation</h1>
            <p className="text-slate-400 mt-1">Automated purchase order generation and vendor optimization</p>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid md:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-8 h-8 text-blue-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{orders.length}</p>
                  <p className="text-xs text-slate-400">Total Orders</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Clock className="w-8 h-8 text-yellow-400" />
                <div>
                  <p className="text-2xl font-bold text-white">
                    {orders.filter(o => o.status === 'pending_approval').length}
                  </p>
                  <p className="text-xs text-slate-400">Pending Approval</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-400" />
                <div>
                  <p className="text-2xl font-bold text-white">
                    {orders.filter(o => o.status === 'approved').length}
                  </p>
                  <p className="text-xs text-slate-400">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-purple-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{assets.length}</p>
                  <p className="text-xs text-slate-400">Assets Near EOL</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Assets Needing Replacement */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">Assets Approaching End-of-Life</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assets.map((asset) => (
              <Card key={asset.id} className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">{asset.asset_name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-slate-400">
                    <p>Predicted EOL: {format(new Date(asset.eol_prediction.predicted_eol_date), 'MMM d, yyyy')}</p>
                    <p>Current Value: ${asset.depreciation?.current_value || 'N/A'}</p>
                  </div>
                  <Button
                    onClick={() => generateOrderMutation.mutate(asset.id)}
                    disabled={generateOrderMutation.isLoading}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {generateOrderMutation.isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate PO
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Procurement Orders */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">Procurement Orders</h2>
          <div className="space-y-3">
            {orders.map((order) => (
              <Card key={order.id} className="bg-slate-900 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <ShoppingCart className="w-5 h-5 text-blue-400" />
                        <h3 className="text-white font-semibold">{order.po_number}</h3>
                        <Badge className={getStatusColor(order.status)}>
                          {order.status.replace('_', ' ')}
                        </Badge>
                        {order.recommended_by_ai && (
                          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                            <Sparkles className="w-3 h-3 mr-1" />
                            AI Generated
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-400">
                        <span>Vendor: {order.vendor}</span>
                        <span>Total: ${order.total_amount}</span>
                        <span>{format(new Date(order.created_date), 'MMM d, yyyy')}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedOrder(order);
                          setDetailDialogOpen(true);
                        }}
                        className="border-slate-700"
                      >
                        Details
                      </Button>
                      {order.status === 'draft' && (
                        <Button
                          size="sm"
                          onClick={() => approveOrderMutation.mutate(order.id)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Approve
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Order Detail Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">{selectedOrder?.po_number}</DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-400">Vendor</p>
                    <p className="text-white font-semibold">{selectedOrder.vendor}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Vendor Score</p>
                    <p className="text-white font-semibold">{selectedOrder.vendor_score}/100</p>
                  </div>
                </div>
                
                {selectedOrder.procurement_reasoning && (
                  <div className="p-3 bg-slate-800/50 rounded">
                    <p className="text-sm text-slate-400 mb-1">AI Reasoning:</p>
                    <p className="text-sm text-slate-300">{selectedOrder.procurement_reasoning}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-slate-400 mb-2">Items:</p>
                  <div className="space-y-2">
                    {selectedOrder.items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between p-2 bg-slate-800/50 rounded">
                        <div>
                          <p className="text-white text-sm">{item.product_name}</p>
                          <p className="text-xs text-slate-400">Qty: {item.quantity}</p>
                        </div>
                        <p className="text-white font-semibold">${item.total_price}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-700">
                  <div className="flex justify-between items-center">
                    <span className="text-lg text-white font-semibold">Total Amount:</span>
                    <span className="text-2xl text-green-400 font-bold">${selectedOrder.total_amount}</span>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
      </div>
    </RouteErrorBoundary>
  );
}