import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function SessionCreationDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [sessionName, setSessionName] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [location, setLocation] = useState('');
  const [narrative, setNarrative] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      // Capture basic device posture (non-invasive)
      const posture = {
        device_model: navigator.userAgent || 'Unknown',
        snapshot_timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language
      };

      const response = await base44.functions.invoke('controlPlaneSession', {
        operation: 'createSession',
        session_name: sessionName,
        device_label: deviceLabel,
        location,
        initial_narrative: narrative,
        posture_snapshot: posture
      });

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['control-plane-sessions'] });
      toast.success('Incident session created');
      onOpenChange(false);
      navigate(`/ControlPlaneSession/${data.session.id}`);
    },
    onError: (error) => {
      toast.error('Failed to create session', { description: error.message });
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!sessionName || !deviceLabel) {
      toast.error('Session name and device label are required');
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-white">Start Incident Session</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div>
            <Label className="text-slate-400">Session Name *</Label>
            <Input
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g., Suspected Account Takeover"
              className="bg-slate-800 border-slate-700 text-white mt-1"
              required
            />
          </div>

          <div>
            <Label className="text-slate-400">Device Label *</Label>
            <Input
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              placeholder="e.g., Personal Pixel 8, Work iPhone"
              className="bg-slate-800 border-slate-700 text-white mt-1"
              required
            />
          </div>

          <div>
            <Label className="text-slate-400">Location (Optional)</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Home office, Coffee shop"
              className="bg-slate-800 border-slate-700 text-white mt-1"
            />
          </div>

          <div>
            <Label className="text-slate-400">Initial Narrative</Label>
            <Textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Describe what you observed that led to starting this session..."
              className="bg-slate-800 border-slate-700 text-white mt-1"
              rows={4}
            />
            <p className="text-xs text-slate-500 mt-1">
              What made you suspect compromise? Timeline of events, unusual behavior observed, etc.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Start Session
            </Button>
          </div>
        </form>

        <div className="border-t border-slate-800 pt-4">
          <p className="text-xs text-slate-500">
            <strong>Privacy Notice:</strong> This app captures non-invasive device metadata
            (user agent, language, platform) to document incident context. No sensitive data
            or credentials are collected without explicit user action.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}