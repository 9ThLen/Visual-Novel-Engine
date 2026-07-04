import React from 'react';

export function BlurView(props: Record<string, unknown> & { children?: React.ReactNode }) {
  return React.createElement('div', { 'data-testid': 'expo-blur-view', ...props }, props.children);
}
