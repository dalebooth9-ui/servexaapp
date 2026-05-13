import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary scoped to lazy-loaded JobDetail chunks.
 * If a code-split chunk fails to load (network hiccup, stale
 * deploy, cache miss, etc.) this shows a friendly retry UI instead
 * of blank-screening the whole page.
 */
export default class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("ChunkErrorBoundary caught:", error, info.componentStack);
  }

  private isChunkError(): boolean {
    const msg = this.state.error?.message || "";
    return (
      msg.includes("Loading chunk") ||
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("error loading dynamically imported module") ||
      msg.includes("Cannot find module")
    );
  }

  render() {
    if (this.state.hasError) {
      const chunkError = this.isChunkError();
      return (
        <div className="flex min-h-[16rem] items-center justify-center p-6">
          <div className="w-full max-w-sm text-center space-y-5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">
                {chunkError ? "Failed to load section" : "Something went wrong"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {chunkError
                  ? "A part of this page failed to load. This usually happens when the app was updated while you had it open."
                  : "An unexpected error occurred while loading this section."}
              </p>
              {this.state.error && (
                <p className="mt-2 rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground font-mono text-left break-all">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => window.location.reload()}
                className="w-full"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reload Page
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                }}
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
