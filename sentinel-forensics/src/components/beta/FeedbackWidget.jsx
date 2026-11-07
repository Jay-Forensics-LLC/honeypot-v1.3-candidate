import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MessageSquare, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    category: 'bug',
    severity: 'medium',
    reproducibility: 'sometimes',
    title: '',
    description: ''
  });

  const submitMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('submitBetaFeedback', {
        ...data,
        screenshot: null // TODO: implement screenshot capture
      });
      return response.data;
    },
    onSuccess: () => {
      setSubmitted(true);
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
        setForm({
          category: 'bug',
          severity: 'medium',
          reproducibility: 'sometimes',
          title: '',
          description: ''
        });
      }, 2000);
      toast.success('Feedback submitted!');
    },
    onError: (error) => {
      toast.error('Failed to submit feedback', { description: error.message });
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title || !form.description) {
      toast.error('Please fill in all required fields');
      return;
    }
    submitMutation.mutate(form);
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-24 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700"
        style={{ zIndex: 40 }}
        size="lg"
      >
        <MessageSquare className="w-5 h-5 mr-2" />
        Feedback
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send Beta Feedback</DialogTitle>
          </DialogHeader>

          {submitted ? (
            <div className="py-12 text-center">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Thank you!</h3>
              <p className="text-slate-400">Your feedback helps us improve.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category *</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      <SelectItem value="bug">🐛 Bug</SelectItem>
                      <SelectItem value="feature_request">💡 Feature Request</SelectItem>
                      <SelectItem value="ux_issue">🎨 UX Issue</SelectItem>
                      <SelectItem value="other">📝 Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Severity</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.category === 'bug' && (
                <div>
                  <Label>How often does this happen?</Label>
                  <Select value={form.reproducibility} onValueChange={(v) => setForm({ ...form, reproducibility: v })}>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      <SelectItem value="always">Always (100%)</SelectItem>
                      <SelectItem value="sometimes">Sometimes</SelectItem>
                      <SelectItem value="once">Only once</SelectItem>
                      <SelectItem value="unknown">Not sure</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Title *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Brief summary of the issue or request"
                  className="bg-slate-800 border-slate-700"
                  required
                />
              </div>

              <div>
                <Label>Description *</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Provide as much detail as possible. For bugs, include steps to reproduce."
                  className="bg-slate-800 border-slate-700 h-32"
                  required
                />
              </div>

              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-sm text-blue-200">
                <strong>Auto-captured:</strong> Page route, browser info, timestamp
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="border-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Submit Feedback
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}