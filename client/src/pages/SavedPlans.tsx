import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Star, 
  Search, 
  Trash2, 
  Calendar, 
  MessageSquare,
  Filter,
  SortAsc,
  SortDesc
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import ReactMarkdown from "react-markdown";

interface SavedPlan {
  id: number;
  title: string;
  tags: string[];
  savedAt: string;
  message: {
    id: number;
    content: string;
    conversation: {
      id: number;
      title: string;
    };
  };
}

export default function SavedPlans() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const queryClient = useQueryClient();

  const { data: savedPlans = [], isLoading } = useQuery<SavedPlan[]>({
    queryKey: ["/api/saved-plans"],
    staleTime: 30000,
  });

  const deletePlanMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/saved-plans/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-plans"] });
    },
  });

  // Extract all unique tags
  const allTags = Array.from(new Set(savedPlans.flatMap(plan => plan.tags))).sort();

  // Filter and sort plans
  const filteredPlans = savedPlans
    .filter(plan => {
      const matchesSearch = plan.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           plan.message.content.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTag = !selectedTag || plan.tags.includes(selectedTag);
      return matchesSearch && matchesTag;
    })
    .sort((a, b) => {
      const dateA = new Date(a.savedAt).getTime();
      const dateB = new Date(b.savedAt).getTime();
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });

  const handleDeletePlan = (id: number) => {
    if (confirm("Are you sure you want to remove this saved plan?")) {
      deletePlanMutation.mutate(id);
    }
  };

  const truncateContent = (content: string, maxLength: number = 200): string => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + "...";
  };

  return (
    <div className="container mx-auto p-6">
      <Seo title="Saved Plans | AITaxMD" noindex />
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Saved Tax Plans</h1>
        <p className="text-gray-600">Your collection of saved tax planning strategies</p>
      </div>

      {/* Filters and Search */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search saved plans..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="search-plans"
            />
          </div>
          
          <Button
            variant="outline"
            onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
            data-testid="sort-plans"
          >
            {sortOrder === "desc" ? (
              <>
                <SortDesc className="w-4 h-4 mr-2" />
                Newest First
              </>
            ) : (
              <>
                <SortAsc className="w-4 h-4 mr-2" />
                Oldest First
              </>
            )}
          </Button>
        </div>

        {/* Tag Filter */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedTag === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTag(null)}
              data-testid="filter-all"
            >
              All Plans ({savedPlans.length})
            </Button>
            {allTags.map(tag => (
              <Button
                key={tag}
                variant={selectedTag === tag ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                data-testid={`filter-${tag.toLowerCase()}`}
              >
                {tag} ({savedPlans.filter(p => p.tags.includes(tag)).length})
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="h-64">
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded animate-pulse mb-2" />
                <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="text-center py-16">
          <Star className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {searchTerm || selectedTag ? "No matching plans found" : "No saved plans yet"}
          </h3>
          <p className="text-gray-600 mb-6">
            {searchTerm || selectedTag 
              ? "Try adjusting your search or filter criteria"
              : "Start saving tax planning strategies to build your collection"
            }
          </p>
          {(searchTerm || selectedTag) && (
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setSelectedTag(null);
              }}
              data-testid="clear-filters"
            >
              Clear Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredPlans.map((plan) => (
            <Card key={plan.id} className="group hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg line-clamp-2">{plan.title}</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeletePlan(plan.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                    data-testid={`delete-plan-${plan.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Saved {formatDistanceToNow(new Date(plan.savedAt), { addSuffix: true })}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <MessageSquare className="w-4 h-4" />
                  <span>From: {plan.message.conversation.title}</span>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-4">
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>
                      {truncateContent(plan.message.content)}
                    </ReactMarkdown>
                  </div>

                  {plan.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {plan.tags.slice(0, 3).map(tag => (
                        <Badge 
                          key={tag} 
                          variant="secondary" 
                          className="text-xs"
                          onClick={() => setSelectedTag(tag)}
                          style={{ cursor: 'pointer' }}
                        >
                          {tag}
                        </Badge>
                      ))}
                      {plan.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{plan.tags.length - 3} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {filteredPlans.length > 0 && (
        <div className="mt-8 text-center text-sm text-gray-500">
          Showing {filteredPlans.length} of {savedPlans.length} saved plans
        </div>
      )}
    </div>
  );
}