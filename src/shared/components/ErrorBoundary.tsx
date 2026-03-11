import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/core/auth/authStore";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };
  private reported = false;

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("Unhandled error:", error, info);
    if (this.reported) return;
    this.reported = true;
    void this.reportError(error, info);
  }

  private async reportError(error: unknown, info: unknown) {
    const { user } = useAuth.getState();
    if (!user) return;
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack ?? null : null;
    const componentStack =
      typeof info === "object" && info && "componentStack" in info
        ? String((info as { componentStack?: string }).componentStack ?? "")
        : null;

    try {
      await supabase.from("client_error_logs").insert({
        tenant_id: user.tenantId,
        user_id: user.id,
        message,
        stack,
        component_stack: componentStack,
        url: window.location.href,
        user_agent: navigator.userAgent,
      });
    } catch {
      // Swallow errors to avoid cascading failures in the boundary.
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="max-w-md text-center space-y-3">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. Please reload the page.
            </p>
            <Button onClick={this.handleReload}>Reload</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
