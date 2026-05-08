import React, { Component, ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, errorInfo: React.ErrorInfo, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary component to catch rendering errors and prevent app crashes
 *
 * Usage:
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 *
 * Or with custom fallback:
 * <ErrorBoundary fallback={(error, errorInfo, reset) => <CustomErrorUI />}>
 *   <YourComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
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
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.state.errorInfo!, this.resetError);
      }

      // Default error UI
      return (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
            backgroundColor: '#f8f9fa',
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              padding: 24,
              maxWidth: 600,
              width: '100%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Text
              style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: '#dc3545',
                marginBottom: 16,
                textAlign: 'center',
              }}
            >
              ⚠️ Щось пішло не так
            </Text>

            <Text
              style={{
                fontSize: 16,
                color: '#6c757d',
                marginBottom: 20,
                textAlign: 'center',
                lineHeight: 24,
              }}
            >
              Виникла помилка під час відображення цієї частини додатку. Спробуйте перезавантажити або зверніться до розробника.
            </Text>

            <ScrollView
              style={{
                maxHeight: 200,
                backgroundColor: '#f8f9fa',
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: '#495057',
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
                backgroundColor: '#007bff',
                borderRadius: 8,
                padding: 14,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: '600',
                }}
              >
                Спробувати знову
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}
