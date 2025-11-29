import { Platform, useWindowDimensions } from 'react-native';

export function useResponsive() {
  const { width } = useWindowDimensions();

  return {
    isDesktop: Platform.OS === 'web' && width > 768,
    isTablet: width >= 768 && width < 1024,
    isMobile: width < 768,
    width,
  };
}
