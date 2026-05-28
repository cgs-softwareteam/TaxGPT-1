import { useQuery } from "@tanstack/react-query";

const ENABLE_AUTHENTICATION =
  import.meta.env.VITE_ENABLE_AUTHENTICATION === "true";

export interface GuestStatus {
  /** True when the request was made by a logged-in user or when auth is disabled. */
  authenticated: boolean;
  /** Number of prompts the current guest has already used. */
  used: number;
  /** Server-configured limit (GUEST_PROMPT_LIMIT env, default 15). */
  limit: number;
  /** limit - used (clamped to >= 0). */
  remaining: number;
}

/**
 * Polls /api/guest/status so the UI can display the remaining free-prompt count
 * and gate behaviour. Returns undefined while loading. The query key matches the
 * endpoint URL so callers can invalidate it via
 *   queryClient.invalidateQueries({ queryKey: ["/api/guest/status"] })
 * after sending a prompt.
 */
export function useGuestStatus() {
  const query = useQuery<GuestStatus>({
    queryKey: ["/api/guest/status"],
    // When auth is disabled at the env level, treat everyone as authenticated
    // and skip the network call entirely.
    enabled: ENABLE_AUTHENTICATION,
    staleTime: 30_000,
    retry: false,
  });

  return {
    status: query.data,
    isLoading: ENABLE_AUTHENTICATION ? query.isLoading : false,
    isError: query.isError,
    refetch: query.refetch,
  };
}
