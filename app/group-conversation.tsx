import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl } from '@/lib/ipfs';
import { uploadToIPFS } from '@/lib/ipfs';
import { ArrowLeft, Send, Image as ImageIcon, Users, Video as VideoIcon, Download, X, Settings } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { VideoPlayer } from '@/components/VideoPlayer';

interface GroupMessage {
  id: string;
  sender_id: string;
  message_text: string | null;
  media_type: string | null;
  ipfs_cid: string | null;
  created_at: string;
  sender?: {
    username: string;
    avatar_url: string | null;
  };
}

export default function GroupConversationScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { groupId, groupName } = useLocalSearchParams();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [viewerMedia, setViewerMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);

  useEffect(() => {
    if (user && groupId) {
      fetchMessages();
      return subscribeToMessages();
    }
  }, [user, groupId]);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('group_messages')
        .select(`
          id,
          sender_id,
          message_text,
          media_type,
          ipfs_cid,
          created_at,
          users!group_messages_sender_id_fkey(username, avatar_url)
        `)
        .eq('group_id', groupId as string)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const formattedMessages = data.map((msg: any) => ({
        id: msg.id,
        sender_id: msg.sender_id,
        message_text: msg.message_text,
        media_type: msg.media_type,
        ipfs_cid: msg.ipfs_cid,
        created_at: msg.created_at,
        sender: msg.users,
      }));

      setMessages(formattedMessages);

      if (user?.id) {
        await supabase
          .from('conversation_reads')
          .upsert({
            user_id: user.id,
            conversation_type: 'group',
            conversation_id: groupId as string,
            last_read_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,conversation_type,conversation_id'
          });
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel(`group-messages-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        async (payload) => {
          const { data: senderData } = await supabase
            .from('users')
            .select('username, avatar_url')
            .eq('id', payload.new.sender_id)
            .maybeSingle();

          const newMessage: GroupMessage = {
            id: payload.new.id,
            sender_id: payload.new.sender_id,
            message_text: payload.new.message_text,
            media_type: payload.new.media_type,
            ipfs_cid: payload.new.ipfs_cid,
            created_at: payload.new.created_at,
            sender: senderData || undefined,
          };

          setMessages((prev) => [...prev, newMessage]);
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleSendText = async () => {
    if (!messageText.trim() || !user) return;

    setSending(true);
    try {
      const { error } = await supabase.from('group_messages').insert({
        group_id: groupId as string,
        sender_id: user.id,
        message_text: messageText.trim(),
      });

      if (error) throw error;

      await supabase
        .from('conversation_reads')
        .upsert({
          user_id: user.id,
          conversation_type: 'group',
          conversation_id: groupId as string,
          last_read_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,conversation_type,conversation_id'
        });

      setMessageText('');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleSendMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: true,
        quality: 1,
      });

      if (result.canceled || !result.assets[0]) return;

      setSending(true);

      const asset = result.assets[0];
      const mediaType = asset.type === 'video' ? 'video' : 'image';
      const cid = await uploadToIPFS(asset.uri);

      const { error } = await supabase.from('group_messages').insert({
        group_id: groupId as string,
        sender_id: user!.id,
        media_type: mediaType,
        ipfs_cid: cid,
      });

      if (error) throw error;

      await supabase
        .from('conversation_reads')
        .upsert({
          user_id: user!.id,
          conversation_type: 'group',
          conversation_id: groupId as string,
          last_read_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,conversation_type,conversation_id'
        });
    } catch (error) {
      console.error('Error sending media:', error);
      Alert.alert('Error', 'Failed to send media');
    } finally {
      setSending(false);
    }
  };

  const handleDownload = async (url: string) => {
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'media';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow media library access to save files.');
        return;
      }
      const filename = url.split('/').pop() || 'media';
      const fileUri = FileSystem.documentDirectory + filename;
      const { uri } = await FileSystem.downloadAsync(url, fileUri);
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Media saved to gallery');
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to download media');
    }
  };

  const renderMessage = ({ item }: { item: GroupMessage }) => {
    const isOwnMessage = item.sender_id === user?.id;
    const imageUrl = item.ipfs_cid ? getIPFSGatewayUrl(item.ipfs_cid) : null;
    const isVideo = item.media_type === 'video';

    return (
      <View style={[styles.messageContainer, isOwnMessage && styles.ownMessage]}>
        {!isOwnMessage && (
          <View style={styles.senderInfo}>
            {item.sender?.avatar_url ? (
              <Image
                source={{
                  uri: `https://gateway.pinata.cloud/ipfs/${item.sender.avatar_url}`,
                }}
                style={styles.senderAvatar}
              />
            ) : (
              <View style={styles.senderAvatarPlaceholder}>
                <Text style={styles.senderAvatarText}>
                  {item.sender?.username?.charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
            )}
            <Text style={styles.senderName}>{item.sender?.username || 'Unknown'}</Text>
          </View>
        )}
        <View style={[styles.messageBubble, isOwnMessage && styles.ownMessageBubble]}>
          {imageUrl && (
            <View style={styles.mediaContainer}>
              <View style={styles.mediaWrapper}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setViewerMedia({ url: imageUrl, type: isVideo ? 'video' : 'image' })}
                >
                  {isVideo ? (
                    <VideoPlayer uri={imageUrl} style={styles.messageImage} />
                  ) : (
                    <Image source={{ uri: imageUrl }} style={styles.messageImage} resizeMode="cover" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.downloadButton}
                  onPress={() => handleDownload(imageUrl)}
                >
                  <Download size={13} color="#FDFDFD" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          {item.message_text && (
            <Text style={[styles.messageText, isOwnMessage && styles.ownMessageText]}>
              {item.message_text}
            </Text>
          )}
        </View>
      </View>
    );
  };

  if (!user) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#FDFDFD" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerContent}
          onPress={() => router.push({ pathname: '/group-settings', params: { groupId, groupName } })}
        >
          <View style={styles.groupIcon}>
            <Users size={20} color="#000" />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{groupName}</Text>
            <Text style={styles.headerSubtitle}>Tap for settings</Text>
          </View>
          <Settings size={18} color="#888" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FDFDFD" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.mediaButton} onPress={handleSendMedia} disabled={sending}>
          <ImageIcon size={24} color="#8e8e93" />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Type a message..."
          multiline
          maxLength={1000}
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!messageText.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSendText}
          disabled={!messageText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Send size={20} color="#000" />
          )}
        </TouchableOpacity>
      </View>

      {/* Full-screen media viewer */}
      <Modal
        visible={viewerMedia !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerMedia(null)}
      >
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerMedia(null)}>
            <X size={24} color="#FDFDFD" />
          </TouchableOpacity>
          {viewerMedia && (
            <TouchableOpacity
              style={styles.viewerDownload}
              onPress={() => handleDownload(viewerMedia.url)}
            >
              <Download size={22} color="#FDFDFD" />
            </TouchableOpacity>
          )}
          {viewerMedia && (
            viewerMedia.type === 'video' ? (
              <VideoPlayer uri={viewerMedia.url} style={styles.viewerMedia} />
            ) : (
              <Image
                source={{ uri: viewerMedia.url }}
                style={styles.viewerMedia}
                resizeMode="contain"
              />
            )
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FDFDFD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FDFDFD',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    padding: 16,
  },
  messageContainer: {
    marginBottom: 16,
    maxWidth: '80%',
  },
  ownMessage: {
    alignSelf: 'flex-end',
  },
  senderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  senderAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  senderAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FDFDFD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  senderAvatarText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
  },
  senderName: {
    fontSize: 12,
    color: '#8e8e93',
    fontWeight: '500',
  },
  messageBubble: {
    backgroundColor: '#2c2c2e',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  ownMessageBubble: {
    backgroundColor: '#FDFDFD',
  },
  mediaContainer: {
    marginBottom: 8,
  },
  mediaWrapper: {
    position: 'relative',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  downloadButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageText: {
    fontSize: 16,
    color: '#FDFDFD',
  },
  ownMessageText: {
    color: '#000',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    backgroundColor: '#1c1c1e',
    borderTopWidth: 1,
    borderTopColor: '#2c2c2e',
  },
  mediaButton: {
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
    color: '#FDFDFD',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FDFDFD',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 56,
    left: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  viewerDownload: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  viewerMedia: {
    width: '100%',
    height: '80%',
  },
});
