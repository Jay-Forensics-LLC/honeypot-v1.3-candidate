import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Smartphone,
  MessageSquare,
  Phone,
  MapPin,
  Image as ImageIcon,
  Calendar,
  Users,
  ExternalLink
} from 'lucide-react';
import { DateUtils } from '../utils/DateUtils';

export default function MobileDataViewer({ caseId }) {
  const [selectedDevice, setSelectedDevice] = useState(null);

  const { data: devices = [] } = useQuery({
    queryKey: ['mobile-devices', caseId],
    queryFn: () => base44.entities.MobileDevice.filter({ case_id: caseId })
  });

  const { data: artifacts = [] } = useQuery({
    queryKey: ['mobile-artifacts', caseId, selectedDevice],
    queryFn: () => base44.entities.MobileArtifact.filter(
      selectedDevice ? { case_id: caseId, device_id: selectedDevice } : { case_id: caseId }
    ),
    enabled: !!caseId
  });

  const getArtifactIcon = (type) => {
    const icons = {
      sms: MessageSquare,
      mms: MessageSquare,
      call_log: Phone,
      contact: Users,
      photo: ImageIcon,
      location: MapPin,
      app_message: MessageSquare,
      calendar_event: Calendar
    };
    return icons[type] || MessageSquare;
  };

  const groupedArtifacts = artifacts.reduce((acc, artifact) => {
    if (!acc[artifact.artifact_type]) {
      acc[artifact.artifact_type] = [];
    }
    acc[artifact.artifact_type].push(artifact);
    return acc;
  }, {});

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-green-400" />
          Mobile Forensics
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Device Selector */}
        <div>
          <label className="text-sm text-slate-400 mb-2 block">Select Device</label>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => setSelectedDevice(null)}
              variant={selectedDevice === null ? 'default' : 'outline'}
              size="sm"
              className={selectedDevice === null ? 'bg-green-600' : 'border-slate-700'}
            >
              All Devices ({devices.length})
            </Button>
            {devices.map(device => (
              <Button
                key={device.id}
                onClick={() => setSelectedDevice(device.id)}
                variant={selectedDevice === device.id ? 'default' : 'outline'}
                size="sm"
                className={selectedDevice === device.id ? 'bg-green-600' : 'border-slate-700'}
              >
                {device.manufacturer} {device.model}
              </Button>
            ))}
          </div>
        </div>

        {artifacts.length === 0 ? (
          <div className="text-center py-12">
            <Smartphone className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">No mobile data available</p>
          </div>
        ) : (
          <Tabs defaultValue={Object.keys(groupedArtifacts)[0]} className="w-full">
            <TabsList className="bg-slate-800 border-slate-700 flex-wrap h-auto">
              {Object.entries(groupedArtifacts).map(([type, items]) => {
                const Icon = getArtifactIcon(type);
                return (
                  <TabsTrigger key={type} value={type} className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {type.replace('_', ' ')} ({items.length})
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {Object.entries(groupedArtifacts).map(([type, items]) => (
              <TabsContent key={type} value={type}>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {items.map(artifact => (
                      <Card key={artifact.id} className="bg-slate-800/50 border-slate-700">
                        <CardContent className="p-4">
                          {/* SMS/Messages */}
                          {['sms', 'mms', 'app_message'].includes(artifact.artifact_type) && (
                            <div>
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <Badge className={
                                    artifact.direction === 'incoming'
                                      ? 'bg-blue-500/20 text-blue-300'
                                      : 'bg-green-500/20 text-green-300'
                                  }>
                                    {artifact.direction}
                                  </Badge>
                                  {artifact.app_source && (
                                    <Badge className="ml-2 bg-purple-500/20 text-purple-300">
                                      {artifact.app_source}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400">
                                  {DateUtils.safeFormatDateTime(artifact.timestamp)}
                                </p>
                              </div>
                              <p className="text-white mb-2">{artifact.content?.message || artifact.content?.text}</p>
                              {artifact.participants?.length > 0 && (
                                <p className="text-xs text-slate-400">
                                  Participants: {artifact.participants.join(', ')}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Call Logs */}
                          {artifact.artifact_type === 'call_log' && (
                            <div>
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-white font-medium">
                                    {artifact.content?.contact_name || artifact.participants?.[0] || 'Unknown'}
                                  </p>
                                  <p className="text-sm text-slate-400">
                                    Duration: {artifact.content?.duration_seconds}s • {artifact.direction}
                                  </p>
                                </div>
                                <p className="text-xs text-slate-400">
                                  {DateUtils.safeFormatDateTime(artifact.timestamp)}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Contacts */}
                          {artifact.artifact_type === 'contact' && (
                            <div>
                              <p className="text-white font-medium">{artifact.content?.name}</p>
                              {artifact.content?.phone_numbers?.map((phone, idx) => (
                                <p key={idx} className="text-sm text-slate-400">{phone}</p>
                              ))}
                              {artifact.content?.email && (
                                <p className="text-sm text-slate-400">{artifact.content.email}</p>
                              )}
                            </div>
                          )}

                          {/* Location */}
                          {artifact.artifact_type === 'location' && artifact.location && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="w-4 h-4 text-red-400" />
                                <p className="text-white">
                                  {artifact.location.latitude.toFixed(6)}, {artifact.location.longitude.toFixed(6)}
                                </p>
                              </div>
                              {artifact.location.address && (
                                <p className="text-sm text-slate-400">{artifact.location.address}</p>
                              )}
                              <p className="text-xs text-slate-500 mt-1">
                                Accuracy: {artifact.location.accuracy}m • {DateUtils.safeFormatDateTime(artifact.timestamp)}
                              </p>
                            </div>
                          )}

                          {/* Photos/Media */}
                          {['photo', 'video'].includes(artifact.artifact_type) && (
                            <div>
                              <p className="text-white mb-2">{artifact.file_path}</p>
                              {artifact.file_url && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(artifact.file_url, '_blank')}
                                  className="border-slate-600"
                                >
                                  <ExternalLink className="w-3 h-3 mr-2" />
                                  View File
                                </Button>
                              )}
                              <p className="text-xs text-slate-400 mt-2">
                                {DateUtils.safeFormatDateTime(artifact.timestamp)}
                              </p>
                            </div>
                          )}

                          {artifact.is_deleted && (
                            <Badge className="mt-2 bg-red-500/20 text-red-300">
                              Recovered from deleted data
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}