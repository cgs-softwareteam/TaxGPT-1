import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, MessageSquare, DollarSign, TrendingUp, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UsageStatistics {
  totalUsers: number;
  totalInteractions: number;
  totalTokensUsed: number;
  averageTokensPerUser: number;
  dailyActiveUsers: number;
}

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  lastLoginAt: string;
}

interface UsersResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth() as { user: AuthUser | undefined; isAuthenticated: boolean };
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery<UsageStatistics>({
    queryKey: ["/api/admin/stats"],
    enabled: isAuthenticated && user?.role === 'admin',
  });

  const { data: usersData, isLoading: usersLoading } = useQuery<UsersResponse>({
    queryKey: ["/api/admin/users", currentPage],
    queryFn: () => 
      fetch(`/api/admin/users?page=${currentPage}`, {
        credentials: 'include'
      })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        }),
    enabled: isAuthenticated && user?.role === 'admin',
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async (data: { userId: number; role: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${data.userId}/role`, { role: data.role });
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: "Role Updated",
        description: `User role changed to ${variables.role}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update user role",
        variant: "destructive",
      });
    },
  });

  const handleRoleToggle = (userId: number, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    updateUserRoleMutation.mutate({ userId, role: newRole });
  };

  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md mx-auto" data-testid="card-unauthorized">
          <CardHeader>
            <CardTitle className="text-center">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">
              You need admin privileges to view this page.
            </p>
            <Link href="/">
              <Button data-testid="button-back-home">Back to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/">
          <Button variant="outline" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Chat
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-title">Admin Dashboard</h1>
          <p className="text-muted-foreground">AITaxMD Usage Analytics</p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {statsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {[...Array(5)].map((_, i) => (
                <Card key={i}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-8 bg-gray-200 rounded w-16 animate-pulse mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-24 animate-pulse"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : stats ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card data-testid="card-total-users">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-users">{stats.totalUsers}</div>
                  <p className="text-xs text-muted-foreground">
                    Registered users
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-total-interactions">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Interactions</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-interactions">{stats.totalInteractions}</div>
                  <p className="text-xs text-muted-foreground">
                    AI conversations
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-total-tokens">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-tokens">{stats.totalTokensUsed.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    API usage
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-avg-tokens">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg. Tokens/User</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-avg-tokens">{stats.averageTokensPerUser}</div>
                  <p className="text-xs text-muted-foreground">
                    Per user average
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-daily-active">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Daily Active Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-daily-active">{stats.dailyActiveUsers}</div>
                  <p className="text-xs text-muted-foreground">
                    Last 24 hours
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">No statistics available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          {usersLoading ? (
            <Card>
              <CardHeader>
                <CardTitle>Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-4 border rounded">
                      <div className="space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
                        <div className="h-3 bg-gray-200 rounded w-48 animate-pulse"></div>
                      </div>
                      <div className="h-6 bg-gray-200 rounded w-16 animate-pulse"></div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : usersData ? (
            <Card data-testid="card-users-list">
              <CardHeader>
                <CardTitle>Users ({usersData.pagination.total})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {usersData.users.map((userItem) => (
                    <div key={userItem.id} className="flex items-center justify-between p-4 border rounded" data-testid={`row-user-${userItem.id}`}>
                      <div className="space-y-1">
                        <div className="font-medium" data-testid={`text-user-name-${userItem.id}`}>{userItem.name}</div>
                        <div className="text-sm text-muted-foreground" data-testid={`text-user-email-${userItem.id}`}>{userItem.email}</div>
                        <div className="text-xs text-muted-foreground">
                          Joined: {new Date(userItem.createdAt).toLocaleDateString()}
                          {" | "}
                          Last login: {new Date(userItem.lastLoginAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge 
                          variant={userItem.role === 'admin' ? 'destructive' : 'default'}
                          data-testid={`badge-role-${userItem.id}`}
                        >
                          {userItem.role}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Admin</span>
                          <Switch
                            checked={userItem.role === 'admin'}
                            onCheckedChange={() => handleRoleToggle(userItem.id, userItem.role)}
                            disabled={updateUserRoleMutation.isPending}
                            data-testid={`switch-role-${userItem.id}`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {usersData.pagination.pages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <p className="text-sm text-muted-foreground">
                      Page {usersData.pagination.page} of {usersData.pagination.pages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={usersData.pagination.page <= 1}
                        data-testid="button-prev-page"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(usersData.pagination.pages, p + 1))}
                        disabled={usersData.pagination.page >= usersData.pagination.pages}
                        data-testid="button-next-page"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">No users found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}