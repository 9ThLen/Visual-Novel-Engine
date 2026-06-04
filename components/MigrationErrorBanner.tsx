import { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useAppStore } from '@/stores/use-app-store';
import { ErrorHandler, ErrorCategory } from '@/lib/error-handler';

export function MigrationErrorBanner() {
  const colors = useColors();
  const migrationError = useAppStore((s) => s.migrationError);
  const clearMigrationError = useAppStore((s) => s.clearMigrationError);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (migrationError) {
      setVisible(true);
      ErrorHandler.handle(
        'Data migration failed — some settings may have been lost',
        migrationError,
        ErrorCategory.STORAGE,
      );
    }
  }, [migrationError]);

  if (!visible || !migrationError) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={() => {
        setVisible(false);
        clearMigrationError();
      }}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.backdrop,
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 24,
            maxWidth: 400,
            width: '100%',
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: 'bold',
              color: colors.error,
              marginBottom: 12,
            }}
          >
            Migration Warning
          </Text>

          <Text
            style={{
              fontSize: 14,
              color: colors.foreground,
              marginBottom: 8,
              lineHeight: 20,
            }}
          >
            Some data could not be migrated from the previous version. Your stories and saves
            should still be accessible, but you may need to re-import legacy content.
          </Text>

          <Text
            style={{
              fontSize: 12,
              color: colors.muted,
              marginBottom: 20,
              fontFamily: 'monospace',
            }}
          >
            {migrationError}
          </Text>

          <Pressable
            onPress={() => {
              setVisible(false);
              clearMigrationError();
            }}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 8,
              padding: 12,
              alignItems: 'center',
            }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Text style={{ color: colors['text-inverse'], fontSize: 14, fontWeight: '600' }}>
              Dismiss
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
