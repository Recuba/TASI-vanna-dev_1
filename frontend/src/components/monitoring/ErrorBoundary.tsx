'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';
import { ErrorFallback } from './ErrorFallback';

/**
 * Enhanced error boundary with Sentry reporting and dark-gold themed UI.
 * Use this in place of the basic error boundary when Sentry integration is needed.
 */

interface MonitoringErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((props: { error: Error; onReset: () => void }) => ReactNode);
}

interface MonitoringErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  eventId: string | null;
}

export class MonitoringErrorBoundary extends Component<
  MonitoringErrorBoundaryProps,
  MonitoringErrorBoundaryState
> {
  constructor(props: MonitoringErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, eventId: null };
  }

  static getDerivedStateFromError(error: Error): Partial<MonitoringErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const eventId = Sentry.captureException(error, {
      extra: {
        componentStack: errorInfo.componentStack,
      },
    });
    this.setState({ eventId });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, eventId: null });
  };

  handleReportIssue = () => {
    if (this.state.eventId) {
      Sentry.showReportDialog({ eventId: this.state.eventId });
    }
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Custom fallback provided
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback({
            error: this.state.error,
            onReset: this.handleReset,
          });
        }
        return this.props.fallback;
      }

      // Default fallback with Sentry report button
      return (
        <div>
          <ErrorFallback error={this.state.error} onReset={this.handleReset} />
          {this.state.eventId && (
            <div className="text-center pb-8">
              <button
                onClick={this.handleReportIssue}
                className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-gold border border-[var(--text-muted)]/20 hover:border-gold/30 px-4 py-2 rounded-lg transition-all duration-300"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
                Report Issue
              </button>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
