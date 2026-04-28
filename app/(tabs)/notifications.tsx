import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Heart, MessageCircle, UserPlus, Users, MessageSquare } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';

interface Notification {
  id: string;
  user_id: string;
  type: 'friend_add' | 'follow' | 'like' | 'comment' | 'message' | 'group_invite';
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
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const userIds = [...new Set(data?.map(n => n.related_user_id).filter(Boolean) || [])];

      const { data: usersData } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);

      const usersMap = new Map(usersData?.map(u => [u.id, u]) || []);

      const formattedData = data?.map(notif => ({
        ...notif,
        related_user: notif.related_user_id ? usersMap.get(notif.related_user_id) : undefined
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
      case 'follow':
        if (notification.related_user_id) {
          router.push(`/user-profile?userId=${notification.related_user_id}`);
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
      case 'follow':
        return <UserPlus size={22} color="#00A0DC" />;
      case 'like':
        return <Heart size={22} color="#ef4444" fill="#ef4444" />;
      case 'comment':
        return <MessageCircle size={22} color="#10b981" />;
      case 'message':
        return <MessageSquare size={22} color="#8b5cf6" />;
      case 'group_invite':
        return <Users size={22} color="#f59e0b" />;
      default:
        return null;
    }
  };

  const getIconBackgroundColor = (type: string) => {
    switch (type) {
      case 'friend_add':
      case 'follow':
        return '#eff6ff';
      case 'like':
        return '#fee2e2';
      case 'comment':
        return '#d1fae5';
      case 'message':
        return '#f3e8ff';
      case 'group_invite':
        return '#fef3c7';
      default:
        return '#f3f4f6';
    }
  };

  const getNotificationText = (notification: Notification) => {
    const username = notification.related_user?.username || 'Someone';

    switch (notification.type) {
      case 'friend_add':
      case 'follow':
        return `${username} ${t.notifications.startedFollowing}`;
      case 'like':
        return `${username} ${t.notifications.likedPost}`;
      case 'comment':
        return `${username} ${t.notifications.commented}: ${notification.content || ''}`;
      case 'message':
        return `${username} ${t.notifications.sentMessage}`;
      case 'group_invite':
        return `${username} ${t.notifications.addedToGroup}`;
      default:
        return t.notifications.newNotification;
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return t.notifications.justNow;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${t.notifications.ago}`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${t.notifications.ago}`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ${t.notifications.ago}`;
    return date.toLocaleDateString();
  };

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        !item.read && styles.unreadNotification
      ]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={[
        styles.iconContainer,
        { backgroundColor: getIconBackgroundColor(item.type) }
      ]}>
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
        <ActivityIndicator size="large" color="#00A0DC" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <Text style={styles.title}>{t.notifications.title}</Text>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllAsRead}>
              <Text style={styles.markAllButton}>{t.notifications.markAllRead}</Text>
            </TouchableOpacity>
          )}
        </View>

        {notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t.notifications.noNotifications}</Text>
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
                tintColor="#00A0DC"
              />
            }
            contentContainerStyle={{ paddingTop: 16, paddingBottom: Platform.OS === 'web' ? 70 : 90 }}
          />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0F',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D0D0F',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#0D0D0F',
    borderBottomWidth: 1,
    borderBottomColor: '#252528',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FDFDFD',
  },
  markAllButton: {
    color: '#00A0DC',
    fontSize: 15,
    fontWeight: '600',
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 12,
    marginVertical: 6,
    backgroundColor: '#141417',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  unreadNotification: {
    backgroundColor: '#1a2332',
    borderLeftWidth: 3,
    borderLeftColor: '#00A0DC',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  notificationContent: {
    flex: 1,
  },
  notificationText: {
    color: '#FDFDFD',
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 4,
    fontWeight: '500',
  },
  timeText: {
    color: '#7A7A7E',
    fontSize: 13,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00A0DC',
    marginLeft: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    color: '#7A7A7E',
    fontSize: 16,
    textAlign: 'center',
  },
});
