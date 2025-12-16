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
          </View>

          <View style={styles.sidebarMenu}>
            <TouchableOpacity
              style={[styles.sidebarItem, pathname === '/' && styles.sidebarItemActive]}
              onPress={() => router.push('/')}>
              <Home size={24} color={pathname === '/' ? '#fff' : '#8e8e93'} />
              <Text style={[styles.sidebarItemText, pathname === '/' && styles.sidebarItemTextActive]}>
                Home
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sidebarItem, pathname === '/shares' && styles.sidebarItemActive]}
              onPress={() => router.push('/shares')}>
              <Share2 size={24} color={pathname === '/shares' ? '#fff' : '#8e8e93'} />
              <Text style={[styles.sidebarItemText, pathname === '/shares' && styles.sidebarItemTextActive]}>
                Shares
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sidebarItem, pathname === '/notifications' && styles.sidebarItemActive]}
              onPress={() => router.push('/notifications')}>
              <Bell size={24} color={pathname === '/notifications' ? '#fff' : '#8e8e93'} />
              <Text style={[styles.sidebarItemText, pathname === '/notifications' && styles.sidebarItemTextActive]}>
                Notifications
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sidebarItem, pathname === '/profile' && styles.sidebarItemActive]}
              onPress={() => router.push('/profile')}>
              <User size={24} color={pathname === '/profile' ? '#fff' : '#8e8e93'} />
              <Text style={[styles.sidebarItemText, pathname === '/profile' && styles.sidebarItemTextActive]}>
                Profile
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sidebarItem, pathname === '/settings' && styles.sidebarItemActive]}
              onPress={() => router.push('/settings')}>
              <Settings size={24} color={pathname === '/settings' ? '#fff' : '#8e8e93'} />
              <Text style={[styles.sidebarItemText, pathname === '/settings' && styles.sidebarItemTextActive]}>
                Settings
              </Text>
            </TouchableOpacity>
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
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopWidth: 1,
          borderTopColor: '#2c2c2e',
          paddingBottom: 5,
          paddingTop: 5,
          height: 55,
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
  },
  sidebar: {
    width: 280,
    backgroundColor: '#000000',
    borderRightWidth: 1,
    borderRightColor: '#2c2c2e',
    paddingTop: 20,
  },
  sidebarHeader: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
  },
  sidebarTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 1,
    color: '#ffffff',
  },
  sidebarMenu: {
    paddingTop: 8,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 16,
    borderRadius: 8,
    marginHorizontal: 12,
    marginVertical: 2,
  },
  sidebarItemActive: {
    backgroundColor: '#1c1c1e',
  },
  sidebarItemText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#8e8e93',
  },
  sidebarItemTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  desktopContent: {
    flex: 1,
  },
});
