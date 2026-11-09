import React from 'react';
import ExpertDirectory from '../components/experts/ExpertDirectory';
import KnowledgeHub from '../components/experts/KnowledgeHub';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, BookOpen } from 'lucide-react';

export default function ExpertNetworkPage() {
  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Expert Network</h1>
          <p className="text-slate-400">Connect with verified forensic experts and access the knowledge base</p>
        </div>

        <Tabs defaultValue="directory" className="w-full">
          <TabsList className="bg-slate-900 border-slate-800">
            <TabsTrigger value="directory" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Expert Directory
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Knowledge Hub
            </TabsTrigger>
          </TabsList>

          <TabsContent value="directory">
            <ExpertDirectory />
          </TabsContent>

          <TabsContent value="knowledge">
            <KnowledgeHub />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}