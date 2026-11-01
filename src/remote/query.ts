import { QueryClient } from '@tanstack/react-query';

/** One cache for the whole app; desktop events invalidate parts of it. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Freshness comes from the desktop's events, not from polling.
      staleTime: Infinity,
      retry: 1,
    },
  },
});
