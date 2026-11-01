import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, FileText, Send, Pin, Edit, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '../hooks/useUser';
import ReactMarkdown from 'react-markdown';

export default function CaseCollaboration({ caseId }) {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [chatMessage, setChatMessage] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const chatEndRef = useRef(null);

  // Fetch chat messages
  const { data: messages = [] } = useQuery({
    queryKey: ['case-chat', caseId],
    queryFn: () => base44.entities.CaseChat.filter({ case_id: caseId }),
    refetchInterval: 3000 // Real-time polling
  });

  // Fetch notes
  const { data: notes = [] } = useQuery({
    queryKey: ['case-notes', caseId],
    queryFn: () => base44.entities.CaseNote.filter({ case_id: caseId })
  });

  const sendMessageMutation = useMutation({
    mutationFn: (message) => base44.entities.CaseChat.create({
      case_id: caseId,
      organization_id: user.organization_id,
      message,
      user_email: user.email,
      user_name: user.full_name || user.email,
      timestamp: new Date().toISOString()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['case-chat', caseId]);
      setChatMessage('');
    }
  });

  const createNoteMutation = useMutation({
    mutationFn: (note) => base44.entities.CaseNote.create({
      ...note,
      case_id: caseId,
      organization_id: user.organization_id,
      user_email: user.email,
      user_name: user.full_name || user.email
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['case-notes', caseId]);
      setNoteTitle('');
      setNoteContent('');
      setEditingNote(null);
      toast.success('Note saved');
    }
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CaseNote.update(id, {
      ...data,
      last_edited_by: user.email,
      last_edited_at: new Date().toISOString()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['case-notes', caseId]);
      setEditingNote(null);
      toast.success('Note updated');
    }
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id) => base44.entities.CaseNote.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['case-notes', caseId]);
      toast.success('Note deleted');
    }
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSendMessage() {
    if (!chatMessage.trim()) return;
    sendMessageMutation.mutate(chatMessage);
  }

  function handleSaveNote() {
    if (!noteTitle.trim() || !noteContent.trim()) {
      toast.error('Title and content required');
      return;
    }

    if (editingNote) {
      updateNoteMutation.mutate({
        id: editingNote.id,
        data: { title: noteTitle, content: noteContent }
      });
    } else {
      createNoteMutation.mutate({ title: noteTitle, content: noteContent });
    }
  }

  function handleEditNote(note) {
    setEditingNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content);
  }

  function handleCancelEdit() {
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" />
          Team Collaboration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-slate-800">
            <TabsTrigger value="chat">
              <MessageSquare className="w-4 h-4 mr-2" />
              Chat ({messages.length})
            </TabsTrigger>
            <TabsTrigger value="notes">
              <FileText className="w-4 h-4 mr-2" />
              Notes ({notes.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="space-y-4">
            <div className="h-96 overflow-y-auto bg-slate-800/30 rounded-lg p-4 space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.user_email === user?.email ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] ${msg.user_email === user?.email ? 'bg-blue-600' : 'bg-slate-700'} rounded-lg p-3`}>
                    <p className="text-xs text-slate-300 mb-1">{msg.user_name}</p>
                    <p className="text-sm text-white">{msg.message}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            
            <div className="flex gap-2">
              <Input
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="bg-slate-800 border-slate-700 text-white"
              />
              <Button onClick={handleSendMessage} className="bg-blue-600 hover:bg-blue-700">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="notes" className="space-y-4">
            {/* Note Editor */}
            <div className="bg-slate-800/30 rounded-lg p-4 space-y-3">
              <Input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Note title..."
                className="bg-slate-800 border-slate-700 text-white"
              />
              <Textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Note content (markdown supported)..."
                rows={4}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <div className="flex gap-2">
                <Button onClick={handleSaveNote} className="bg-blue-600 hover:bg-blue-700">
                  {editingNote ? 'Update' : 'Create'} Note
                </Button>
                {editingNote && (
                  <Button onClick={handleCancelEdit} variant="outline" className="border-slate-700">
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            {/* Notes List */}
            <div className="space-y-2">
              {notes.map((note) => (
                <Card key={note.id} className="bg-slate-800/30 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-white">{note.title}</h4>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => handleEditNote(note)}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteNoteMutation.mutate(note.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <ReactMarkdown className="text-sm text-slate-300 prose prose-sm prose-invert max-w-none">
                      {note.content}
                    </ReactMarkdown>
                    <p className="text-xs text-slate-500 mt-2">
                      By {note.user_name} • {new Date(note.created_date).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}