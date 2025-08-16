import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { LogOut, Settings, BarChart } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";

interface User {
  id: number;
  name: string;
  email: string;
  profilePicture?: string;
  role: string;
}

export function UserMenu() {
  const { user } = useAuth() as { user: User | undefined };
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: () => fetch("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/auth/user"] });
      window.location.href = "/";
    },
  });

  if (!user) {
    return null;
  }

  const initials = user.name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase() || "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full" data-testid="button-user-menu">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.profilePicture || undefined} alt={user.name} />
            <AvatarFallback data-testid="text-user-initials">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <div className="flex items-center justify-start gap-2 p-2">
          <div className="flex flex-col space-y-1 leading-none">
            <p className="font-medium" data-testid="text-user-name">{user.name}</p>
            <p className="w-[200px] truncate text-sm text-muted-foreground" data-testid="text-user-email">
              {user.email}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        
        <DropdownMenuItem asChild>
          <Link href="/usage" className="cursor-pointer" data-testid="link-usage">
            <Settings className="mr-2 h-4 w-4" />
            <span>My Usage</span>
          </Link>
        </DropdownMenuItem>
        
        {user.role === 'admin' && (
          <DropdownMenuItem asChild>
            <Link href="/admin" className="cursor-pointer" data-testid="link-admin">
              <BarChart className="mr-2 h-4 w-4" />
              <span>Admin Dashboard</span>
            </Link>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          data-testid="button-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{logoutMutation.isPending ? "Signing out..." : "Sign out"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}