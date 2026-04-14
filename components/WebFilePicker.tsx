/**
 * WebFilePicker Component
 * Web-optimized file picker with drag & drop support
 */

import React, { useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import {
  hasFiles,
  getFilesFromDragEvent,
  preventDefaultDrag,
  validateFileType,
  validateFileSize,
  formatFileSize,
  fileToDataUri,
} from '@/lib/web-utils';

export type FileType = 'image' | 'audio' | 'video' | 'any';

interface WebFilePickerProps {
  type: FileType;
  multiple?: boolean;
  maxSize?: number; // in bytes, default 10MB
  onFilesSelected: (files: { uri: string; name: string; type: string; size: number }[]) => void;
  onError?: (error: string) => void;
}

const ACCEPT_TYPES: Record<FileType, string> = {
  image: 'image/*',
  audio: 'audio/*',
  video: 'video/*',
  any: '*/*',
};

const MIME_TYPES: Record<FileType, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'],
  video: ['video/mp4', 'video/webm', 'video/ogg'],
  any: ['*/*'],
};

export function WebFilePicker({
  type,
  multiple = false,
  maxSize = 10 * 1024 * 1024, // 10MB default
  onFilesSelected,
  onError,
}: WebFilePickerProps) {
  const colors = useColors();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Only render on web
  if (Platform.OS !== 'web') {
    return null;
  }

  const processFiles = useCallback(async (files: File[]) => {
    setIsProcessing(true);

    try {
      const validFiles: { uri: string; name: string; type: string; size: number }[] = [];
      const errors: string[] = [];

      for (const file of files) {
        // Validate file type
        if (!validateFileType(file, MIME_TYPES[type])) {
          errors.push(`${file.name}: Invalid file type`);
          continue;
        }

        // Validate file size
        if (!validateFileSize(file, maxSize)) {
          errors.push(`${file.name}: File too large (max ${formatFileSize(maxSize)})`);
          continue;
        }

        // Convert to data URI
        try {
          const uri = await fileToDataUri(file);
          validFiles.push({
            uri,
            name: file.name,
            type: file.type,
            size: file.size,
          });
        } catch {
          errors.push(`${file.name}: Failed to read file`);
        }
      }

      if (errors.length > 0 && onError) {
        onError(errors.join('\n'));
      }

      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [type, maxSize, onFilesSelected, onError]);

  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      processFiles(Array.from(files));
    }
    // Reset input value to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [processFiles]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDragEnter = useCallback((event: any) => {
    preventDefaultDrag(event.nativeEvent);
    if (hasFiles(event.nativeEvent)) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((event: any) => {
    preventDefaultDrag(event.nativeEvent);
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((event: any) => {
    preventDefaultDrag(event.nativeEvent);
  }, []);

  const handleDrop = useCallback((event: any) => {
    preventDefaultDrag(event.nativeEvent);
    setIsDragging(false);

    const files = getFilesFromDragEvent(event.nativeEvent);
    if (files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  const typeLabel = type === 'image' ? 'images' : type === 'audio' ? 'audio files' : 'files';

  return (
    <View style={styles.container}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef as any}
        type="file"
        accept={ACCEPT_TYPES[type]}
        multiple={multiple}
        onChange={handleFileInputChange as any}
        style={{ display: 'none' }}
      />

      {/* Drop zone */}
      <Pressable
        onPress={handleClick}
        // @ts-ignore - web-only events
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={({ pressed }) => [
          styles.dropZone,
          {
            backgroundColor: isDragging
              ? colors.primary + '20'
              : pressed
              ? colors.surface
              : colors.background,
            borderColor: isDragging ? colors.primary : colors.border,
            opacity: isProcessing ? 0.6 : 1,
          },
        ]}
        disabled={isProcessing}
      >
        <View style={styles.dropZoneContent}>
          <Text style={[styles.icon, { color: colors.primary }]}>
            {type === 'image' ? '🖼️' : type === 'audio' ? '🎵' : '📁'}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {isProcessing
              ? 'Processing...'
              : isDragging
              ? `Drop ${typeLabel} here`
              : `Click or drag ${typeLabel} here`}
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {multiple ? 'Multiple files supported' : 'Single file only'} • Max {formatFileSize(maxSize)}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
    cursor: 'pointer',
  },
  dropZoneContent: {
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
});
