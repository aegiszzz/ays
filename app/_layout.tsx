import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '../hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useEffect } from 'react';
import InstallPrompt from '../components/InstallPrompt';
import { SafeAreaView } from 'react-native-safe-area-context';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #2a2a30; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #3a3a42; }
    * { scrollbar-width: thin; scrollbar-color: #2a2a30 transparent; }
  `;
  document.head.appendChild(style);
}

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
    const publicRoutes = ['verify-email'];
    const isAllowedRoute = allowedAuthenticatedRoutes.includes(segments[0] as string);
    const isPublicRoute = publicRoutes.includes(segments[0] as string);
    const onIndexPage = !segments[0] || (segments[0] as string) === 'index';

    if (!session && (inAuthGroup || inAdminGroup || isAllowedRoute) && !isPublicRoute) {
      router.replace('/');
    } else if (session && onIndexPage) {
      router.replace('/(tabs)/');
    }
  }, [session, segments, loading]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FDFDFD" />
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
        <Stack.Screen name="verify-email" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  return (
    <LanguageProvider>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="light" />
      </AuthProvider>
    </LanguageProvider>
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
