import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Star, MessageSquare, CheckCircle, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function ExpertDirectory({ caseId }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExpert, setSelectedExpert] = useState(null);
  const [consultationRequest, setConsultationRequest] = useState({
    topic: '',
    question: ''
  });

  const queryClient = useQueryClient();

  const { data: experts = [], isLoading } = useQuery({
    queryKey: ['expert-profiles'],
    queryFn: () => base44.entities.ExpertProfile.filter({ is_verified: true }, '-rating')
  });

  const requestMutation = useMutation({
    mutationFn: () => base44.functions.invoke('manageConsultation', {
      action: 'request',
      session_data: {
        case_id: caseId,
        expert_email: selectedExpert.user_email,
        session_type: 'chat',
        ...consultationRequest
      }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultations'] });
      toast.success('Consultation requested');
      setSelectedExpert(null);
      setConsultationRequest({ topic: '', question: '' });
    },
    onError: () => {
      toast.error('Request failed');
    }
  });

  const filteredExperts = experts.filter(expert => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      expert.display_name?.toLowerCase().includes(search) ||
      expert.specializations?.some(s => s.toLowerCase().includes(search)) ||
      expert.bio?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-400" />
            Expert Directory
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search experts by name, specialization..."
              className="pl-10 bg-slate-800 border-slate-700"
            />
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-400" />
              <p className="text-slate-400">Loading experts...</p>
            </div>
          ) : filteredExperts.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">No experts found</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {filteredExperts.map(expert => (
                <Card key={expert.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-white font-semibold mb-1">{expert.display_name}</h3>
                        {expert.is_verified && (
                          <Badge className="bg-green-500/20 text-green-400 text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                      </div>
                      {expert.rating > 0 && (
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                          <span className="text-white font-medium">{expert.rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-slate-400 mb-3 line-clamp-2">{expert.bio}</p>

                    <div className="flex flex-wrap gap-2 mb-3">
                      {expert.specializations?.slice(0, 3).map((spec, idx) => (
                        <Badge key={idx} className="bg-blue-500/20 text-blue-300 text-xs">
                          {spec}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-500">
                        {expert.years_experience} years • {expert.total_consultations || 0} sessions
                      </div>
                      <Button
                        onClick={() => setSelectedExpert(expert)}
                        size="sm"
                        disabled={expert.availability_status !== 'available'}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <MessageSquare className="w-3 h-3 mr-1" />
                        Consult
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Dialog */}
      <Dialog open={!!selectedExpert} onOpenChange={() => setSelectedExpert(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Request Consultation: {selectedExpert?.display_name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Topic</label>
              <Input
                value={consultationRequest.topic}
                onChange={(e) => setConsultationRequest({ ...consultationRequest, topic: e.target.value })}
                placeholder="e.g., Mobile malware analysis"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-2 block">Question / Request</label>
              <Textarea
                value={consultationRequest.question}
                onChange={(e) => setConsultationRequest({ ...consultationRequest, question: e.target.value })}
                placeholder="Describe what you need help with..."
                className="bg-slate-800 border-slate-700 h-32"
              />
            </div>

            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
              <p className="text-sm text-blue-200">
                {selectedExpert?.hourly_rate ? (
                  <>Rate: ${selectedExpert.hourly_rate}/hour</>
                ) : (
                  'Expert will review and respond within 24 hours'
                )}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setSelectedExpert(null)}
                variant="outline"
                className="border-slate-700"
              >
                Cancel
              </Button>
              <Button
                onClick={() => requestMutation.mutate()}
                disabled={requestMutation.isPending || !consultationRequest.topic || !consultationRequest.question}
                className="bg-green-600 hover:bg-green-700"
              >
                {requestMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Send Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}