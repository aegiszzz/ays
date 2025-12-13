import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '../hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useEffect } from 'react';
import InstallPrompt from '../components/InstallPrompt';
import DesktopSidebar from '../components/DesktopSidebar';

function RootNavigator() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const inAdminGroup = segments[0] === 'admin';
    const allowedAuthenticatedRoutes = [
      'conversation',
      'direct-message',
      'send-message',
      'group-share',
      'search-users',
      'followers',
      'following',
      'group-conversation',
      'edit-profile',
      'user-profile',
    ];
    const isAllowedRoute = allowedAuthenticatedRoutes.includes(segments[0] as string);
    const onIndexPage = segments.length === 0 || (segments.length === 1 && segments[0] === 'index');

    if (!session && (inAuthGroup || inAdminGroup || isAllowedRoute)) {
      router.replace('/');
    } else if (session && onIndexPage) {
      router.replace('/(tabs)/');
    }
  }, [session, segments, loading]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1DA1F2" />
      </View>
    );
  }

  const inAuthGroup = segments[0] === '(tabs)';

  return (
    <>
      <InstallPrompt />
      {session && inAuthGroup && <DesktopSidebar />}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="conversation" />
        <Stack.Screen name="direct-message" />
        <Stack.Screen name="send-message" />
        <Stack.Screen name="group-share" />
        <Stack.Screen name="search-users" />
        <Stack.Screen name="followers" />
        <Stack.Screen name="following" />
        <Stack.Screen name="group-conversation" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="user-profile" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});
