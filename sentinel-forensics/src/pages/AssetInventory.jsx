import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RouteErrorBoundary } from "../components/errors/RouteErrorBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Package,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Loader2,
  AlertCircle,
  Calendar,
  DollarSign,
  MapPin,
  User,
  RefreshCw,
  Download,
  Link as LinkIcon,
  Clock,
  Activity,
  FileText,
  Shield
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import AITaggingPanel from "../components/assets/AITaggingPanel";
import AssetLifecycleManager from "../components/assets/AssetLifecycleManager";
import AIAssetDiscoveryPanel from "../components/assets/AIAssetDiscoveryPanel";
import AILifecyclePredictionPanel from "../components/assets/AILifecyclePredictionPanel";
import AIOrphanedAssetsPanel from "../components/assets/AIOrphanedAssetsPanel";

export default function AssetInventory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [assetDetailOpen, setAssetDetailOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['assets', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.Asset.filter(
        { organization_id: user.organization_id },
        '-created_date',
        1000
      );
    },
    enabled: !!user?.organization_id
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.Device.filter(
        { organization_id: user.organization_id },
        '-enrolled_at',
        500
      );
    },
    enabled: !!user?.organization_id
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts-for-assets', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.Alert.filter(
        { organization_id: user.organization_id },
        '-detection_timestamp',
        200
      );
    },
    enabled: !!user?.organization_id
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases-for-assets', user?.organization_id],
    queryFn: async () => {
      if (!user?.organization_id) return [];
      return await base44.entities.Case.filter(
        { organization_id: user.organization_id },
        '-created_date',
        200
      );
    },
    enabled: !!user?.organization_id
  });

  const [formData, setFormData] = useState({
    asset_name: '',
    asset_type: 'physical',
    category: 'computer',
    serial_number: '',
    device_id: '',
    mac_address: '',
    ip_address: '',
    hostname: '',
    purchase_date: '',
    deployment_date: '',
    warranty_expiry: '',
    retirement_date: '',
    current_owner: '',
    location: '',
    status: 'active',
    purchase_price: '',
    notes: ''
  });

  const createMutation = useMutation({
    mutationFn: (data) => {
      const lifecycleEntry = {
        timestamp: new Date().toISOString(),
        event: 'created',
        user: user.email,
        details: 'Asset created'
      };
      return base44.entities.Asset.create({
        ...data,
        organization_id: user.organization_id,
        lifecycle_history: [lifecycleEntry],
        linked_incidents: [],
        linked_alerts: [],
        linked_cases: []
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      setIsAddDialogOpen(false);
      resetForm();
      toast.success('Asset added successfully');
    },
    onError: (error) => {
      toast.error('Failed to add asset', { description: error.message });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data, originalAsset }) => {
      const lifecycleEntry = {
        timestamp: new Date().toISOString(),
        event: 'updated',
        user: user.email,
        details: `Status changed from ${originalAsset.status} to ${data.status}`
      };
      const updatedLifecycle = [...(originalAsset.lifecycle_history || []), lifecycleEntry];
      return base44.entities.Asset.update(id, {
        ...data,
        lifecycle_history: updatedLifecycle
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      setEditingAsset(null);
      resetForm();
      toast.success('Asset updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update asset', { description: error.message });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Asset.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast.success('Asset deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete asset', { description: error.message });
    }
  });

  const syncFromDevicesMutation = useMutation({
    mutationFn: async () => {
      const newAssets = [];
      for (const device of devices) {
        const existingAsset = assets.find(a => a.device_id === device.id);
        if (!existingAsset) {
          const lifecycleEntry = {
            timestamp: new Date().toISOString(),
            event: 'auto_discovered',
            user: 'system',
            details: 'Automatically discovered from device enrollment'
          };
          newAssets.push({
            organization_id: user.organization_id,
            asset_name: device.display_name || device.device_id,
            asset_type: 'digital',
            category: device.platform === 'ios' || device.platform === 'android' ? 'mobile' : 'computer',
            device_id: device.id,
            hostname: device.device_info?.hostname,
            status: device.status === 'enrolled' ? 'active' : 'inactive',
            auto_discovered: true,
            last_network_scan: new Date().toISOString(),
            deployment_date: device.enrolled_at,
            device_fingerprint: device.device_info,
            lifecycle_history: [lifecycleEntry],
            linked_incidents: [],
            linked_alerts: [],
            linked_cases: []
          });
        }
      }
      if (newAssets.length > 0) {
        await Promise.all(newAssets.map(asset => base44.entities.Asset.create(asset)));
      }
      return newAssets.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast.success(`Synced ${count} new assets from devices`);
    },
    onError: (error) => {
      toast.error('Failed to sync devices', { description: error.message });
    }
  });

  const resetForm = () => {
    setFormData({
      asset_name: '',
      asset_type: 'physical',
      category: 'computer',
      serial_number: '',
      device_id: '',
      mac_address: '',
      ip_address: '',
      hostname: '',
      purchase_date: '',
      deployment_date: '',
      warranty_expiry: '',
      retirement_date: '',
      current_owner: '',
      location: '',
      status: 'active',
      purchase_price: '',
      notes: ''
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null
    };

    if (editingAsset) {
      updateMutation.mutate({ id: editingAsset.id, data, originalAsset: editingAsset });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (asset) => {
    setEditingAsset(asset);
    setFormData({
      asset_name: asset.asset_name,
      asset_type: asset.asset_type,
      category: asset.category || 'computer',
      serial_number: asset.serial_number || '',
      device_id: asset.device_id || '',
      mac_address: asset.mac_address || '',
      ip_address: asset.ip_address || '',
      hostname: asset.hostname || '',
      purchase_date: asset.purchase_date || '',
      deployment_date: asset.deployment_date || '',
      warranty_expiry: asset.warranty_expiry || '',
      retirement_date: asset.retirement_date || '',
      current_owner: asset.current_owner || '',
      location: asset.location || '',
      status: asset.status || 'active',
      purchase_price: asset.purchase_price?.toString() || '',
      notes: asset.notes || ''
    });
    setIsAddDialogOpen(true);
  };

  const getLinkedDataCounts = (asset) => {
    const linkedAlerts = alerts.filter(a => asset.linked_alerts?.includes(a.id) || a.affected_systems?.includes(asset.asset_name));
    const linkedCases = cases.filter(c => asset.linked_cases?.includes(c.id));
    return { alerts: linkedAlerts.length, cases: linkedCases.length };
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this asset?')) {
      deleteMutation.mutate(id);
    }
  };

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.asset_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         asset.serial_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         asset.current_owner?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || asset.asset_type === filterType;
    const matchesStatus = filterStatus === 'all' || asset.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-green-500/20 text-green-400 border-green-500/30',
      inactive: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      maintenance: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      retired: 'bg-red-500/20 text-red-400 border-red-500/30',
      lost: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    };
    return colors[status] || colors.active;
  };

  const isWarrantyExpiring = (warrantyDate) => {
    if (!warrantyDate) return false;
    const expiry = new Date(warrantyDate);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expiry <= thirtyDaysFromNow && expiry >= new Date();
  };

  return (
    <RouteErrorBoundary routeName="AssetInventory" errorTitle="Asset Inventory Error">
      <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-6 pb-24 md:pb-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Asset Inventory</h1>
            <p className="text-slate-400">Track and manage organizational assets with device discovery</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => syncFromDevicesMutation.mutate()}
              disabled={syncFromDevicesMutation.isPending}
              variant="outline"
              className="border-slate-700"
            >
              {syncFromDevicesMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sync Devices
                </>
              )}
            </Button>
            <Button
              onClick={() => {
                setEditingAsset(null);
                resetForm();
                setIsAddDialogOpen(true);
              }}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Asset
            </Button>
          </div>
        </div>

        {/* Sync Alert */}
        {devices.length > 0 && (
          <Card className="bg-blue-900/20 border-blue-500/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Activity className="w-5 h-5 text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-300 mb-1">Device Discovery Available</p>
                  <p className="text-xs text-blue-200">
                    {devices.length} enrolled devices detected. Click "Sync Devices" to automatically import them as assets.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add/Edit Asset Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-white">
                  {editingAsset ? 'Edit Asset' : 'Add New Asset'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label className="text-slate-300">Asset Name *</Label>
                    <Input
                      value={formData.asset_name}
                      onChange={(e) => setFormData({...formData, asset_name: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Asset Type *</Label>
                    <Select value={formData.asset_type} onValueChange={(v) => setFormData({...formData, asset_type: v})}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="digital">Digital</SelectItem>
                        <SelectItem value="physical">Physical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-300">Category</Label>
                    <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="computer">Computer</SelectItem>
                        <SelectItem value="mobile">Mobile</SelectItem>
                        <SelectItem value="server">Server</SelectItem>
                        <SelectItem value="network">Network</SelectItem>
                        <SelectItem value="storage">Storage</SelectItem>
                        <SelectItem value="software">Software</SelectItem>
                        <SelectItem value="license">License</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-300">Serial Number</Label>
                    <Input
                      value={formData.serial_number}
                      onChange={(e) => setFormData({...formData, serial_number: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Hostname</Label>
                    <Input
                      value={formData.hostname}
                      onChange={(e) => setFormData({...formData, hostname: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">IP Address</Label>
                    <Input
                      value={formData.ip_address}
                      onChange={(e) => setFormData({...formData, ip_address: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">MAC Address</Label>
                    <Input
                      value={formData.mac_address}
                      onChange={(e) => setFormData({...formData, mac_address: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Status</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v})}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="pending_deployment">Pending Deployment</SelectItem>
                        <SelectItem value="retired">Retired</SelectItem>
                        <SelectItem value="decommissioned">Decommissioned</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-300">Purchase Date</Label>
                    <Input
                      type="date"
                      value={formData.purchase_date}
                      onChange={(e) => setFormData({...formData, purchase_date: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Deployment Date</Label>
                    <Input
                      type="date"
                      value={formData.deployment_date}
                      onChange={(e) => setFormData({...formData, deployment_date: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Warranty Expiry</Label>
                    <Input
                      type="date"
                      value={formData.warranty_expiry}
                      onChange={(e) => setFormData({...formData, warranty_expiry: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Retirement Date</Label>
                    <Input
                      type="date"
                      value={formData.retirement_date}
                      onChange={(e) => setFormData({...formData, retirement_date: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Current Owner</Label>
                    <Input
                      value={formData.current_owner}
                      onChange={(e) => setFormData({...formData, current_owner: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Location</Label>
                    <Input
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Purchase Price</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.purchase_price}
                      onChange={(e) => setFormData({...formData, purchase_price: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-slate-300">Notes</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      className="bg-slate-800 border-slate-700 text-white"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsAddDialogOpen(false);
                      setEditingAsset(null);
                      resetForm();
                    }}
                    className="border-slate-700"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="bg-gradient-to-r from-blue-600 to-purple-600"
                  >
                    {(createMutation.isPending || updateMutation.isPending) ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      editingAsset ? 'Update Asset' : 'Add Asset'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Assets</p>
                  <p className="text-2xl font-bold text-white">{assets.length}</p>
                </div>
                <Package className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Active</p>
                  <p className="text-2xl font-bold text-green-400">
                    {assets.filter(a => a.status === 'active').length}
                  </p>
                </div>
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Maintenance</p>
                  <p className="text-2xl font-bold text-yellow-400">
                    {assets.filter(a => a.status === 'maintenance').length}
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Expiring Soon</p>
                  <p className="text-2xl font-bold text-orange-400">
                    {assets.filter(a => isWarrantyExpiring(a.warranty_expiry)).length}
                  </p>
                </div>
                <Calendar className="w-8 h-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Asset Management Panels */}
        <div className="grid md:grid-cols-3 gap-4">
          <AIAssetDiscoveryPanel />
          <AIOrphanedAssetsPanel />
        </div>

        {/* Search and Filters */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search assets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full md:w-40 bg-slate-800 border-slate-700 text-white">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="digital">Digital</SelectItem>
                  <SelectItem value="physical">Physical</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full md:w-40 bg-slate-800 border-slate-700 text-white">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Assets List */}
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-slate-400">Loading assets...</p>
          </div>
        ) : filteredAssets.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-12 text-center">
              <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Assets Found</h3>
              <p className="text-slate-400 mb-4">
                {searchQuery || filterType !== 'all' || filterStatus !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Get started by adding your first asset'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredAssets.map((asset) => (
              <Card key={asset.id} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                       <h3 className="text-lg font-semibold text-white">{asset.asset_name}</h3>
                       <Badge className={getStatusColor(asset.status)}>
                         {asset.status}
                       </Badge>
                       <Badge variant="outline" className="border-slate-600 text-slate-300">
                         {asset.asset_type}
                       </Badge>
                       {asset.category && (
                         <Badge variant="outline" className="border-slate-600 text-slate-300">
                           {asset.category}
                         </Badge>
                       )}
                       {asset.auto_discovered && (
                         <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                           <Activity className="w-3 h-3 mr-1" />
                           Auto-discovered
                         </Badge>
                       )}
                       {asset.device_id && (
                         <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                           <LinkIcon className="w-3 h-3 mr-1" />
                           Linked Device
                         </Badge>
                       )}
                       {isWarrantyExpiring(asset.warranty_expiry) && (
                         <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                           Warranty Expiring
                         </Badge>
                       )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        {asset.serial_number && (
                          <div className="flex items-center gap-2 text-slate-400">
                            <Package className="w-4 h-4" />
                            <span>{asset.serial_number}</span>
                          </div>
                        )}
                        {asset.hostname && (
                          <div className="flex items-center gap-2 text-slate-400">
                            <Activity className="w-4 h-4" />
                            <span>{asset.hostname}</span>
                          </div>
                        )}
                        {asset.ip_address && (
                          <div className="flex items-center gap-2 text-slate-400">
                            <Activity className="w-4 h-4" />
                            <span>{asset.ip_address}</span>
                          </div>
                        )}
                        {asset.current_owner && (
                          <div className="flex items-center gap-2 text-slate-400">
                            <User className="w-4 h-4" />
                            <span>{asset.current_owner}</span>
                          </div>
                        )}
                        {asset.location && (
                          <div className="flex items-center gap-2 text-slate-400">
                            <MapPin className="w-4 h-4" />
                            <span>{asset.location}</span>
                          </div>
                        )}
                        {asset.purchase_price && (
                          <div className="flex items-center gap-2 text-slate-400">
                            <DollarSign className="w-4 h-4" />
                            <span>${asset.purchase_price.toLocaleString()}</span>
                          </div>
                        )}
                        {asset.deployment_date && (
                          <div className="flex items-center gap-2 text-slate-400">
                            <Clock className="w-4 h-4" />
                            <span>Deployed: {format(new Date(asset.deployment_date), 'MMM d, yyyy')}</span>
                          </div>
                        )}
                        {asset.warranty_expiry && (
                          <div className="flex items-center gap-2 text-slate-400">
                            <Calendar className="w-4 h-4" />
                            <span>Warranty: {format(new Date(asset.warranty_expiry), 'MMM d, yyyy')}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Linked Data */}
                      {(() => {
                        const linkedData = getLinkedDataCounts(asset);
                        return (linkedData.alerts > 0 || linkedData.cases > 0) && (
                          <div className="flex gap-3 mt-3 pt-3 border-t border-slate-700">
                            {linkedData.alerts > 0 && (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                                <Shield className="w-3 h-3 mr-1" />
                                {linkedData.alerts} Alert{linkedData.alerts !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            {linkedData.cases > 0 && (
                              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                <FileText className="w-3 h-3 mr-1" />
                                {linkedData.cases} Case{linkedData.cases !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                        );
                      })()}

                      {asset.notes && (
                        <p className="text-sm text-slate-400 mt-2">{asset.notes}</p>
                      )}
                      
                      {/* Lifecycle History */}
                      {asset.lifecycle_history && asset.lifecycle_history.length > 0 && (
                        <details className="mt-3">
                          <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-300 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            View Lifecycle History ({asset.lifecycle_history.length} events)
                          </summary>
                          <div className="mt-2 space-y-2 pl-6">
                            {asset.lifecycle_history.slice(-5).reverse().map((event, idx) => (
                              <div key={idx} className="text-xs text-slate-400 flex items-start gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5" />
                                <div>
                                  <span className="text-slate-300 font-medium">{event.event}</span>
                                  <span className="text-slate-500 ml-2">by {event.user}</span>
                                  <div className="text-slate-500">{format(new Date(event.timestamp), 'MMM d, yyyy HH:mm')}</div>
                                  {event.details && <div className="text-slate-400 mt-0.5">{event.details}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedAsset(asset);
                          setAssetDetailOpen(true);
                        }}
                        className="border-slate-700"
                      >
                        <Shield className="w-4 h-4 mr-1" />
                        Details
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(asset)}
                        className="border-slate-700"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(asset.id)}
                        className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Asset Detail Dialog */}
        <Dialog open={assetDetailOpen} onOpenChange={setAssetDetailOpen}>
          <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white text-2xl">
                {selectedAsset?.asset_name}
              </DialogTitle>
            </DialogHeader>
            {selectedAsset && (
              <div className="space-y-4 mt-4">
                <AILifecyclePredictionPanel asset={selectedAsset} />
                <AssetLifecycleManager
                  asset={selectedAsset}
                  onUpdate={() => queryClient.invalidateQueries({ queryKey: ['assets'] })}
                />
                <AITaggingPanel 
                  asset={selectedAsset} 
                  onUpdate={() => queryClient.invalidateQueries({ queryKey: ['assets'] })}
                />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
    </RouteErrorBoundary>
  );
}