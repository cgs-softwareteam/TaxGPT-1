import { useQuery } from "@tanstack/react-query";

const ENABLE_AUTHENTICATION = import.meta.env.VITE_ENABLE_AUTHENTICATION === 'true';

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/auth/user"],
    enabled: ENABLE_AUTHENTICATION,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Authentication successfully configured

  return {
    user,
    isLoading: ENABLE_AUTHENTICATION ? isLoading : false,
    isAuthenticated: ENABLE_AUTHENTICATION ? !!user : true, // Default to authenticated when auth is disabled
    error,
    authEnabled: ENABLE_AUTHENTICATION,
  };
}