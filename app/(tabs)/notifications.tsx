import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Heart, MessageCircle, UserPlus, Users, MessageSquare } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import ResponsiveContainer from '@/components/ResponsiveContainer';

interface Notification {
  id: string;
  user_id: string;
  type: 'friend_add' | 'like' | 'comment' | 'message' | 'group_invite';
  related_user_id: string | null;
  related_item_id: string | null;
  content: string | null;
  read: boolean;
  created_at: string;
  related_user?: {
    username: string;
  };
}

export default function NotificationsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isDesktop = width > 768;

  useEffect(() => {
    if (user) {
      fetchNotifications();
      subscribeToNotifications();
    }
  }, [user]);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          related_user:auth.users!notifications_related_user_id_fkey(username)
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedData = data?.map(notif => ({
        ...notif,
        related_user: notif.related_user ? { username: notif.related_user.username } : undefined
      })) || [];

      setNotifications(formattedData);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const subscribeToNotifications = () => {
    const channel = supabase
      .channel('notifications_channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user?.id}`,
        },
        async (payload) => {
          const { data: userData } = await supabase
            .from('users')
            .select('username')
            .eq('id', payload.new.related_user_id)
            .single();

          const newNotification = {
            ...payload.new,
            related_user: userData ? { username: userData.username } : undefined
          } as Notification;

          setNotifications(prev => [newNotification, ...prev]);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(notif =>
          notif.id === notificationId ? { ...notif, read: true } : notif
        )
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user?.id)
        .eq('read', false);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(notif => ({ ...notif, read: true }))
      );
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleNotificationPress = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    switch (notification.type) {
      case 'friend_add':
        if (notification.related_user_id) {
          router.push(`/profile?userId=${notification.related_user_id}`);
        }
        break;
      case 'like':
      case 'comment':
        break;
      case 'message':
        if (notification.related_user_id) {
          router.push(`/conversation?userId=${notification.related_user_id}`);
        }
        break;
      case 'group_invite':
        if (notification.related_item_id) {
          router.push(`/group-conversation?groupId=${notification.related_item_id}`);
        }
        break;
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'friend_add':
        return <UserPlus size={24} color="#3b82f6" />;
      case 'like':
        return <Heart size={24} color="#ef4444" />;
      case 'comment':
        return <MessageCircle size={24} color="#22c55e" />;
      case 'message':
        return <MessageSquare size={24} color="#8b5cf6" />;
      case 'group_invite':
        return <Users size={24} color="#f59e0b" />;
      default:
        return null;
    }
  };

  const getNotificationText = (notification: Notification) => {
    const username = notification.related_user?.username || 'Someone';

    switch (notification.type) {
      case 'friend_add':
        return `${username} started following you`;
      case 'like':
        return `${username} liked your post`;
      case 'comment':
        return `${username} commented: ${notification.content || ''}`;
      case 'message':
        return `${username} sent you a message`;
      case 'group_invite':
        return `${username} added you to a group`;
      default:
        return 'New notification';
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        !item.read && styles.unreadNotification,
        isDesktop && styles.notificationItemDesktop
      ]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={styles.iconContainer}>
        {getNotificationIcon(item.type)}
      </View>
      <View style={styles.notificationContent}>
        <Text style={styles.notificationText}>
          {getNotificationText(item)}
        </Text>
        <Text style={styles.timeText}>
          {getTimeAgo(item.created_at)}
        </Text>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <ResponsiveContainer>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllAsRead}>
              <Text style={styles.markAllButton}>Mark all as read</Text>
            </TouchableOpacity>
          )}
        </View>

        {notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No notifications yet</Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            renderItem={renderNotification}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchNotifications();
                }}
              />
            }
            contentContainerStyle={isDesktop && styles.listContentDesktop}
          />
        )}
      </View>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  markAllButton: {
    color: '#3b82f6',
    fontSize: 14,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    backgroundColor: '#000',
  },
  notificationItemDesktop: {
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
  },
  unreadNotification: {
    backgroundColor: '#0f172a',
  },
  iconContainer: {
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationText: {
    color: '#fff',
    fontSize: 15,
    marginBottom: 4,
  },
  timeText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 16,
    textAlign: 'center',
  },
  listContentDesktop: {
    paddingHorizontal: 16,
  },
});
