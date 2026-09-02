/**
 * Drop files onto the library to add them.
 *
 * Adding art meant the `+` button and a file dialog, one file at a time, while
 * the author already had the folder open next to the window. A drop is the
 * shortest path there is, and the browser gives it away — this only has to ask
 * for it.
 *
 * Web-only behaviour in one file rather than a `.web.tsx` split, the way the
 * pickers and `thumbnails` do it: everywhere else the zone is its children and
 * nothing more.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';

interface MediaDropZoneProps {
  colors: ThemeColorPalette;
  /** Called with everything dropped at once; classifying them is the screen's job. */
  onDropFiles: (files: File[]) => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function MediaDropZone({ colors, onDropFiles, style, children }: MediaDropZoneProps) {
  const { t } = useI18n();
  const hostRef = useRef<View | null>(null);
  const [over, setOver] = useState(false);
  // `dragleave` fires for every child the pointer crosses, so leaving is only
  // real when as many leaves have arrived as enters.
  const depth = useRef(0);
  const onDropRef = useRef(onDropFiles);
  onDropRef.current = onDropFiles;

  const reset = useCallback(() => {
    depth.current = 0;
    setOver(false);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = hostRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;

    const enter = (event: DragEvent) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      event.preventDefault();
      depth.current += 1;
      setOver(true);
    };
    // Without a prevented dragover the browser navigates to the file instead.
    const over_ = (event: DragEvent) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const drop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      reset();
      onDropRef.current(files);
    };

    node.addEventListener('dragenter', enter);
    node.addEventListener('dragover', over_);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragenter', enter);
      node.removeEventListener('dragover', over_);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, [reset]);

  return (
    <View ref={hostRef} style={style}>
      {children}
      {over ? (
        <View
          pointerEvents="none"
          style={[
            styles.overlay,
            { backgroundColor: colors['surface-1'], borderColor: colors.primary },
          ]}
        >
          <IconSymbol name="add" size={28} color={colors.primary} />
          <Text style={[typeScale.body, { color: colors.foreground }]}>
            {t('mediaLibrary.drop.hint')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    margin: spacing.sm,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    opacity: 0.96,
  },
});
