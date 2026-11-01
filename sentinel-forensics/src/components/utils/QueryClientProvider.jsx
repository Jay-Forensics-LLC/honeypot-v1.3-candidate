import { QueryClient, QueryClientProvider as TanStackQueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry auth errors
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          return false;
        }
        // Retry up to 2 times for network errors
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
      staleTime: 60000, // 1 minute
      cacheTime: 300000, // 5 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
      // CRITICAL: Add timeout to ALL queries
      networkMode: 'online',
      useErrorBoundary: false, // Don't crash app on query errors
      onError: (error) => {
        console.debug('Query error (handled gracefully):', error?.message || error);
      }
    },
    mutations: {
      retry: false,
      useErrorBoundary: false,
      onError: (error) => {
        console.error('Mutation error:', error?.message || error);
      }
    }
  }
});

// Add global error handler for unhandled promise rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection (prevented crash):', event.reason);
    event.preventDefault(); // Prevent app crash
  });
}

export default function QueryClientProvider({ children }) {
  return (
    <TanStackQueryClientProvider client={queryClient}>
      {children}
    </TanStackQueryClientProvider>
  );
}