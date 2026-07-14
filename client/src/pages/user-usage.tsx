import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Seo } from "@/components/Seo";

interface UsageLog {
  id: number;
  sessionId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  conversationLength: number;
  responseTimeMs: number;
  timestamp: string;
  userMessage: string;
  aiResponse: string;
}

export default function UserUsage() {
  const { isAuthenticated } = useAuth();

  const { data: usageLogs, isLoading } = useQuery<UsageLog[]>({
    queryKey: ["/api/user/usage"],
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Seo title="My Usage | AITaxMD" noindex />
        <Card className="w-full max-w-md mx-auto" data-testid="card-unauthorized">
          <CardHeader>
            <CardTitle className="text-center">Sign In Required</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">
              Please sign in to view your usage history.
            </p>
            <Link href="/">
              <Button data-testid="button-back-home">Back to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalTokens = usageLogs?.reduce((sum, log) => sum + log.totalTokens, 0) || 0;
  const totalInteractions = usageLogs?.length || 0;
  const avgResponseTime = usageLogs?.length 
    ? Math.round(usageLogs.reduce((sum, log) => sum + log.responseTimeMs, 0) / usageLogs.length)
    : 0;

  return (
    <div className="container mx-auto py-8 px-4">
      <Seo title="My Usage | AITaxMD" noindex />
      <div className="flex items-center gap-4 mb-8">
        <Link href="/">
          <Button variant="outline" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Chat
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-title">My Usage</h1>
          <p className="text-muted-foreground">Your AITaxMD conversation history</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card data-testid="card-total-conversations">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-conversations">{totalInteractions}</div>
          </CardContent>
        </Card>

        <Card data-testid="card-total-tokens-used">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Tokens Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-tokens-used">{totalTokens.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card data-testid="card-avg-response-time">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Avg. Response Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-response-time">{avgResponseTime}ms</div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-usage-history">
        <CardHeader>
          <CardTitle>Usage History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="p-4 border rounded space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse"></div>
                  <div className="h-3 bg-gray-200 rounded w-full animate-pulse"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3 animate-pulse"></div>
                </div>
              ))}
            </div>
          ) : usageLogs && usageLogs.length > 0 ? (
            <div className="space-y-4">
              {usageLogs.map((log) => (
                <div key={log.id} className="p-4 border rounded space-y-3" data-testid={`row-usage-log-${log.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Tokens: {log.totalTokens}</span>
                      <span>Response: {log.responseTimeMs}ms</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div>
                      <div className="text-sm font-medium text-blue-600 mb-1">Your message:</div>
                      <div className="text-sm bg-blue-50 dark:bg-blue-950 p-2 rounded" data-testid={`text-user-message-${log.id}`}>
                        {log.userMessage.length > 200 
                          ? `${log.userMessage.substring(0, 200)}...` 
                          : log.userMessage}
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-sm font-medium text-green-600 mb-1">AI response:</div>
                      <div className="text-sm bg-green-50 dark:bg-green-950 p-2 rounded" data-testid={`text-ai-response-${log.id}`}>
                        {log.aiResponse.length > 300 
                          ? `${log.aiResponse.substring(0, 300)}...` 
                          : log.aiResponse}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No usage history available yet.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Start a conversation with AITaxMD to see your history here.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}