import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TooltipProps {
  text: string;
  children?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children, position = 'top' }) => {
  const [visible, setVisible] = useState(false);

  const toggleTooltip = () => {
    setVisible(!visible);
  };

  const positionStyles = {
    top: { bottom: '100%', marginBottom: 8 },
    bottom: { top: '100%', marginTop: 8 },
    left: { right: '100%', marginRight: 8 },
    right: { left: '100%', marginLeft: 8 },
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={toggleTooltip} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        {children || (
          <View style={styles.iconContainer}>
            <Ionicons name="help-circle-outline" size={20} color="#94a3b8" />
          </View>
        )}
      </TouchableOpacity>

      {visible && (
        <Modal transparent visible={visible} animationType="fade">
          <TouchableWithoutFeedback onPress={toggleTooltip}>
            <View style={styles.overlay}>
              <View style={[styles.tooltipBox, positionStyles[position]]}>
                <Text style={styles.tooltipText}>{text}</Text>
                <TouchableOpacity onPress={toggleTooltip} style={styles.closeButton}>
                  <Ionicons name="close" size={16} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1000,
  },
  iconContainer: {
    padding: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipBox: {
    position: 'absolute',
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    maxWidth: 250,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  tooltipText: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 20,
    marginRight: 20,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
});
