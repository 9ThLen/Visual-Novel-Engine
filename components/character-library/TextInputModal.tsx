import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Modal } from 'react-native';

interface TextInputModalProps {
  visible: boolean;
  title: string;
  message?: string;
  defaultValue?: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  colors: any;
}

export const TextInputModal = ({
  visible,
  title,
  message,
  defaultValue = '',
  onSave,
  onCancel,
  colors,
}: TextInputModalProps) => {
  const [text, setText] = useState(defaultValue);

  useEffect(() => {
    if (visible) {
      setText(defaultValue);
    }
  }, [visible, defaultValue]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.modal, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          {message && <Text style={[styles.message, { color: colors.muted }]}>{message}</Text>}

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder="Type here..."
            placeholderTextColor={colors.muted}
          />

          <View style={styles.actions}>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={() => onSave(text)}
            >
              <Text style={styles.buttonText}>OK</Text>
            </Pressable>
            <Pressable
              style={[
                styles.button,
                {
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}
              onPress={onCancel}
            >
              <Text style={[styles.buttonText, { color: colors.foreground }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '80%',
    maxWidth: 400,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    marginBottom: 16,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
