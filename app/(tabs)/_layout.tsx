import { Tabs, usePathname } from 'expo-router';
import { Home, User, Bell, Share2, Settings } from 'lucide-react-native';
import { useWindowDimensions, Platform, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > 768;
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();

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
              { icon: Home, label: t.tabs.home, path: '/' },
              { icon: Share2, label: t.tabs.shares, path: '/shares' },
              { icon: Bell, label: t.tabs.notifications, path: '/notifications' },
              { icon: User, label: t.tabs.profile, path: '/profile' },
              { icon: Settings, label: t.tabs.settings, path: '/settings' },
            ].map(({ icon: Icon, label, path }) => {
              const isActive = pathname === path;
              return (
                <TouchableOpacity
                  key={path}
                  style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
                  onPress={() => router.push(path as any)}
                >
                  {isActive && <View style={styles.sidebarActiveBar} />}
                  <Icon size={22} color={isActive ? '#00A0DC' : '#4A4A4E'} />
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
        tabBarActiveTintColor: '#00A0DC',
        tabBarInactiveTintColor: '#4A4A4E',
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: '#0D0D0F',
          borderTopWidth: 1,
          borderTopColor: '#252528',
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
          title: t.tabs.home,
          tabBarIcon: ({ size, color }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="shares"
        options={{
          title: t.tabs.shares,
          tabBarIcon: ({ size, color }) => <Share2 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t.tabs.notifications,
          tabBarIcon: ({ size, color }) => <Bell size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.tabs.profile,
          tabBarIcon: ({ size, color }) => <User size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.tabs.settings,
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
    backgroundColor: '#0D0D0F',
  },
  sidebar: {
    width: 260,
    backgroundColor: '#0D0D0F',
    borderRightWidth: 1,
    borderRightColor: '#252528',
    paddingTop: 20,
  },
  sidebarHeader: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#252528',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sidebarTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
    color: '#FDFDFD',
  },
  sidebarTitleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00A0DC',
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
    backgroundColor: 'rgba(0, 160, 220, 0.12)',
  },
  sidebarActiveBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    backgroundColor: '#00A0DC',
    borderRadius: 2,
  },
  sidebarItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#4A4A4E',
  },
  sidebarItemTextActive: {
    color: '#FDFDFD',
    fontWeight: '600',
  },
  desktopContent: {
    flex: 1,
    backgroundColor: '#0D0D0F',
  },
});
