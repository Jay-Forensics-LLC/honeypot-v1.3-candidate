import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import SavedReportManager from './SavedReportManager';
import ReportScheduler from './ReportScheduler';
import ReportRunsHistory from './ReportRunsHistory';
import ReportHistory from './ReportHistory';
import AuditLogExporter from './AuditLogExporter';
import CourtProfileManager from './CourtProfileManager';
import ReportGenerator from './ReportGenerator';

export default function ReportTabs({ caseId, caseData }) {
  const [selectedDefinition, setSelectedDefinition] = useState(null);
  const [showScheduler, setShowScheduler] = useState(false);

  return (
    <Tabs defaultValue="ai" className="w-full">
      <TabsList className="bg-slate-800 border-slate-700">
        <TabsTrigger value="ai">AI Narrative</TabsTrigger>
        <TabsTrigger value="builder">Builder</TabsTrigger>
        <TabsTrigger value="saved">Saved Definitions</TabsTrigger>
        <TabsTrigger value="runs">Report Runs</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="profiles">Court Profiles</TabsTrigger>
        <TabsTrigger value="audit">Audit Export</TabsTrigger>
      </TabsList>

      <TabsContent value="ai" className="space-y-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-12 text-center">
            <p className="text-slate-400">AI narrative generation coming soon</p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="builder" className="space-y-6">
        <ReportGenerator caseId={caseId} caseData={caseData} />
      </TabsContent>

      <TabsContent value="saved" className="space-y-6">
        <SavedReportManager
          caseId={caseId}
          onSelectForSchedule={(def) => {
            setSelectedDefinition(def);
            setShowScheduler(true);
          }}
          onEdit={(def) => {
            // TODO: Open builder in edit mode
          }}
        />
      </TabsContent>

      <TabsContent value="runs" className="space-y-6">
        <ReportRunsHistory caseId={caseId} />
      </TabsContent>

      <TabsContent value="history" className="space-y-6">
        <ReportHistory caseId={caseId} />
      </TabsContent>

      <TabsContent value="profiles" className="space-y-6">
        <CourtProfileManager />
      </TabsContent>

      <TabsContent value="audit" className="space-y-6">
        <AuditLogExporter caseId={caseId} caseData={caseData} />
      </TabsContent>

      {showScheduler && selectedDefinition && (
        <ReportScheduler
          definition={selectedDefinition}
          versionId={selectedDefinition.current_version_id}
          open={showScheduler}
          onClose={() => {
            setShowScheduler(false);
            setSelectedDefinition(null);
          }}
        />
      )}
    </Tabs>
  );
}