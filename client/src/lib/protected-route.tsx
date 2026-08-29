import React from "react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

class RouteErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    const msg = error?.message || 'Произошла ошибка при рендеринге страницы';
    toast({ title: 'Ошибка страницы', description: String(msg), variant: 'destructive' });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
          <h2 className="text-xl font-semibold mb-2">Что-то пошло не так</h2>
          <p className="text-sm text-muted-foreground">Попробуйте перезагрузить страницу или вернуться позже.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element;
}) {
  const { user, isLoading } = useAuth();

  return (
    <Route path={path}>
      {isLoading ? (
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      ) : user ? (
        <RouteErrorBoundary>
          <Component />
        </RouteErrorBoundary>
      ) : (
        <Redirect to="/auth" />
      )}
    </Route>
  );
}
