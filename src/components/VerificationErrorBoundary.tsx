'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { CircleAlert } from './icons';
import { Button } from './ui/button';
import { useText } from '../i18n';

// Browser-only SDK; consumer bundlers inline process.env.NODE_ENV.
declare const process: { env?: { NODE_ENV?: string } } | undefined;
function isDevEnv(): boolean {
  try {
    return typeof process !== 'undefined' && process?.env?.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

interface Props {
  children: ReactNode;
  onError?: (error: Error) => void;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** The fallback's words; a function component so it can read the workflow's texts. */
function ErrorFallbackCopy({ onReset }: { onReset: () => void }) {
  const t = useText();
  return (
    <>
      <div className="space-y-1">
        <h3 className="text-base font-semibold font-heading">{t('general.errorBoundary.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('general.errorBoundary.description')}</p>
      </div>
      <Button variant="outline" onClick={onReset}>
        {t('general.errorBoundary.tryAgainButton')}
      </Button>
    </>
  );
}

export class VerificationErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the real error — without this the boundary silently hides what
    // actually threw, making bugs (e.g. on liveness retake) undiagnosable.
    // eslint-disable-next-line no-console
    console.error('[Verification] Uncaught error in KYC flow:', error, info.componentStack);
    this.props.onError?.(error);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <CircleAlert className="h-7 w-7 text-destructive" />
          </div>
          <ErrorFallbackCopy onReset={this.handleReset} />
          {isDevEnv() && this.state.error && (
            <pre className="mt-2 max-h-40 w-full overflow-auto rounded-md bg-destructive/5 p-3 text-left text-xs text-destructive whitespace-pre-wrap">
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
