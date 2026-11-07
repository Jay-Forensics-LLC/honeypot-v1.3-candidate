import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MessageCircle, Send, Mail, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useUser } from '../hooks/useUser';

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { data: user } = useUser();

  const handleSend = async () => {
    if (!message.trim() || !subject.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setSending(true);
    try {
      await base44.integrations.Core.SendEmail({
        to: 'support@sentinel-forensics.app',
        subject: `[Support Request] ${subject}`,
        body: `
From: ${user?.email || 'Unknown'}
Organization: ${user?.organization_id || 'Unknown'}

Message:
${message}

---
Sent via in-app support chat
        `.trim()
      });

      setSent(true);
      toast.success('Support request sent!');
      setTimeout(() => {
        setOpen(false);
        setSent(false);
        setMessage('');
        setSubject('');
      }, 2000);
    } catch (error) {
      toast.error('Failed to send message');
      console.error(error);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-6 w-14 h-14 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 z-50"
        size="icon"
      >
        <MessageCircle className="w-6 h-6" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-400" />
              Contact Support
            </DialogTitle>
          </DialogHeader>

          {!sent ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm text-slate-300">Subject</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-slate-300">Message</label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue in detail..."
                  className="bg-slate-800 border-slate-700 min-h-[120px]"
                  rows={5}
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Mail className="w-4 h-4" />
                <span>We'll respond to {user?.email || 'your email'} within 24 hours</span>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="border-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={sending || !message.trim() || !subject.trim()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {sending ? (
                    <>
                      <Send className="w-4 h-4 mr-2 animate-pulse" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Message
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center space-y-4">
              <CheckCircle className="w-16 h-16 mx-auto text-green-400" />
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Message Sent!</h3>
                <p className="text-sm text-slate-400">
                  Our support team will get back to you shortly.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}