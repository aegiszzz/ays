import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useResponsive } from '@/lib/responsive';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  maxWidth?: number;
}

export default function ResponsiveContainer({
  children,
  style,
  maxWidth = 800
}: ResponsiveContainerProps) {
  const { isDesktop } = useResponsive();

  return (
    <View style={[
      style,
      isDesktop && styles.desktopContainer,
      isDesktop && { maxWidth }
    ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  desktopContainer: {
    marginLeft: 240,
    alignSelf: 'center',
    width: '100%',
  },
});
