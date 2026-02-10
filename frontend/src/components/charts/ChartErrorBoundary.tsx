'use client';

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ChartError } from './ChartError';

interface ChartErrorBoundaryProps {
  children: ReactNode;
  fallbackHeight?: number;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
}

export class ChartErrorBoundary extends Component<ChartErrorBoundaryProps, ChartErrorBoundaryState> {
  constructor(props: ChartErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ChartErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ChartErrorBoundary] Render error caught:', error, errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ChartError
          message="Something went wrong"
          onRetry={this.handleReset}
          height={this.props.fallbackHeight}
        />
      );
    }

    return this.props.children;
  }
}
