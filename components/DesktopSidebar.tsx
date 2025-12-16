import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Home, User, Bell, Share2, Settings, MessageCircle } from 'lucide-react-native';
import { useRouter, usePathname } from 'expo-router';

export default function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web' || width <= 768) {
    return null;
  }

  const tabs = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Shares', path: '/shares', icon: Share2 },
    { name: 'Messages', path: '/direct-message', icon: MessageCircle },
    { name: 'Notifications', path: '/notifications', icon: Bell },
    { name: 'Profile', path: '/profile', icon: User },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <View style={styles.sidebar}>
      <Text style={styles.logo}>AYS</Text>
      <View style={styles.nav}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.path ||
            (tab.path === '/' && (pathname === '/(tabs)' || pathname === '/(tabs)/' || pathname === '/'));

          return (
            <TouchableOpacity
              key={tab.path}
              style={[styles.navItem, isActive && styles.navItemActive]}
              onPress={() => router.push(tab.path as any)}
            >
              <Icon size={24} color={isActive ? '#fff' : '#888'} />
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
    width: 240,
    backgroundColor: '#000',
    borderRightWidth: 1,
    borderRightColor: '#1f1f1f',
    padding: 20,
    paddingTop: 32,
    zIndex: 1000,
  },
  logo: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 40,
    letterSpacing: 0.5,
    color: '#fff',
  },
  nav: {
    gap: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 14,
    borderRadius: 12,
  },
  navItemActive: {
    backgroundColor: '#1a1a1a',
  },
  navText: {
    fontSize: 17,
    color: '#888',
    fontWeight: '500',
  },
  navTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
});
