import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Clipboard,
  useWindowDimensions,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl } from '@/lib/ipfs';
import { Heart, MessageCircle, Share, Search, Download, X, Send, Copy, Users, Video as VideoIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { VideoPlayer } from '@/components/VideoPlayer';
import InstallPrompt from '@/components/InstallPrompt';

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  users?: {
    username: string;
  };
}

interface MediaShare {
  id: string;
  user_id: string;
  ipfs_cid: string;
  media_type: 'image' | 'video';
  caption: string | null;
  is_public: boolean;
  created_at: string;
  users?: {
    username: string;
  };
  likes?: number;
  is_liked?: boolean;
  comments_count?: number;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [media, setMedia] = useState<MediaShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [likingPosts, setLikingPosts] = useState<Set<string>>(new Set());
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<MediaShare | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [postToShare, setPostToShare] = useState<MediaShare | null>(null);
  const [friends, setFriends] = useState<Array<{ id: string; username: string }>>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  const isDesktop = width > 768;

  useEffect(() => {
    if (user) {
      fetchMedia();
    }
  }, [user]);

  const fetchMedia = async () => {
    try {
      const { data: mediaData, error: mediaError } = await supabase
        .from('media_shares')
        .select('*')
        .order('created_at', { ascending: false });

      if (mediaError) throw mediaError;

      const userIds = [...new Set(mediaData?.map(m => m.user_id) || [])];

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);

      if (usersError) throw usersError;

      const usersMap = new Map(usersData?.map(u => [u.id, u]) || []);

      const mediaIds = mediaData?.map(m => m.id) || [];

      const { data: likesData } = await supabase
        .from('likes')
        .select('media_share_id, user_id');

      const { data: commentsData } = await supabase
        .from('comments')
        .select('media_share_id');

      const likesMap = new Map<string, { count: number; isLiked: boolean }>();
      likesData?.forEach(like => {
        const current = likesMap.get(like.media_share_id) || { count: 0, isLiked: false };
        likesMap.set(like.media_share_id, {
          count: current.count + 1,
          isLiked: current.isLiked || like.user_id === user?.id
        });
      });

      const commentsMap = new Map<string, number>();
      commentsData?.forEach(comment => {
        commentsMap.set(comment.media_share_id, (commentsMap.get(comment.media_share_id) || 0) + 1);
      });

      const mediaWithUsers = mediaData?.map(m => ({
        ...m,
        users: usersMap.get(m.user_id),
        likes: likesMap.get(m.id)?.count || 0,
        is_liked: likesMap.get(m.id)?.isLiked || false,
        comments_count: commentsMap.get(m.id) || 0
      })) || [];

      setMedia(mediaWithUsers);
    } catch (error) {
      console.error('Error fetching media:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchMedia();
  };

  const handleLike = async (mediaId: string, isLiked: boolean) => {
    if (!user || likingPosts.has(mediaId)) return;

    setLikingPosts(prev => new Set(prev).add(mediaId));

    try {
      if (isLiked) {
        await supabase
          .from('likes')
          .delete()
          .eq('media_share_id', mediaId)
          .eq('user_id', user.id);

        setMedia(prev => prev.map(item =>
          item.id === mediaId
            ? { ...item, likes: (item.likes || 1) - 1, is_liked: false }
            : item
        ));
      } else {
        await supabase
          .from('likes')
          .insert({ media_share_id: mediaId, user_id: user.id });

        setMedia(prev => prev.map(item =>
          item.id === mediaId
            ? { ...item, likes: (item.likes || 0) + 1, is_liked: true }
            : item
        ));
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    } finally {
      setLikingPosts(prev => {
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
    }
  };

  const handleDownload = async (ipfsCid: string) => {
    try {
      const url = getIPFSGatewayUrl(ipfsCid);
      await Linking.openURL(url);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  };

  const openComments = async (post: MediaShare) => {
    setSelectedPost(post);
    setCommentsModalVisible(true);
    setLoadingComments(true);

    try {
      const { data: commentsData, error: commentsError } = await supabase
        .from('comments')
        .select('*')
        .eq('media_share_id', post.id)
        .order('created_at', { ascending: false });

      if (commentsError) throw commentsError;

      const userIds = [...new Set(commentsData?.map(c => c.user_id) || [])];

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);

      if (usersError) throw usersError;

      const usersMap = new Map(usersData?.map(u => [u.id, u]) || []);

      const commentsWithUsers = commentsData?.map(c => ({
        ...c,
        users: usersMap.get(c.user_id)
      })) || [];

      setComments(commentsWithUsers);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const sendComment = async () => {
    if (!user || !selectedPost || !commentText.trim() || sendingComment) return;

    setSendingComment(true);

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          user_id: user.id,
          media_share_id: selectedPost.id,
          content: commentText.trim()
        })
        .select()
        .single();

      if (error) throw error;

      const { data: userData } = await supabase
        .from('users')
        .select('username')
        .eq('id', user.id)
        .single();

      const newComment: Comment = {
        ...data,
        users: userData
      };

      setComments(prev => [newComment, ...prev]);
      setCommentText('');

      setMedia(prev => prev.map(item =>
        item.id === selectedPost.id
          ? { ...item, comments_count: (item.comments_count || 0) + 1 }
          : item
      ));
    } catch (error) {
      console.error('Error sending comment:', error);
    } finally {
      setSendingComment(false);
    }
  };

  const handleShare = async (post: MediaShare) => {
    setPostToShare(post);
    setShareModalVisible(true);
    fetchFriends();
  };

  const fetchFriends = async () => {
    if (!user) return;
    setLoadingFriends(true);

    try {
      const { data: friendsData, error } = await supabase
        .from('friends')
        .select('friend_id')
        .eq('user_id', user.id)
        .eq('status', 'accepted');

      if (error) throw error;

      const friendIds = friendsData?.map(f => f.friend_id) || [];

      if (friendIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, username')
          .in('id', friendIds);

        if (usersError) throw usersError;
        setFriends(usersData || []);
      }
    } catch (error) {
      console.error('Error fetching friends:', error);
    } finally {
      setLoadingFriends(false);
    }
  };

  const copyLink = () => {
    if (!postToShare) return;
    const url = getIPFSGatewayUrl(postToShare.ipfs_cid);
    Clipboard.setString(url);
    Alert.alert('Copied!', 'Link copied to clipboard');
  };

  const sendToFriend = async (friendId: string, friendUsername: string) => {
    if (!user || !postToShare) return;

    try {
      const { error } = await supabase
        .from('direct_messages')
        .insert({
          sender_id: user.id,
          receiver_id: friendId,
          media_share_id: postToShare.id,
        });

      if (error) throw error;

      Alert.alert('Sent!', `Photo shared with ${friendUsername}`);
      setShareModalVisible(false);
    } catch (error) {
      console.error('Error sending to friend:', error);
      Alert.alert('Error', 'Failed to send photo');
    }
  };

  const renderMediaItem = ({ item }: { item: MediaShare }) => {
    const imageUrl = getIPFSGatewayUrl(item.ipfs_cid);

    return (
      <View style={[styles.card, isDesktop && styles.cardDesktop]}>
        <View style={styles.cardHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {(item.users?.username || 'A').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.username}>
              {item.users?.username || 'Anonymous'}
            </Text>
            <Text style={styles.timestamp}>
              {new Date(item.created_at).toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'long',
              })}
            </Text>
          </View>
        </View>

        {item.media_type === 'video' ? (
          <View style={[styles.videoContainer, isDesktop && styles.mediaDesktop]}>
            <VideoPlayer uri={imageUrl} style={[styles.media, isDesktop && styles.mediaDesktop]} />
            <View style={styles.videoIndicator}>
              <VideoIcon size={20} color="#fff" />
            </View>
          </View>
        ) : (
          <Image source={{ uri: imageUrl }} style={[styles.media, isDesktop && styles.mediaDesktop]} resizeMode="cover" />
        )}

        <View style={styles.actions}>
          <View style={styles.leftActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleLike(item.id, item.is_liked || false)}
              disabled={likingPosts.has(item.id)}
            >
              <Heart
                size={24}
                color={item.is_liked ? "#ff0000" : "#000"}
                fill={item.is_liked ? "#ff0000" : "transparent"}
              />
              {(item.likes || 0) > 0 && (
                <Text style={styles.actionCount}>{item.likes}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => openComments(item)}
            >
              <MessageCircle size={24} color="#000" />
              {(item.comments_count || 0) > 0 && (
                <Text style={styles.actionCount}>{item.comments_count}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleShare(item)}
            >
              <Share size={24} color="#000" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDownload(item.ipfs_cid)}
          >
            <Download size={24} color="#000" />
          </TouchableOpacity>
        </View>

        {item.caption && (
          <View style={styles.captionContainer}>
            <Text style={styles.captionUsername}>{item.users?.username || 'Anonymous'}</Text>
            <Text style={styles.caption}> {item.caption}</Text>
          </View>
        )}
      </View>
    );
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

  return (
    <View style={[styles.container, isDesktop && styles.containerDesktop]}>
      <InstallPrompt />
      <View style={[styles.header, isDesktop && styles.headerDesktop]}>
        <View style={[styles.headerTop, isDesktop && styles.headerTopDesktop]}>
          <View>
            <Text style={styles.title}>AYS</Text>
            <Text style={styles.subtitle}>Discover amazing content</Text>
          </View>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => router.push('/search-users')}>
            <Search size={24} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={media.filter(item => item.is_public)}
        renderItem={renderMediaItem}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, isDesktop && styles.listDesktop]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No posts yet</Text>
            <Text style={styles.emptySubtext}>Start by uploading your first photo or video!</Text>
          </View>
        }
      />

      <Modal
        visible={commentsModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCommentsModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Comments</Text>
            <TouchableOpacity onPress={() => setCommentsModalVisible(false)}>
              <X size={24} color="#000" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.commentsList}>
            {loadingComments ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#000" />
              </View>
            ) : comments.length === 0 ? (
              <View style={styles.emptyCommentsContainer}>
                <Text style={styles.emptyCommentsText}>No comments yet</Text>
                <Text style={styles.emptyCommentsSubtext}>Be the first to comment!</Text>
              </View>
            ) : (
              comments.map((comment) => (
                <View key={comment.id} style={styles.commentItem}>
                  <View style={styles.commentAvatar}>
                    <Text style={styles.commentAvatarText}>
                      {(comment.users?.username || 'A').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.commentContent}>
                    <Text style={styles.commentUsername}>
                      {comment.users?.username || 'Anonymous'}
                    </Text>
                    <Text style={styles.commentText}>{comment.content}</Text>
                    <Text style={styles.commentTime}>
                      {new Date(comment.created_at).toLocaleDateString('tr-TR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.commentInputContainer}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment..."
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!commentText.trim() || sendingComment) && styles.sendButtonDisabled
              ]}
              onPress={sendComment}
              disabled={!commentText.trim() || sendingComment}
            >
              {sendingComment ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Send size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={shareModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShareModalVisible(false)}
      >
        <View style={styles.shareModalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Share</Text>
            <TouchableOpacity onPress={() => setShareModalVisible(false)}>
              <X size={24} color="#000" />
            </TouchableOpacity>
          </View>

          <View style={styles.shareOptionsContainer}>
            <TouchableOpacity style={styles.shareOption} onPress={copyLink}>
              <View style={styles.shareOptionIcon}>
                <Copy size={24} color="#000" />
              </View>
              <Text style={styles.shareOptionText}>Copy Link</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.friendsSectionHeader}>
            <Users size={20} color="#666" />
            <Text style={styles.friendsSectionTitle}>Send to Friends</Text>
          </View>

          <ScrollView style={styles.friendsList}>
            {loadingFriends ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#000" />
              </View>
            ) : friends.length === 0 ? (
              <View style={styles.emptyCommentsContainer}>
                <Text style={styles.emptyCommentsText}>No friends yet</Text>
                <Text style={styles.emptyCommentsSubtext}>Add friends to share photos with them!</Text>
              </View>
            ) : (
              friends.map((friend) => (
                <TouchableOpacity
                  key={friend.id}
                  style={styles.friendItem}
                  onPress={() => sendToFriend(friend.id, friend.username)}
                >
                  <View style={styles.friendAvatar}>
                    <Text style={styles.friendAvatarText}>
                      {friend.username.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.friendUsername}>{friend.username}</Text>
                  <Send size={20} color="#666" />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  containerDesktop: {
    marginLeft: 240,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerDesktop: {
    alignItems: 'center',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
  },
  headerTopDesktop: {
    maxWidth: 600,
    width: '100%',
  },
  searchButton: {
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 4,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  list: {
    paddingBottom: 16,
  },
  listDesktop: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 600,
  },
  card: {
    backgroundColor: '#fff',
    marginBottom: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  cardDesktop: {
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  media: {
    width: '100%',
    height: 400,
    backgroundColor: '#f0f0f0',
  },
  mediaDesktop: {
    height: 600,
  },
  videoContainer: {
    position: 'relative',
    width: '100%',
    height: 400,
  },
  videoIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  leftActions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  captionContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  captionUsername: {
    fontSize: 14,
    fontWeight: '600',
  },
  caption: {
    fontSize: 14,
    flex: 1,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingTop: 60,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  commentsList: {
    flex: 1,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyCommentsContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyCommentsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptyCommentsSubtext: {
    fontSize: 14,
    color: '#999',
  },
  commentItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  commentAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  commentContent: {
    flex: 1,
  },
  commentUsername: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  commentText: {
    fontSize: 14,
    color: '#000',
    marginBottom: 4,
  },
  commentTime: {
    fontSize: 12,
    color: '#999',
  },
  commentInputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    gap: 12,
    alignItems: 'flex-end',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  shareModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  shareOptionsContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  shareOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
  },
  shareOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  shareOptionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  friendsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 8,
  },
  friendsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  friendsList: {
    flex: 1,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  friendAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  friendUsername: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
});
