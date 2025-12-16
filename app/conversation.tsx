import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  Image,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl, uploadToIPFS } from '@/lib/ipfs';
import { ArrowLeft, Send, Camera, Image as ImageIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  ipfs_cid: string;
  media_type: string;
  caption: string | null;
  read: boolean;
  created_at: string;
}

export default function ConversationScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { userId, username } = useLocalSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const flatListRef = useRef<FlatList>(null);

  const fetchMessages = useCallback(async () => {
    if (!user?.id || !userId) return;

    try {
      const { data, error } = await supabase
        .from('direct_messages')
        .select('*')
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`
        )
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(data || []);

      await supabase
        .from('conversation_reads')
        .upsert({
          user_id: user.id,
          conversation_type: 'direct',
          conversation_id: userId,
          last_read_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,conversation_type,conversation_id'
        });

      const unreadMessages = (data || []).filter(
        msg => msg.receiver_id === user.id && !msg.read
      );

      if (unreadMessages.length > 0) {
        await supabase
          .from('direct_messages')
          .update({ read: true })
          .in(
            'id',
            unreadMessages.map(m => m.id)
          );
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, userId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!user || !userId) return;

    const subscription = supabase
      .channel(`messages-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
        },
        (payload) => {
          const newMessage = payload.new as Message;
          if (
            (newMessage.sender_id === userId && newMessage.receiver_id === user.id) ||
            (newMessage.sender_id === user.id && newMessage.receiver_id === userId)
          ) {
            setMessages((prev) => [...prev, newMessage]);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id, userId]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedMedia(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Camera permission is required');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedMedia(result.assets[0].uri);
      setMediaType('image');
    }
  };

  const handleSend = async () => {
    if ((!selectedMedia && !caption.trim()) || !user || !userId) return;

    setSending(true);
    try {
      let cid = '';
      if (selectedMedia) {
        cid = await uploadToIPFS(selectedMedia);
      }

      const { error } = await supabase.from('direct_messages').insert({
        sender_id: user.id,
        receiver_id: userId as string,
        ipfs_cid: cid || null,
        media_type: selectedMedia ? mediaType : 'text',
        caption: caption.trim() || null,
        read: false,
      });

      if (error) throw error;

      await supabase
        .from('conversation_reads')
        .upsert({
          user_id: user.id,
          conversation_type: 'direct',
          conversation_id: userId as string,
          last_read_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,conversation_type,conversation_id'
        });

      setSelectedMedia(null);
      setCaption('');
      setMediaType('image');
    } catch (error: any) {
      console.error('Send error:', error);
      alert(`Failed to send: ${error?.message || 'Unknown error'}`);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.sender_id === user?.id;

    return (
      <View style={[styles.messageContainer, isMine ? styles.myMessage : styles.theirMessage]}>
        {item.ipfs_cid && (
          <Image
            source={{ uri: getIPFSGatewayUrl(item.ipfs_cid) }}
            style={styles.messageImage}
            resizeMode="cover"
          />
        )}
        {item.caption && (
          <Text style={[styles.caption, isMine ? styles.myCaption : styles.theirCaption]}>
            {item.caption}
          </Text>
        )}
        <Text style={styles.timestamp}>
          {new Date(item.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    );
  };

  if (!user) {
    return null;
  }

  return (
    <View style={styles.container}>
        <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>{(username as string)?.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.username}>@{username}</Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>Send a photo or video to start the conversation</Text>
            </View>
          }
        />
      )}

      <View style={styles.inputContainer}>
        {selectedMedia && (
          <View style={styles.previewContainer}>
            <Image source={{ uri: selectedMedia }} style={styles.preview} />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => setSelectedMedia(null)}
            >
              <Text style={styles.removeText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputRow}>
          <TouchableOpacity onPress={takePhoto} style={styles.iconButton}>
            <Camera size={24} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={pickImage} style={styles.iconButton}>
            <ImageIcon size={24} color="#ffffff" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Send message..."
            value={caption}
            onChangeText={setCaption}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, ((!selectedMedia && !caption.trim()) || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={(!selectedMedia && !caption.trim()) || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Send size={20} color="#000" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#1c1c1e',
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
  },
  backButton: {
    marginRight: 12,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  username: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    padding: 16,
  },
  messageContainer: {
    maxWidth: '80%',
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 40,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#ffffff',
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#2c2c2e',
  },
  messageImage: {
    width: 250,
    height: 250,
  },
  caption: {
    padding: 12,
    fontSize: 15,
    lineHeight: 20,
  },
  myCaption: {
    color: '#000',
  },
  theirCaption: {
    color: '#ffffff',
  },
  timestamp: {
    fontSize: 11,
    color: '#8e8e93',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#8e8e93',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8e8e93',
    textAlign: 'center',
  },
  inputContainer: {
    backgroundColor: '#1c1c1e',
    borderTopWidth: 1,
    borderTopColor: '#2c2c2e',
    padding: 12,
  },
  previewContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  preview: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
    marginRight: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#2c2c2e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    maxHeight: 100,
    color: '#ffffff',
  },
  sendButton: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#2c2c2e',
  },
});
