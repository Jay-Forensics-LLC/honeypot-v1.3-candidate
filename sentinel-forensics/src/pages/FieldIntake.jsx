import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Camera, MapPin, Upload, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { CryptoUtils } from '../components/utils/CryptoUtils';

export default function FieldIntake() {
  const [photos, setPhotos] = useState([]);
  const [location, setLocation] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const queryClient = useQueryClient();

  const [intake, setIntake] = useState({
    case_number: '',
    officer_name: '',
    officer_badge: '',
    incident_description: '',
    evidence_description: ''
  });

  const getLocation = () => {
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setGettingLocation(false);
        toast.success('Location captured');
      },
      (error) => {
        setGettingLocation(false);
        toast.error('Location unavailable: ' + error.message);
      }
    );
  };

  const submitIntakeMutation = useMutation({
    mutationFn: async () => {
      if (!intake.case_number || !intake.officer_name) {
        throw new Error('Case number and officer name required');
      }

      const uploadedPhotos = [];
      for (const photo of photos) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: photo });
        const hash = await CryptoUtils.hashFile(photo);
        uploadedPhotos.push({ file_url, hash, filename: photo.name });
      }

      const evidenceData = {
        evidence_id: `EV-FIELD-${Date.now()}`,
        case_id: intake.case_number,
        evidence_number: `FIELD-${Date.now().toString().slice(-8)}`,
        title: `Field Evidence: ${intake.evidence_description || 'Untitled'}`,
        description: intake.incident_description,
        evidence_type: 'screenshot',
        collection_method: 'manual_upload',
        collection_timestamp: new Date().toISOString(),
        metadata: {
          officer: intake.officer_name,
          badge: intake.officer_badge,
          gps_coordinates: location,
          photos: uploadedPhotos
        },
        chain_of_custody: [{
          timestamp: new Date().toISOString(),
          action: 'Field evidence collected',
          performed_by: intake.officer_name,
          integrity_hash: uploadedPhotos[0]?.hash || 'N/A'
        }],
        is_verified: false
      };

      if (uploadedPhotos.length > 0) {
        evidenceData.file_url = uploadedPhotos[0].file_url;
        evidenceData.file_hash_sha256 = uploadedPhotos[0].hash;
      }

      return base44.entities.EvidenceV2.create(evidenceData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-v2'] });
      setPhotos([]);
      setLocation(null);
      setIntake({
        case_number: '',
        officer_name: '',
        officer_badge: '',
        incident_description: '',
        evidence_description: ''
      });
      toast.success('Field evidence submitted!');
    },
    onError: (error) => {
      toast.error('Submission failed: ' + error.message);
    }
  });

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Field Evidence Intake</h1>
        <p className="text-sm text-slate-400">Rapid evidence collection for officers on mobile</p>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-white text-sm">Case Number</Label>
              <Input
                value={intake.case_number}
                onChange={(e) => setIntake({...intake, case_number: e.target.value})}
                placeholder="CASE-2025-001"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div>
              <Label className="text-white text-sm">Officer Name</Label>
              <Input
                value={intake.officer_name}
                onChange={(e) => setIntake({...intake, officer_name: e.target.value})}
                placeholder="Officer Name"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>

          <div>
            <Label className="text-white text-sm">Badge Number</Label>
            <Input
              value={intake.officer_badge}
              onChange={(e) => setIntake({...intake, officer_badge: e.target.value})}
              placeholder="Badge #"
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div>
            <Label className="text-white text-sm">Incident Description</Label>
            <Textarea
              value={intake.incident_description}
              onChange={(e) => setIntake({...intake, incident_description: e.target.value})}
              placeholder="Brief incident description..."
              className="bg-slate-800 border-slate-700 text-white h-20"
            />
          </div>

          <div>
            <Label className="text-white text-sm">Evidence Description</Label>
            <Input
              value={intake.evidence_description}
              onChange={(e) => setIntake({...intake, evidence_description: e.target.value})}
              placeholder="What this evidence shows"
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={getLocation}
              disabled={gettingLocation || !!location}
              className="border-slate-700 text-white"
            >
              {gettingLocation ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Getting GPS...</>
              ) : location ? (
                <><CheckCircle className="w-4 h-4 mr-2 text-green-400" /> GPS Locked</>
              ) : (
                <><MapPin className="w-4 h-4 mr-2" /> Get Location</>
              )}
            </Button>

            <Button variant="outline" className="border-slate-700 text-white" asChild>
              <label>
                <Camera className="w-4 h-4 mr-2" />
                Add Photos ({photos.length})
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setPhotos([...photos, ...Array.from(e.target.files || [])])}
                />
              </label>
            </Button>
          </div>

          {location && (
            <div className="bg-green-500/10 border border-green-500/30 rounded p-2 text-xs text-green-300">
              GPS: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)} (±{Math.round(location.accuracy)}m)
            </div>
          )}

          <Button
            onClick={() => submitIntakeMutation.mutate()}
            disabled={!intake.case_number || !intake.officer_name || submitIntakeMutation.isPending}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 min-h-[48px]"
          >
            {submitIntakeMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" /> Submit Field Evidence</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}