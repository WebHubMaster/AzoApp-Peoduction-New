import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import "@/index.css";
import App from "@/App";
import ErrorBoundary from "@/components/ErrorBoundary";
import { installGlobalErrorHandlers } from "@/lib/globalErrorHandler";
import { registerServiceWorker } from "@/lib/registerSW";

// Install app-wide error handling early so the raw red runtime-error overlay
// never reaches the user — friendly toasts / fallback UI are shown instead.
installGlobalErrorHandlers();
registerServiceWorker();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    },
  },
});

// Server-rendered SEO tags are for crawlers/no-JS clients; Helmet owns the head once the app runs.
document.querySelectorAll("[data-ssr-seo]").forEach((n) => n.remove());

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HelmetProvider>
          <App />
        </HelmetProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
