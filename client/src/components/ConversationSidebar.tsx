import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Plus, Trash2, Edit3, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface ConversationSidebarProps {
  activeConversationId?: number;
  onSelectConversation: (id: number) => void;
  onNewConversation: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function ConversationSidebar({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  isCollapsed,
  onToggleCollapse
}: ConversationSidebarProps) {
  // DISABLED: Out-of-scope edit functionality
  // const [editingId, setEditingId] = useState<number | null>(null);
  // const [editTitle, setEditTitle] = useState("");
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    staleTime: 0, // Ensures the sidebar always has the freshest data after an invalidation.
  });

  // DISABLED: Out-of-scope edit functionality
  /*
  const updateConversationMutation = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      apiRequest(`/api/conversations/${id}`, {
        method: "PUT",
        body: { title },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setEditingId(null);
    },
  });
  */

  // DISABLED: Out-of-scope delete functionality
  /*
  const deleteConversationMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/conversations/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });
  */

  // DISABLED: Out-of-scope edit and delete functionality
  /*
  const handleStartEdit = (conversation: Conversation) => {
    setEditingId(conversation.id);
    setEditTitle(conversation.title || `Conversation ${conversation.id}`);
  };

  const handleSaveEdit = () => {
    if (editingId && editTitle.trim()) {
      updateConversationMutation.mutate({
        id: editingId,
        title: editTitle.trim(),
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const handleDeleteConversation = (id: number) => {
    if (confirm("Are you sure you want to delete this conversation?")) {
      deleteConversationMutation.mutate(id);
    }
  };
  */

  if (isCollapsed) {
    return (
      <div className="w-16 bg-gray-50 border-r border-gray-200 p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="w-full p-2"
          data-testid="expand-sidebar"
        >
          <MessageSquare className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewConversation}
          className="w-full p-2 mt-2"
          data-testid="new-conversation-collapsed"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Conversations</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            data-testid="collapse-sidebar"
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
        </div>
        <Button
          onClick={onNewConversation}
          className="w-full"
          data-testid="new-conversation"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Conversation
        </Button>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-16 bg-gray-200 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs">Start a new conversation to begin</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group p-3 rounded-lg border cursor-pointer transition-colors ${
                    activeConversationId === conversation.id
                      ? "bg-blue-50 border-blue-200"
                      : "bg-white border-gray-200 hover:bg-gray-50"
                  }`}
                  onClick={() => onSelectConversation(conversation.id)}
                  data-testid={`conversation-${conversation.id}`}
                >
                  {/* DISABLED: Out-of-scope edit mode UI
                  {editingId === conversation.id ? (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit();
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                        autoFocus
                        data-testid={`edit-title-${conversation.id}`}
                      />
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={handleSaveEdit}
                          disabled={updateConversationMutation.isPending}
                          data-testid={`save-title-${conversation.id}`}
                        >
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                          data-testid={`cancel-edit-${conversation.id}`}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                  */}
                    <>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 truncate">
                            {conversation.title || `Conversation ${conversation.id}`}
                          </h3>
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {formatDistanceToNow(new Date(conversation.updatedAt), {
                                addSuffix: true,
                              })}
                            </span>
                            <span>•</span>
                            <span>{conversation.messageCount} messages</span>
                          </div>
                        </div>
                        {/* DISABLED: Out-of-scope edit and delete buttons
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(conversation);
                            }}
                            data-testid={`edit-conversation-${conversation.id}`}
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteConversation(conversation.id);
                            }}
                            data-testid={`delete-conversation-${conversation.id}`}
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                        */}
                      </div>
                    </>
                  {/* )} */}
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}