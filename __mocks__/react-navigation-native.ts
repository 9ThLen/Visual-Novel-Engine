export const useFocusEffect = (callback: () => void | (() => void)) => {
  const { useEffect } = require('react');
  useEffect(() => callback(), [callback]);
};
export const useIsFocused = () => true;
export const useNavigation = () => ({ navigate: () => {}, goBack: () => {} });
