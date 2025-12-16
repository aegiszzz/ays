import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, MessageCircle, Plus } from 'lucide-react-native';

interface Conversation {
  id: string;
  other_user_id: string;
  other_username: string;
  last_message: string | null;
  last_message_at: string;
  unread_count: number;
}

export default function DirectMessageScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchConversations();

      const subscription = supabase
        .channel('direct_messages_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'direct_messages',
            filter: `sender_id=eq.${user.id},recipient_id=eq.${user.id}`,
          },
          () => {
            fetchConversations();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user]);

  const fetchConversations = async () => {
    if (!user) return;

    try {
      const { data: messages, error } = await supabase
        .from('direct_messages')
        .select(`
          id,
          sender_id,
          recipient_id,
          content,
          created_at,
          sender:users!sender_id(id, username),
          recipient:users!recipient_id(id, username)
        `)
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const conversationMap = new Map<string, Conversation>();

      messages?.forEach((msg: any) => {
        const isOutgoing = msg.sender_id === user.id;
        const otherId = isOutgoing ? msg.recipient_id : msg.sender_id;
        const otherUsername = isOutgoing ? msg.recipient.username : msg.sender.username;

        if (!conversationMap.has(otherId)) {
          conversationMap.set(otherId, {
            id: otherId,
            other_user_id: otherId,
            other_username: otherUsername,
            last_message: msg.content,
            last_message_at: msg.created_at,
            unread_count: 0,
          });
        }
      });

      setConversations(Array.from(conversationMap.values()));
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConversation = (conv: Conversation) => {
    router.push({
      pathname: '/conversation',
      params: { userId: conv.other_user_id, username: conv.other_username },
    });
  };

  const handleNewMessage = () => {
    router.push('/send-message');
  };

  const renderConversationItem = ({ item }: { item: Conversation }) => (
    <TouchableOpacity style={styles.conversationCard} onPress={() => handleSelectConversation(item)}>
      <View style={styles.avatarContainer}>
        <Text style={styles.avatarText}>{item.other_username.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.conversationInfo}>
        <View style={styles.conversationHeader}>
          <Text style={styles.username}>@{item.other_username}</Text>
          {item.last_message_at && (
            <Text style={styles.timestamp}>
              {new Date(item.last_message_at).toLocaleDateString()}
            </Text>
          )}
        </View>
        {item.last_message && (
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.last_message}
          </Text>
        )}
      </View>
      {item.unread_count > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>{item.unread_count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  if (!user) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Messages</Text>
        </View>
        <TouchableOpacity onPress={handleNewMessage} style={styles.newMessageButton}>
          <Plus size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversationItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MessageCircle size={48} color="#ccc" />
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>Tap + to start a new conversation</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  newMessageButton: {
    padding: 8,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 0,
  },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  conversationInfo: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
  },
  unreadBadge: {
    backgroundColor: '#000',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 8,
  },
});
