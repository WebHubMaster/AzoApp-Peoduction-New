import React from "react";

/**
 * App-level error boundary. Catches render-time errors so the whole app never
 * shows the raw red "Uncaught runtime error" screen. Instead a clean, friendly
 * fallback is shown with a retry option.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Keep a console trace for debugging, but never surface the scary overlay.
    // eslint-disable-next-line no-console
    console.warn("Handled render error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-amber-50 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Something went wrong</h2>
            <p className="mt-2 text-sm text-slate-500">
              We ran into a problem while loading this page. Please try again.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
              >
                Retry
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#0D47A1] hover:bg-[#0b3c8a] transition"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
