import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Home, User, Bell, Share2, Settings } from 'lucide-react-native';
import { useRouter, usePathname } from 'expo-router';

export default function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web' || width <= 768) {
    return null;
  }

  const tabs = [
    { name: 'Home', path: '/(tabs)/', icon: Home },
    { name: 'Shares', path: '/(tabs)/shares', icon: Share2 },
    { name: 'Notifications', path: '/(tabs)/notifications', icon: Bell },
    { name: 'Profile', path: '/(tabs)/profile', icon: User },
    { name: 'Settings', path: '/(tabs)/settings', icon: Settings },
  ];

  return (
    <View style={styles.sidebar}>
      <Text style={styles.logo}>AYS</Text>
      <View style={styles.nav}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.path ||
            (tab.path === '/(tabs)/' && (pathname === '/(tabs)' || pathname === '/(tabs)/'));

          return (
            <TouchableOpacity
              key={tab.path}
              style={[styles.navItem, isActive && styles.navItemActive]}
              onPress={() => router.push(tab.path as any)}
            >
              <Icon size={20} color={isActive ? '#000' : '#666'} />
              <Text style={[styles.navText, isActive && styles.navTextActive]}>
                {tab.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    position: 'fixed' as any,
    left: 0,
    top: 0,
    bottom: 0,
    width: 220,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#E5E5EA',
    padding: 16,
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    letterSpacing: 0.5,
  },
  nav: {
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 8,
  },
  navItemActive: {
    backgroundColor: '#f0f0f0',
  },
  navText: {
    fontSize: 16,
    color: '#666',
  },
  navTextActive: {
    color: '#000',
    fontWeight: '600',
  },
});
