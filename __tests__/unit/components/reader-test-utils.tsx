import React from 'react';
import type { useColors } from '@/hooks/use-colors';

export const mockColors = {
  background: '#050505',
  border: '#333333',
  'border-subtle': '#444444',
  choiceBg: '#111111',
  choiceBorder: '#555555',
  choiceText: '#ffffff',
  dialogueBorder: '#333333',
  dialogueBg: '#101010',
  dialogueText: '#ffffff',
  error: '#ef4444',
  fallback: '#000000',
  foreground: '#ffffff',
  muted: '#aaaaaa',
  nameBg: '#222222',
  nameText: '#ffffff',
  overlay: '#222222',
  primary: '#60a5fa',
  surface: '#181818',
  'surface-1': '#202020',
  'text-inverse': '#000000',
} as unknown as ReturnType<typeof useColors>;

export function ReaderControlsStub() {
  return <span data-testid="reader-controls">controls</span>;
}
