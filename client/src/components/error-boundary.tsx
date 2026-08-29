import React, { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-6 bg-surface rounded-lg border border-destructive">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Что-то пошло не так
          </h2>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
            {this.state.error?.message || 'Произошла непредвиденная ошибка'}
          </p>
          <button
            onClick={this.resetError}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-accent-hover transition-colors"
          >
            Попробовать снова
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => setError(null), []);

  if (error) {
    throw error;
  }

  return { setError, resetError };
}

import { toast } from '@/hooks/use-toast';

export function reportError(error: Error | unknown, context?: string) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`[Error${context ? ` - ${context}` : ''}]:`, error);
  toast({
    title: 'Ошибка',
    description: context ? `${context}: ${message}` : message,
    variant: 'destructive',
  });
}
