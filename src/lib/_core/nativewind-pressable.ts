import { Platform, Pressable } from 'react-native';
import { getNativewindRemapProps } from '@/lib/theme-nativewind';

getNativewindRemapProps({
  isWeb: Platform.OS === 'web',
})?.(Pressable, { className: false });
