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
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl, uploadToIPFS } from '@/lib/ipfs';
import { ArrowLeft, Send, Camera, Image as ImageIcon, Download, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { VideoPlayer } from '@/components/VideoPlayer';
import { useLanguage } from '@/contexts/LanguageContext';

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
  const { t } = useLanguage();
  const { userId, username } = useLocalSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [viewerMedia, setViewerMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
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
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
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

      const captionValue = caption.trim() || null;
      const mediaTypeValue = selectedMedia ? mediaType : 'text';

      const { data: insertedMessage, error } = await supabase.from('direct_messages').insert({
        sender_id: user.id,
        receiver_id: userId as string,
        ipfs_cid: cid || '',
        media_type: mediaTypeValue,
        caption: captionValue,
        read: false,
      }).select().single();

      if (error) throw error;

      const messageToAdd: Message = insertedMessage ?? {
        id: `temp-${Date.now()}`,
        sender_id: user.id,
        receiver_id: userId as string,
        ipfs_cid: cid || '',
        media_type: mediaTypeValue,
        caption: captionValue,
        read: false,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => {
        if (insertedMessage && prev.some((m) => m.id === insertedMessage.id)) return prev;
        return [...prev, messageToAdd];
      });

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

  const handleDownload = async (url: string) => {
    if (Platform.OS === 'web') {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const ext = url.split('?')[0].split('.').pop() || 'jpg';
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `media.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch {
        window.open(url, '_blank');
      }
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

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.sender_id === user?.id;
    const mediaUrl = item.ipfs_cid ? getIPFSGatewayUrl(item.ipfs_cid) : null;
    const isVideo = item.media_type === 'video';

    const timeStr = new Date(item.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <View style={[styles.messageContainer, isMine ? styles.myMessage : styles.theirMessage]}>
        {mediaUrl && (
          <View style={styles.mediaWrapper}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setViewerMedia({ url: mediaUrl, type: isVideo ? 'video' : 'image' })}
            >
              {isVideo ? (
                <VideoPlayer uri={mediaUrl} style={styles.messageImage} />
              ) : (
                <Image
                  source={{ uri: mediaUrl }}
                  style={styles.messageImage}
                  resizeMode="cover"
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={() => handleDownload(mediaUrl)}
            >
              <Download size={13} color="#FDFDFD" />
            </TouchableOpacity>
            {!item.caption && (
              <Text style={styles.mediaTimestamp}>{timeStr}</Text>
            )}
          </View>
        )}
        {item.caption && (
          <Text style={[styles.caption, isMine ? styles.myCaption : styles.theirCaption]}>
            {item.caption}
          </Text>
        )}
        {(!mediaUrl || item.caption) && (
          <Text style={styles.timestamp}>{timeStr}</Text>
        )}
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
          <ArrowLeft size={24} color="#FDFDFD" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerUser}
          onPress={() => router.push({ pathname: '/user-profile', params: { userId: userId as string } })}
        >
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>{(username as string)?.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.username}>@{username}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FDFDFD" />
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
              <Text style={styles.emptyText}>{t.conversation.noMessages}</Text>
              <Text style={styles.emptySubtext}>{t.conversation.startConversation}</Text>
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
            <Camera size={24} color="#FDFDFD" />
          </TouchableOpacity>
          <TouchableOpacity onPress={pickImage} style={styles.iconButton}>
            <ImageIcon size={24} color="#FDFDFD" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder={t.conversation.typeMessage}
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
              <ActivityIndicator size="small" color="#7A7A7E" />
            ) : (
              <Send size={20} color="#7A7A7E" />
            )}
          </TouchableOpacity>
        </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#141417',
    borderBottomWidth: 1,
    borderBottomColor: '#252528',
  },
  backButton: {
    marginRight: 12,
  },
  headerUser: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FDFDFD',
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
    color: '#FDFDFD',
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
    backgroundColor: '#FDFDFD',
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#252528',
  },
  mediaWrapper: {
    position: 'relative',
  },
  messageImage: {
    width: 250,
    height: 250,
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
  caption: {
    padding: 12,
    fontSize: 15,
    lineHeight: 20,
  },
  myCaption: {
    color: '#000',
  },
  theirCaption: {
    color: '#FDFDFD',
  },
  timestamp: {
    fontSize: 11,
    color: '#7A7A7E',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  mediaTimestamp: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    fontSize: 11,
    color: '#FDFDFD',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#7A7A7E',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#7A7A7E',
    textAlign: 'center',
  },
  inputContainer: {
    backgroundColor: '#141417',
    borderTopWidth: 1,
    borderTopColor: '#252528',
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
    backgroundColor: '#FDFDFD',
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
    backgroundColor: '#252528',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    maxHeight: 100,
    color: '#FDFDFD',
  },
  sendButton: {
    backgroundColor: '#FDFDFD',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#252528',
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
