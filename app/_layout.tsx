import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '../hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useEffect } from 'react';
import InstallPrompt from '../components/InstallPrompt';
import { SafeAreaView } from 'react-native-safe-area-context';

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
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <InstallPrompt />
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
    </View>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="light" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
});
