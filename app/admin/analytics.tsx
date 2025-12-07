import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, TrendingUp, Users, Image as ImageIcon, Heart, MessageCircle, Home } from 'lucide-react-native';

interface Analytics {
  totalUsers: number;
  newUsersToday: number;
  totalPosts: number;
  publicPosts: number;
  privatePosts: number;
  totalLikes: number;
  totalComments: number;
  totalMessages: number;
  totalGroups: number;
  usersWithWallets: number;
}

export default function AnalyticsDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics>({
    totalUsers: 0,
    newUsersToday: 0,
    totalPosts: 0,
    publicPosts: 0,
    privatePosts: 0,
    totalLikes: 0,
    totalComments: 0,
    totalMessages: 0,
    totalGroups: 0,
    usersWithWallets: 0,
  });

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        usersResult,
        newUsersResult,
        postsResult,
        publicPostsResult,
        privatePostsResult,
        likesResult,
        commentsResult,
        messagesResult,
        groupsResult,
        walletsResult,
      ] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
        supabase.from('media_shares').select('id', { count: 'exact', head: true }),
        supabase.from('media_shares').select('id', { count: 'exact', head: true }).eq('is_public', true),
        supabase.from('media_shares').select('id', { count: 'exact', head: true }).eq('is_public', false),
        supabase.from('likes').select('id', { count: 'exact', head: true }),
        supabase.from('comments').select('id', { count: 'exact', head: true }),
        supabase.from('direct_messages').select('id', { count: 'exact', head: true }),
        supabase.from('groups').select('id', { count: 'exact', head: true }),
        supabase.from('users').select('id', { count: 'exact', head: true }).not('wallet_address', 'is', null),
      ]);

      setAnalytics({
        totalUsers: usersResult.count || 0,
        newUsersToday: newUsersResult.count || 0,
        totalPosts: postsResult.count || 0,
        publicPosts: publicPostsResult.count || 0,
        privatePosts: privatePostsResult.count || 0,
        totalLikes: likesResult.count || 0,
        totalComments: commentsResult.count || 0,
        totalMessages: messagesResult.count || 0,
        totalGroups: groupsResult.count || 0,
        usersWithWallets: walletsResult.count || 0,
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#000" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Analytics</Text>
            <Text style={styles.subtitle}>Platform Statistics</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => router.push('/')}
        >
          <Home size={20} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Statistics</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Users size={24} color="#007AFF" />
              <Text style={styles.statNumber}>{analytics.totalUsers}</Text>
              <Text style={styles.statLabel}>Total Users</Text>
            </View>
            <View style={styles.statCard}>
              <TrendingUp size={24} color="#34C759" />
              <Text style={styles.statNumber}>{analytics.newUsersToday}</Text>
              <Text style={styles.statLabel}>New Today</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>💰</Text>
              <Text style={styles.statNumber}>{analytics.usersWithWallets}</Text>
              <Text style={styles.statLabel}>With Wallets</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Content Statistics</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <ImageIcon size={24} color="#FF9500" />
              <Text style={styles.statNumber}>{analytics.totalPosts}</Text>
              <Text style={styles.statLabel}>Total Posts</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>🌍</Text>
              <Text style={styles.statNumber}>{analytics.publicPosts}</Text>
              <Text style={styles.statLabel}>Public Posts</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>🔒</Text>
              <Text style={styles.statNumber}>{analytics.privatePosts}</Text>
              <Text style={styles.statLabel}>Private Posts</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Engagement Statistics</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Heart size={24} color="#FF3B30" />
              <Text style={styles.statNumber}>{analytics.totalLikes}</Text>
              <Text style={styles.statLabel}>Total Likes</Text>
            </View>
            <View style={styles.statCard}>
              <MessageCircle size={24} color="#5856D6" />
              <Text style={styles.statNumber}>{analytics.totalComments}</Text>
              <Text style={styles.statLabel}>Comments</Text>
            </View>
            <View style={styles.statCard}>
              <MessageCircle size={24} color="#00C7BE" />
              <Text style={styles.statNumber}>{analytics.totalMessages}</Text>
              <Text style={styles.statLabel}>Messages</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Community Statistics</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Users size={24} color="#AF52DE" />
              <Text style={styles.statNumber}>{analytics.totalGroups}</Text>
              <Text style={styles.statLabel}>Total Groups</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>📊</Text>
              <Text style={styles.statNumber}>
                {analytics.totalPosts > 0
                  ? (analytics.totalLikes / analytics.totalPosts).toFixed(1)
                  : '0'}
              </Text>
              <Text style={styles.statLabel}>Avg Likes/Post</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>💬</Text>
              <Text style={styles.statNumber}>
                {analytics.totalPosts > 0
                  ? (analytics.totalComments / analytics.totalPosts).toFixed(1)
                  : '0'}
              </Text>
              <Text style={styles.statLabel}>Avg Comments/Post</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  homeButton: {
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flex: 1,
    minWidth: 100,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statIcon: {
    fontSize: 24,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});
