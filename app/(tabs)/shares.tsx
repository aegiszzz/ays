import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Users, MessageCircle, Plus, X } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl } from '@/lib/ipfs';
import { useResponsive } from '@/lib/responsive';
import DesktopSidebar from '@/components/DesktopSidebar';

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  other_user?: {
    id: string;
    username: string;
  };
  group?: {
    id: string;
    name: string;
  };
  last_message?: {
    ipfs_cid: string | null;
    message_text: string | null;
    created_at: string;
  };
  unread_count?: number;
}

export default function SharesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { isDesktop } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showOptionsModal, setShowOptionsModal] = useState(false);

  useEffect(() => {
    if (user) {
      fetchConversations();

      const directMessagesChannel = supabase
        .channel('direct_messages_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'direct_messages'
          },
          () => {
            fetchConversations();
          }
        )
        .subscribe();

      const groupMessagesChannel = supabase
        .channel('group_messages_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'group_messages'
          },
          () => {
            fetchConversations();
          }
        )
        .subscribe();

      const conversationReadsChannel = supabase
        .channel('conversation_reads_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversation_reads',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchConversations();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(directMessagesChannel);
        supabase.removeChannel(groupMessagesChannel);
        supabase.removeChannel(conversationReadsChannel);
      };
    }
  }, [user]);

  const fetchConversations = async () => {
    try {
      const [directMessages, groupsData, readStatus] = await Promise.all([
        supabase
          .from('direct_messages')
          .select('id, sender_id, receiver_id, ipfs_cid, caption, created_at')
          .or(`sender_id.eq.${user?.id},receiver_id.eq.${user?.id}`)
          .order('created_at', { ascending: false }),
        supabase
          .from('group_members')
          .select(`
            group_id,
            groups!inner(id, name)
          `)
          .eq('user_id', user?.id),
        supabase
          .from('conversation_reads')
          .select('*')
          .eq('user_id', user?.id)
      ]);

      const conversationsMap = new Map<string, Conversation>();
      const readStatusMap = new Map<string, string>();

      for (const read of readStatus.data || []) {
        const key = `${read.conversation_type}-${read.conversation_id}`;
        readStatusMap.set(key, read.last_read_at);
      }

      const directConvMap = new Map<string, any>();

      for (const message of directMessages.data || []) {
        const otherUserId = message.sender_id === user?.id ? message.receiver_id : message.sender_id;

        if (!directConvMap.has(otherUserId)) {
          directConvMap.set(otherUserId, {
            otherUserId,
            lastMessage: message,
            messages: [message]
          });
        } else {
          directConvMap.get(otherUserId).messages.push(message);
        }
      }

      for (const [otherUserId, convData] of directConvMap.entries()) {
        const { data: userData } = await supabase
          .from('users')
          .select('id, username')
          .eq('id', otherUserId)
          .maybeSingle();

        const lastReadKey = `direct-${otherUserId}`;
        const lastReadAt = readStatusMap.get(lastReadKey);

        let unreadCount = 0;
        if (lastReadAt) {
          unreadCount = convData.messages.filter((msg: any) =>
            msg.sender_id !== user?.id && new Date(msg.created_at) > new Date(lastReadAt)
          ).length;
        } else {
          unreadCount = convData.messages.filter((msg: any) => msg.sender_id !== user?.id).length;
        }

        conversationsMap.set(otherUserId, {
          id: otherUserId,
          type: 'direct',
          other_user: userData || undefined,
          last_message: convData.lastMessage.ipfs_cid || convData.lastMessage.caption ? {
            ipfs_cid: convData.lastMessage.ipfs_cid,
            message_text: convData.lastMessage.caption,
            created_at: convData.lastMessage.created_at
          } : undefined,
          unread_count: unreadCount
        });
      }

      for (const groupMember of groupsData.data || []) {
        const group = (groupMember as any).groups;

        const { data: allMessages } = await supabase
          .from('group_messages')
          .select('id, sender_id, ipfs_cid, message_text, created_at')
          .eq('group_id', group.id)
          .order('created_at', { ascending: false });

        const lastMessage = allMessages?.[0];

        const lastReadKey = `group-${group.id}`;
        const lastReadAt = readStatusMap.get(lastReadKey);

        let unreadCount = 0;
        if (lastReadAt && allMessages) {
          unreadCount = allMessages.filter((msg) =>
            msg.sender_id !== user?.id && new Date(msg.created_at) > new Date(lastReadAt)
          ).length;
        } else if (allMessages) {
          unreadCount = allMessages.filter((msg) => msg.sender_id !== user?.id).length;
        }

        conversationsMap.set(`group-${group.id}`, {
          id: `group-${group.id}`,
          type: 'group',
          group: {
            id: group.id,
            name: group.name
          },
          last_message: lastMessage ? {
            ipfs_cid: lastMessage.ipfs_cid,
            message_text: lastMessage.message_text,
            created_at: lastMessage.created_at
          } : undefined,
          unread_count: unreadCount
        });
      }

      const finalConversations = Array.from(conversationsMap.values()).sort((a, b) => {
        const aTime = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0;
        const bTime = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0;
        return bTime - aTime;
      });

      setConversations(finalConversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const openConversation = (conversation: Conversation) => {
    if (conversation.type === 'direct' && conversation.other_user) {
      router.push(`/conversation?userId=${conversation.other_user.id}&username=${conversation.other_user.username}`);
    } else if (conversation.type === 'group' && conversation.group) {
      router.push(`/group-conversation?groupId=${conversation.group.id}&groupName=${conversation.group.name}`);
    }
  };

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (conversations.length === 0) {
    return (
    <>
      <DesktopSidebar />
      <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Shares</Text>
        <Text style={styles.subtitle}>Choose how to share your media</Text>
      </View>

      <View style={styles.optionsContainer}>
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => router.push('/group-share')}>
          <View style={styles.iconContainer}>
            <Users size={48} color="#000" />
          </View>
          <Text style={styles.optionTitle}>Group Share</Text>
          <Text style={styles.optionDescription}>
            Share with all your friends at once
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => router.push('/direct-message')}>
          <View style={styles.iconContainer}>
            <MessageCircle size={48} color="#000" />
          </View>
          <Text style={styles.optionTitle}>Direct Message</Text>
          <Text style={styles.optionDescription}>
            Send privately to a specific person
          </Text>
        </TouchableOpacity>
      </View>
      </View>
    </>
    );
  }

  return (
    <>
      <DesktopSidebar />
      <View style={[styles.container, isDesktop && styles.containerDesktop]}>
      <View style={[styles.header, isDesktop && styles.headerDesktop]}>
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowOptionsModal(true)}
        >
          <Plus size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.conversationItem}
            onPress={() => openConversation(item)}
          >
            <View style={styles.conversationAvatar}>
              {item.type === 'group' ? (
                <Users size={24} color="#fff" />
              ) : (
                <Text style={styles.conversationAvatarText}>
                  {item.other_user?.username.charAt(0).toUpperCase() || '?'}
                </Text>
              )}
            </View>
            <View style={styles.conversationContent}>
              <View style={styles.conversationHeader}>
                <Text style={styles.conversationName}>
                  {item.type === 'group' ? item.group?.name : item.other_user?.username || 'Unknown User'}
                </Text>
                {item.unread_count && item.unread_count > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.unread_count}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.conversationPreview}>
                {item.last_message
                  ? item.last_message.message_text || 'Sent a photo'
                  : 'No messages yet'}
              </Text>
            </View>
            {item.last_message?.ipfs_cid && (
              <Image
                source={{ uri: getIPFSGatewayUrl(item.last_message.ipfs_cid) }}
                style={styles.conversationThumbnail}
              />
            )}
          </TouchableOpacity>
        )}
      />

      <Modal
        visible={showOptionsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowOptionsModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Share</Text>
            <TouchableOpacity onPress={() => setShowOptionsModal(false)}>
              <X size={24} color="#000" />
            </TouchableOpacity>
          </View>

          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => {
                setShowOptionsModal(false);
                router.push('/group-share');
              }}
            >
              <View style={styles.iconContainer}>
                <Users size={48} color="#000" />
              </View>
              <Text style={styles.optionTitle}>Group Share</Text>
              <Text style={styles.optionDescription}>
                Share with all your friends at once
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => {
                setShowOptionsModal(false);
                router.push('/direct-message');
              }}
            >
              <View style={styles.iconContainer}>
                <MessageCircle size={48} color="#000" />
              </View>
              <Text style={styles.optionTitle}>Direct Message</Text>
              <Text style={styles.optionDescription}>
                Send privately to a specific person
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  containerDesktop: {
    marginLeft: 220,
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerDesktop: {
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  conversationAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  conversationAvatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  unreadBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  conversationPreview: {
    fontSize: 14,
    color: '#666',
  },
  conversationThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  optionsContainer: {
    padding: 20,
    gap: 16,
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  optionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  optionDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
