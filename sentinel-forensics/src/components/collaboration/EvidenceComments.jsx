import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  MessageSquare, 
  Send, 
  Edit, 
  Trash2, 
  Loader2,
  User,
  Hash,
  Save
} from "lucide-react";
import { toast } from "sonner";
import { DateUtils } from "../utils/DateUtils";
import { OfflineQueue } from "../lib/offlineQueue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DRAFT_KEY_PREFIX = 'sf:comment:draft:';

/**
 * Get initials from name
 */
const getInitials = (name) => {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

/**
 * Parse @mentions and #tags from text
 */
const parseContent = (text) => {
  const mentions = [];
  const tags = [];
  
  // Match @username
  const mentionRegex = /@(\w+)/g;
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  
  // Match #tag
  const tagRegex = /#(\w+)/g;
  while ((match = tagRegex.exec(text)) !== null) {
    tags.push(match[1]);
  }
  
  return { mentions: [...new Set(mentions)], tags: [...new Set(tags)] };
};

/**
 * Highlight @mentions and #tags in text
 */
const HighlightedContent = ({ content }) => {
  const parts = content.split(/(@\w+|#\w+)/g);
  
  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, idx) => {
        if (part.startsWith('@')) {
          return (
            <span key={idx} className="text-blue-400 font-semibold">
              {part}
            </span>
          );
        } else if (part.startsWith('#')) {
          return (
            <span key={idx} className="text-purple-400 font-semibold">
              {part}
            </span>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </div>
  );
};

export default function EvidenceComments({ evidenceId, caseId, canComment = true }) {
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionType, setSuggestionType] = useState(null); // 'mention' | 'tag'
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const textareaRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  // Load draft from localStorage
  useEffect(() => {
    const draftKey = `${DRAFT_KEY_PREFIX}${evidenceId}`;
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      setContent(savedDraft);
    }
  }, [evidenceId]);

  // Autosave draft
  useEffect(() => {
    const draftKey = `${DRAFT_KEY_PREFIX}${evidenceId}`;
    const timer = setTimeout(() => {
      if (content) {
        localStorage.setItem(draftKey, content);
        window.sfTrack?.('comment_draft_saved', {
          evidence_id: evidenceId,
          length: content.length
        });
      } else {
        localStorage.removeItem(draftKey);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [content, evidenceId]);

  // Fetch comments
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['evidence-comments', evidenceId],
    queryFn: async () => {
      const allComments = await base44.entities.EvidenceComment.list('-timestamp');
      return allComments.filter(c => c.evidence_id === evidenceId);
    },
    enabled: !!evidenceId,
    initialData: []
  });

  // Fetch users for @mention suggestions
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const allUsers = await base44.entities.User.list();
      return allUsers.map(u => ({
        email: u.email,
        name: u.full_name || u.email,
        role: u.role
      }));
    },
    staleTime: 60000
  });

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async (commentData) => {
      if (!navigator.onLine) {
        OfflineQueue.enqueue({
          type: 'create',
          entity: 'EvidenceComment',
          data: commentData
        });
        throw new Error('Offline - queued for later');
      }
      return await base44.entities.EvidenceComment.create(commentData);
    },
    onMutate: async (newComment) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['evidence-comments', evidenceId] });
      const previous = queryClient.getQueryData(['evidence-comments', evidenceId]);
      
      const optimisticComment = {
        id: `temp-${Date.now()}`,
        ...newComment,
        timestamp: new Date().toISOString(),
        _optimistic: true
      };
      
      queryClient.setQueryData(['evidence-comments', evidenceId], (old = []) => 
        [optimisticComment, ...old]
      );
      
      return { previous };
    },
    onError: (error, newComment, context) => {
      // Rollback
      queryClient.setQueryData(['evidence-comments', evidenceId], context.previous);
      
      if (error.message.includes('Offline')) {
        toast.info('Comment queued - will sync when online');
      } else {
        toast.error('Failed to post comment');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-comments', evidenceId] });
      window.sfTrack?.('evidence_comment_created', {
        evidence_id: evidenceId,
        case_id: caseId
      });
    }
  });

  // Update comment mutation
  const updateCommentMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      if (!navigator.onLine) {
        OfflineQueue.enqueue({
          type: 'update',
          entity: 'EvidenceComment',
          id,
          data
        });
        throw new Error('Offline - queued for later');
      }
      return await base44.entities.EvidenceComment.update(id, data);
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['evidence-comments', evidenceId] });
      const previous = queryClient.getQueryData(['evidence-comments', evidenceId]);
      
      queryClient.setQueryData(['evidence-comments', evidenceId], (old = []) =>
        old.map(comment => comment.id === id ? { ...comment, ...data, edited: true } : comment)
      );
      
      return { previous };
    },
    onError: (error, variables, context) => {
      queryClient.setQueryData(['evidence-comments', evidenceId], context.previous);
      
      if (error.message.includes('Offline')) {
        toast.info('Update queued - will sync when online');
      } else {
        toast.error('Failed to update comment');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-comments', evidenceId] });
      setEditingId(null);
      setEditContent('');
      window.sfTrack?.('evidence_comment_updated', {
        evidence_id: evidenceId
      });
    }
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId) => {
      if (!navigator.onLine) {
        OfflineQueue.enqueue({
          type: 'delete',
          entity: 'EvidenceComment',
          id: commentId
        });
        throw new Error('Offline - queued for later');
      }
      return await base44.entities.EvidenceComment.delete(commentId);
    },
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({ queryKey: ['evidence-comments', evidenceId] });
      const previous = queryClient.getQueryData(['evidence-comments', evidenceId]);
      
      queryClient.setQueryData(['evidence-comments', evidenceId], (old = []) =>
        old.filter(comment => comment.id !== commentId)
      );
      
      return { previous };
    },
    onError: (error, variables, context) => {
      queryClient.setQueryData(['evidence-comments', evidenceId], context.previous);
      
      if (error.message.includes('Offline')) {
        toast.info('Delete queued - will sync when online');
      } else {
        toast.error('Failed to delete comment');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-comments', evidenceId] });
      setDeleteConfirm(null);
      window.sfTrack?.('evidence_comment_deleted', {
        evidence_id: evidenceId
      });
    }
  });

  // Handle posting comment
  const handlePost = async () => {
    if (!content.trim() || !canComment) return;

    const { mentions, tags } = parseContent(content);
    
    const commentData = {
      evidence_id: evidenceId,
      case_id: caseId,
      user_email: user?.email || 'unknown@example.com',
      user_name: user?.full_name || 'Unknown User',
      content: content.trim(),
      comment_type: 'note',
      timestamp: new Date().toISOString(),
      mentions,
      edited: false
    };

    try {
      await createCommentMutation.mutateAsync(commentData);
      setContent('');
      localStorage.removeItem(`${DRAFT_KEY_PREFIX}${evidenceId}`);
      toast.success('Comment posted!');
    } catch (error) {
      // Error handled in mutation
    }
  };

  // Handle edit
  const handleEdit = (comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;

    const { mentions, tags } = parseContent(editContent);
    
    try {
      await updateCommentMutation.mutateAsync({
        id: editingId,
        data: {
          content: editContent.trim(),
          mentions,
          edited: true
        }
      });
      toast.success('Comment updated!');
    } catch (error) {
      // Error handled in mutation
    }
  };

  // Handle delete
  const handleDelete = async (commentId) => {
    try {
      await deleteCommentMutation.mutateAsync(commentId);
      toast.success('Comment deleted');
    } catch (error) {
      // Error handled in mutation
    }
  };

  // Keyboard shortcuts
  const handleKeyDown = (e) => {
    // Ctrl/Cmd + Enter to post
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handlePost();
    }
  };

  const handleEditKeyDown = (e) => {
    // Ctrl/Cmd + Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    }
    // Escape to cancel
    if (e.key === 'Escape') {
      setEditingId(null);
      setEditContent('');
    }
  };

  // Check if user can edit/delete comment
  const canModifyComment = (comment) => {
    if (!user) return false;
    return user.email === comment.user_email || user.role === 'admin';
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-400" />
          Comments ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comment Composer */}
        {canComment && (
          <div className="space-y-2">
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a comment... (Use @ for mentions, # for tags, Ctrl+Enter to post)"
                className="bg-slate-800 border-slate-700 text-white min-h-[100px] placeholder:text-slate-500"
                aria-label="Write a comment"
              />
              {content && (
                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                  <Save className="w-3 h-3 text-slate-500" />
                  <span className="text-xs text-slate-500">Draft autosaved</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500 space-x-2">
                <span>• Use <User className="w-3 h-3 inline" /> @mention for users</span>
                <span>• Use <Hash className="w-3 h-3 inline" /> #tag for topics</span>
                <span>• <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px]">Ctrl+Enter</kbd> to post</span>
              </div>
              
              <Button
                onClick={handlePost}
                disabled={!content.trim() || createCommentMutation.isPending}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                aria-label="Post comment"
              >
                {createCommentMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Post Comment
              </Button>
            </div>
          </div>
        )}

        {/* Comments List */}
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {comments.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-sm">No comments yet. Be the first to comment!</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div 
                key={comment.id}
                className={`p-4 rounded-lg border transition-all ${
                  comment._optimistic 
                    ? 'border-blue-500/30 bg-blue-500/5' 
                    : 'border-slate-800 bg-slate-800/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600">
                    <AvatarFallback className="text-white text-xs">
                      {getInitials(comment.user_name)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white text-sm">
                        {comment.user_name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {DateUtils.safeRelativeTime(comment.timestamp)}
                      </span>
                      {comment.edited && (
                        <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">
                          edited
                        </Badge>
                      )}
                      {comment._optimistic && (
                        <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                      )}
                    </div>
                    
                    {editingId === comment.id ? (
                      <div className="space-y-2 mt-2">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          className="bg-slate-900 border-slate-700 text-white min-h-[80px]"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleSaveEdit}
                            disabled={!editContent.trim() || updateCommentMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Save className="w-3 h-3 mr-1" />
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingId(null);
                              setEditContent('');
                            }}
                            className="border-slate-700"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-300">
                        <HighlightedContent content={comment.content} />
                      </div>
                    )}
                    
                    {/* Mentions and Tags */}
                    {comment.mentions && comment.mentions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {comment.mentions.map((mention, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs border-blue-500/50 text-blue-400">
                            @{mention}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  {canModifyComment(comment) && !editingId && (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(comment)}
                        className="h-7 w-7 hover:bg-slate-700"
                        aria-label="Edit comment"
                      >
                        <Edit className="w-3 h-3 text-slate-400" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteConfirm(comment)}
                        className="h-7 w-7 hover:bg-red-500/20"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Comment?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This action cannot be undone. The comment will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(deleteConfirm.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}