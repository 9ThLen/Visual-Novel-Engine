import React, { Component, ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '@/lib/error-handler';
import type { RuntimePalette } from '@/lib/_core/theme';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, errorInfo: React.ErrorInfo, reset: () => void) => ReactNode;
}

interface ErrorBoundaryInnerProps extends ErrorBoundaryProps {
  colors: RuntimePalette;
  titleText: string;
  messageText: string;
  retryText: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundaryInner extends Component<ErrorBoundaryInnerProps, State> {
  constructor(props: ErrorBoundaryInnerProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    ErrorHandler.handle('ErrorBoundary caught an error', error, ErrorCategory.RENDERING, ErrorSeverity.HIGH, {
      componentStack: errorInfo.componentStack,
    });
    this.setState({ errorInfo });
  }

  private resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    const { children, fallback, colors, titleText, messageText, retryText } = this.props;

    if (this.state.hasError && this.state.error) {
      if (fallback) {
        return fallback(
          this.state.error,
          this.state.errorInfo ?? { componentStack: '' },
          this.resetError,
        );
      }

      return (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
            backgroundColor: colors.background,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 24,
              maxWidth: 600,
              width: '100%',
              borderWidth: 1,
              borderColor: colors.border,
              elevation: 4,
            }}
          >
            <Text
              style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: colors.error,
                marginBottom: 16,
                textAlign: 'center',
              }}
            >
              {titleText}
            </Text>

            <Text
              style={{
                fontSize: 16,
                color: colors.muted,
                marginBottom: 20,
                textAlign: 'center',
                lineHeight: 24,
              }}
            >
              {messageText}
            </Text>

            <ScrollView
              style={{
                maxHeight: 200,
                backgroundColor: colors['surface-1'] ?? colors.background,
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: colors.foreground,
                }}
              >
                {this.state.error.toString()}
                {'\n\n'}
                {this.state.errorInfo?.componentStack}
              </Text>
            </ScrollView>

            <Pressable
              onPress={this.resetError}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 8,
                padding: 14,
                alignItems: 'center',
              }}
              accessibilityRole="button"
              accessibilityLabel={retryText}
            >
              <Text
                style={{
                  color: colors['text-inverse'],
                  fontSize: 16,
                  fontWeight: '600',
                }}
              >
                {retryText}
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return children;
  }
}

export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const palette = useColors();
  const { t } = useI18n();

  return (
    <ErrorBoundaryInner
      colors={palette}
      fallback={fallback}
      titleText={t('errorBoundary.title')}
      messageText={t('errorBoundary.message')}
      retryText={t('common.retry')}
    >
      {children}
    </ErrorBoundaryInner>
  );
}
