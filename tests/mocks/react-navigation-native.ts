let focused = true;

export const useFocusEffect = (callback: () => void | (() => void)) => {
  const { useEffect } = require('react');
  useEffect(() => callback(), [callback]);
};
export const useIsFocused = () => focused;
export const useNavigation = () => ({ navigate: () => {}, goBack: () => {} });
export const __setIsFocused = (value: boolean) => {
  focused = value;
};
