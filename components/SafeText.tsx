/**
 * Safe text rendering component with sanitization
 */

import React from 'react';
import { Text, TextProps } from 'react-native';
import { StoryValidator } from '@/lib/story-validator';

interface SafeTextProps extends TextProps {
  children: string;
  allowHtml?: boolean;
  maxLength?: number;
}

/**
 * SafeText component that sanitizes content before rendering
 *
 * Features:
 * - Removes script tags
 * - Removes event handlers
 * - Removes dangerous protocols
 * - Optional length limiting
 *
 * Usage:
 * <SafeText>{userProvidedText}</SafeText>
 */
export function SafeText({ children, allowHtml = false, maxLength, ...textProps }: SafeTextProps) {
  // Sanitize the text
  let sanitized = StoryValidator.sanitizeText(children || '');

  // Truncate if needed
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + '...';
  }

  // If HTML is not allowed, strip all tags
  if (!allowHtml) {
    sanitized = sanitized.replace(/<[^>]*>/g, '');
  }

  return <Text {...textProps}>{sanitized}</Text>;
}

/**
 * Hook for sanitizing text
 */
export function useSanitizedText(text: string, options?: { maxLength?: number }): string {
  return React.useMemo(() => {
    let sanitized = StoryValidator.sanitizeText(text);

    if (options?.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.slice(0, options.maxLength) + '...';
    }

    return sanitized;
  }, [text, options?.maxLength]);
}

/**
 * Sanitize HTML for safe rendering
 */
export function sanitizeHtml(html: string): string {
  let sanitized = html;

  // Remove script tags
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove iframe tags
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

  // Remove object/embed tags
  sanitized = sanitized.replace(/<(object|embed)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '');

  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '');

  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');

  // Remove data: protocol (can be used for XSS)
  sanitized = sanitized.replace(/data:text\/html/gi, '');

  // Remove vbscript: protocol
  sanitized = sanitized.replace(/vbscript:/gi, '');

  return sanitized;
}

/**
 * Check if text contains potentially dangerous content
 */
export function containsDangerousContent(text: string): boolean {
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /data:text\/html/i,
    /vbscript:/i,
    /<object/i,
    /<embed/i,
  ];

  return dangerousPatterns.some(pattern => pattern.test(text));
}
