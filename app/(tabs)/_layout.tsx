import { Tabs, usePathname } from 'expo-router';
import { Home, User, Bell, Share2, Settings } from 'lucide-react-native';
import { useWindowDimensions, Platform, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > 768;
  const router = useRouter();
  const pathname = usePathname();

  if (isDesktop) {
    return (
      <View style={styles.desktopContainer}>
        <View style={styles.sidebar}>
          <View style={styles.sidebarHeader}>
            <Text style={styles.sidebarTitle}>AYS</Text>
            <View style={styles.sidebarTitleDot} />
          </View>

          <View style={styles.sidebarMenu}>
            {[
              { icon: Home, label: 'Home', path: '/' },
              { icon: Share2, label: 'Shares', path: '/shares' },
              { icon: Bell, label: 'Notifications', path: '/notifications' },
              { icon: User, label: 'Profile', path: '/profile' },
              { icon: Settings, label: 'Settings', path: '/settings' },
            ].map(({ icon: Icon, label, path }) => {
              const isActive = pathname === path;
              return (
                <TouchableOpacity
                  key={path}
                  style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
                  onPress={() => router.push(path as any)}
                >
                  {isActive && <View style={styles.sidebarActiveBar} />}
                  <Icon size={22} color={isActive ? '#6C3AE8' : '#4A4A6A'} />
                  <Text style={[styles.sidebarItemText, isActive && styles.sidebarItemTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.desktopContent}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
            }}>
            <Tabs.Screen name="index" />
            <Tabs.Screen name="shares" />
            <Tabs.Screen name="notifications" />
            <Tabs.Screen name="profile" />
            <Tabs.Screen name="settings" />
          </Tabs>
        </View>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6C3AE8',
        tabBarInactiveTintColor: '#4A4A6A',
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: '#0A0A0F',
          borderTopWidth: 1,
          borderTopColor: '#1C1C2E',
          paddingBottom: 8,
          paddingTop: 8,
          height: 70,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ size, color }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="shares"
        options={{
          title: 'Shares',
          tabBarIcon: ({ size, color }) => <Share2 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarIcon: ({ size, color }) => <Bell size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ size, color }) => <User size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ size, color }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  desktopContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0A0A0F',
  },
  sidebar: {
    width: 260,
    backgroundColor: '#0A0A0F',
    borderRightWidth: 1,
    borderRightColor: '#1C1C2E',
    paddingTop: 20,
  },
  sidebarHeader: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C2E',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sidebarTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
    color: '#ffffff',
  },
  sidebarTitleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6C3AE8',
    marginTop: 4,
  },
  sidebarMenu: {
    paddingTop: 12,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 14,
    borderRadius: 12,
    marginHorizontal: 12,
    marginVertical: 2,
    position: 'relative',
  },
  sidebarItemActive: {
    backgroundColor: 'rgba(108, 58, 232, 0.12)',
  },
  sidebarActiveBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    backgroundColor: '#6C3AE8',
    borderRadius: 2,
  },
  sidebarItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#4A4A6A',
  },
  sidebarItemTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  desktopContent: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
});
