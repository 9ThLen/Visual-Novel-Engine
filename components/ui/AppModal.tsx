/**
 * components/ui/AppModal.tsx — Modal wrapper that actually works on react-native-web
 *
 * Two react-native-web bugs make a bare <Modal> unusable in the browser:
 *
 * 1. Dead pointer events — the modal root is rendered with `pointer-events: none`
 *    and that is never reset on the modal content, so the whole subtree is
 *    click-through and buttons inside it never receive clicks. We reset it on the
 *    content wrapper.
 * 2. No unmount — flipping `visible` to false leaves the DOM mounted and
 *    interactive when an exit animation is used (with reduced motion enabled the
 *    animation never settles). On web we unmount instead and disable the
 *    animation.
 *
 * Native keeps the plain pass-through behaviour, animations included.
 */

import React from 'react';
import { Modal, Platform, View, type ModalProps, type StyleProp, type ViewStyle } from 'react-native';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';

export interface AppModalProps extends ModalProps {
  /** Extra style applied to the content wrapper that hosts `children`. */
  contentStyle?: StyleProp<ViewStyle>;
}

export function AppModal({ visible, animationType, contentStyle, children, ...rest }: AppModalProps) {
  const isWeb = Platform.OS === 'web';

  // Web: never keep a hidden modal in the tree — RNW leaves it mounted and clickable.
  if (isWeb && !visible) return null;

  return (
    <Modal visible={visible} animationType={isWeb ? 'none' : animationType} {...rest}>
      <View style={[{ flex: 1 }, getPointerEventsStyle('auto'), contentStyle]}>
        {children}
      </View>
    </Modal>
  );
}
