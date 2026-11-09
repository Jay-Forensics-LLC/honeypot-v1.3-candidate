import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen, TrendingUp, Search, Eye, ThumbsUp, CheckCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function KnowledgeHub() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedArticle, setSelectedArticle] = useState(null);

  const queryClient = useQueryClient();

  const { data: articles = [] } = useQuery({
    queryKey: ['knowledge-articles', selectedCategory],
    queryFn: () => base44.entities.KnowledgeArticle.filter(
      selectedCategory !== 'all' ? { category: selectedCategory, is_public: true } : { is_public: true },
      '-upvotes'
    )
  });

  const upvoteMutation = useMutation({
    mutationFn: (articleId) => {
      const article = articles.find(a => a.id === articleId);
      return base44.entities.KnowledgeArticle.update(articleId, {
        upvotes: (article.upvotes || 0) + 1
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-articles'] });
    }
  });

  const viewMutation = useMutation({
    mutationFn: (articleId) => {
      const article = articles.find(a => a.id === articleId);
      return base44.entities.KnowledgeArticle.update(articleId, {
        view_count: (article.view_count || 0) + 1
      });
    }
  });

  const filteredArticles = articles.filter(article => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      article.title?.toLowerCase().includes(search) ||
      article.content?.toLowerCase().includes(search) ||
      article.tags?.some(t => t.toLowerCase().includes(search))
    );
  });

  const handleViewArticle = (article) => {
    setSelectedArticle(article);
    viewMutation.mutate(article.id);
  };

  const categories = [
    { value: 'all', label: 'All Topics' },
    { value: 'forensic_techniques', label: 'Forensic Techniques' },
    { value: 'legal_procedures', label: 'Legal Procedures' },
    { value: 'tool_usage', label: 'Tool Usage' },
    { value: 'compliance', label: 'Compliance' },
    { value: 'incident_response', label: 'Incident Response' }
  ];

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-400" />
            Knowledge Hub
          </CardTitle>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="all" onValueChange={setSelectedCategory}>
            <TabsList className="bg-slate-800 border-slate-700 flex-wrap h-auto">
              {categories.map(cat => (
                <TabsTrigger key={cat.value} value={cat.value}>
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="mt-4 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search knowledge base..."
                  className="pl-10 bg-slate-800 border-slate-700"
                />
              </div>
            </div>

            <ScrollArea className="h-[600px]">
              <div className="space-y-3">
                {filteredArticles.length === 0 ? (
                  <div className="text-center py-12">
                    <BookOpen className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                    <p className="text-slate-400">No articles found</p>
                  </div>
                ) : (
                  filteredArticles.map(article => (
                    <Card key={article.id} className="bg-slate-800/50 border-slate-700">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-white font-semibold">{article.title}</h3>
                              {article.expert_verified && (
                                <Badge className="bg-green-500/20 text-green-400 text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Expert Verified
                                </Badge>
                              )}
                            </div>
                            
                            <div className="flex flex-wrap gap-2 mb-2">
                              <Badge className="bg-purple-500/20 text-purple-300 text-xs">
                                {article.category?.replace('_', ' ')}
                              </Badge>
                              {article.tags?.slice(0, 3).map((tag, idx) => (
                                <Badge key={idx} className="bg-blue-500/20 text-blue-300 text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>

                            <div className="flex items-center gap-4 text-xs text-slate-400">
                              <div className="flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                {article.view_count || 0}
                              </div>
                              <div className="flex items-center gap-1">
                                <ThumbsUp className="w-3 h-3" />
                                {article.upvotes || 0}
                              </div>
                            </div>
                          </div>

                          <Button
                            onClick={() => handleViewArticle(article)}
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            Read
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </Tabs>
        </CardContent>
      </Card>

      {/* Article Viewer Dialog */}
      <Dialog open={!!selectedArticle} onOpenChange={() => setSelectedArticle(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedArticle?.title}
              {selectedArticle?.expert_verified && (
                <Badge className="bg-green-500/20 text-green-400">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Verified
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="prose prose-invert max-w-none">
              <ReactMarkdown>{selectedArticle?.content || ''}</ReactMarkdown>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-700">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">
                  By {selectedArticle?.author_email} • {selectedArticle?.view_count || 0} views
                </p>
                <Button
                  onClick={() => upvoteMutation.mutate(selectedArticle.id)}
                  disabled={upvoteMutation.isPending}
                  size="sm"
                  variant="outline"
                  className="border-slate-700"
                >
                  <ThumbsUp className="w-3 h-3 mr-2" />
                  Upvote ({selectedArticle?.upvotes || 0})
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Consultation Request Dialog */}
      {selectedExpert && (
        <Dialog open={!!selectedExpert} onOpenChange={() => setSelectedExpert(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle>Request Consultation: {selectedExpert.display_name}</DialogTitle>
            </DialogHeader>
            {/* Dialog content handled by parent component */}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}