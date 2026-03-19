import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Linking,
  useWindowDimensions,
  Alert,
  Platform,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl } from '@/lib/ipfs';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import {
  ImageIcon,
  X,
  Download,
  MapPin,
  Link as LinkIcon,
  Video as VideoIcon,
  Play,
  ArrowLeft,
  UserPlus,
  UserCheck,
  MessageCircle,
  Heart,
  Send,
} from 'lucide-react-native';
import { VideoPlayer } from '@/components/VideoPlayer';

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  users?: { username: string };
}

interface MediaItem {
  id: string;
  ipfs_cid: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  likes?: number;
  is_liked?: boolean;
  comments_count?: number;
}

interface UserProfile {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  website: string | null;
  location: string | null;
}

export default function UserProfileScreen() {
  const params = useLocalSearchParams();
  const userId = params.userId as string;
  const { user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<MediaItem | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [likingPosts, setLikingPosts] = useState<Set<string>>(new Set());
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  const ITEM_SIZE = (width - 48) / 3;

  useEffect(() => {
    console.log('UserProfileScreen - All params:', params);
    console.log('UserProfileScreen - userId:', userId, 'currentUser:', user?.id);
    if (userId) {
      fetchUserData();
      checkFriendshipStatus();
    } else {
      setLoading(false);
    }
  }, [userId]);

  const fetchUserData = async () => {
    try {
      console.log('fetchUserData - Starting fetch for userId:', userId);

      const userResult = await supabase
        .from('users')
        .select('id, username, name, bio, avatar_url, cover_image_url, website, location')
        .eq('id', userId)
        .maybeSingle();

      console.log('fetchUserData - User result:', userResult);

      if (userResult.error) {
        console.error('fetchUserData - User query error:', userResult.error);
      }

      if (!userResult.data) {
        console.log('fetchUserData - No user data found for userId:', userId);
        setLoading(false);
        return;
      }

      setProfile(userResult.data);
      console.log('fetchUserData - Profile set:', userResult.data);

      const [mediaResult, followersResult, followingResult] = await Promise.all([
        supabase
          .from('media_shares')
          .select('id, ipfs_cid, media_type, caption, created_at')
          .eq('user_id', userId)
          .eq('is_public', true)
          .order('created_at', { ascending: false }),
        supabase.from('friends').select('id', { count: 'exact' }).eq('friend_id', userId).eq('status', 'accepted'),
        supabase.from('friends').select('id', { count: 'exact' }).eq('user_id', userId).eq('status', 'accepted'),
      ]);

      if (mediaResult.data && mediaResult.data.length > 0) {
        const mediaIds = mediaResult.data.map(m => m.id);

        const [likesResult, commentsResult] = await Promise.all([
          supabase.from('likes').select('media_share_id, user_id').in('media_share_id', mediaIds),
          supabase.from('comments').select('media_share_id').in('media_share_id', mediaIds),
        ]);

        const likesMap = new Map<string, { count: number; isLiked: boolean }>();
        likesResult.data?.forEach(like => {
          const cur = likesMap.get(like.media_share_id) || { count: 0, isLiked: false };
          likesMap.set(like.media_share_id, {
            count: cur.count + 1,
            isLiked: cur.isLiked || like.user_id === user?.id,
          });
        });

        const commentsMap = new Map<string, number>();
        commentsResult.data?.forEach(c => {
          commentsMap.set(c.media_share_id, (commentsMap.get(c.media_share_id) || 0) + 1);
        });

        setMediaItems(mediaResult.data.map(m => ({
          ...m,
          likes: likesMap.get(m.id)?.count || 0,
          is_liked: likesMap.get(m.id)?.isLiked || false,
          comments_count: commentsMap.get(m.id) || 0,
        })));
      } else if (mediaResult.data) {
        setMediaItems([]);
      }

      setFollowersCount(followersResult.count || 0);
      setFollowingCount(followingResult.count || 0);
    } catch (error) {
      console.error('fetchUserData - Error:', error);
    } finally {
      console.log('fetchUserData - Finished loading');
      setLoading(false);
    }
  };

  const checkFriendshipStatus = async () => {
    if (!user || !userId) return;

    try {
      const { data, error } = await supabase
        .from('friends')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('friend_id', userId)
        .maybeSingle();

      if (data) {
        setIsFollowing(data.status === 'accepted');
        setFriendshipId(data.id);
      }
    } catch (error) {
      console.error('Error checking friendship status:', error);
    }
  };

  const handleFollow = async () => {
    if (!user || !userId) return;

    try {
      if (isFollowing && friendshipId) {
        const { error } = await supabase.from('friends').delete().eq('id', friendshipId);

        if (error) throw error;

        setIsFollowing(false);
        setFriendshipId(null);
        setFollowersCount((prev) => Math.max(0, prev - 1));
      } else {
        const { data, error } = await supabase
          .from('friends')
          .insert({
            user_id: user.id,
            friend_id: userId,
            status: 'accepted',
          })
          .select()
          .single();

        if (error) throw error;

        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'follow',
          related_user_id: user.id,
          related_item_id: null,
          content: null,
        });

        setIsFollowing(true);
        setFriendshipId(data.id);
        setFollowersCount((prev) => prev + 1);
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
    }
  };

  const handleLike = async (mediaId: string, isLiked: boolean) => {
    if (!user || likingPosts.has(mediaId)) return;
    setLikingPosts(prev => new Set(prev).add(mediaId));
    try {
      if (isLiked) {
        await supabase.from('likes').delete().eq('media_share_id', mediaId).eq('user_id', user.id);
        setMediaItems(prev => prev.map(item =>
          item.id === mediaId ? { ...item, likes: (item.likes || 1) - 1, is_liked: false } : item
        ));
        if (selectedPost?.id === mediaId) {
          setSelectedPost(prev => prev ? { ...prev, likes: (prev.likes || 1) - 1, is_liked: false } : prev);
        }
      } else {
        await supabase.from('likes').insert({ media_share_id: mediaId, user_id: user.id });
        if (userId !== user.id) {
          await supabase.from('notifications').insert({
            user_id: userId,
            type: 'like',
            related_user_id: user.id,
            related_item_id: mediaId,
            content: null,
          });
        }
        setMediaItems(prev => prev.map(item =>
          item.id === mediaId ? { ...item, likes: (item.likes || 0) + 1, is_liked: true } : item
        ));
        if (selectedPost?.id === mediaId) {
          setSelectedPost(prev => prev ? { ...prev, likes: (prev.likes || 0) + 1, is_liked: true } : prev);
        }
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    } finally {
      setLikingPosts(prev => { const n = new Set(prev); n.delete(mediaId); return n; });
    }
  };

  const openComments = async (post: MediaItem) => {
    setCommentsVisible(true);
    setLoadingComments(true);
    try {
      const { data: commentsData } = await supabase
        .from('comments')
        .select('*')
        .eq('media_share_id', post.id)
        .order('created_at', { ascending: false });

      const userIds = [...new Set(commentsData?.map(c => c.user_id) || [])];
      const { data: usersData } = userIds.length > 0
        ? await supabase.from('users').select('id, username').in('id', userIds)
        : { data: [] };

      const usersMap = new Map(usersData?.map(u => [u.id, u]) || []);
      setComments(commentsData?.map(c => ({ ...c, users: usersMap.get(c.user_id) })) || []);
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
        .insert({ user_id: user.id, media_share_id: selectedPost.id, content: commentText.trim() })
        .select()
        .single();
      if (error) throw error;

      if (userId !== user.id) {
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'comment',
          related_user_id: user.id,
          related_item_id: selectedPost.id,
          content: commentText.trim().substring(0, 50),
        });
      }

      const { data: userData } = await supabase.from('users').select('username').eq('id', user.id).single();
      setComments(prev => [{ ...data, users: userData }, ...prev]);
      setCommentText('');
      setMediaItems(prev => prev.map(item =>
        item.id === selectedPost.id ? { ...item, comments_count: (item.comments_count || 0) + 1 } : item
      ));
      setSelectedPost(prev => prev ? { ...prev, comments_count: (prev.comments_count || 0) + 1 } : prev);
    } catch (error) {
      console.error('Error sending comment:', error);
    } finally {
      setSendingComment(false);
    }
  };

  const handleMessage = () => {
    if (!userId || !profile?.username) return;
    router.push({ pathname: '/conversation', params: { userId, username: profile.username } });
  };

  const handleDownload = async (ipfsCid: string) => {
    try {
      const url = getIPFSGatewayUrl(ipfsCid);

      if (Platform.OS === 'web') {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `ays-${ipfsCid.slice(-8)}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(blobUrl);
      } else {
        const { status } = await MediaLibrary.requestPermissionsAsync();

        if (status !== 'granted') {
          return;
        }

        const fileUri = FileSystem.documentDirectory + `ays-${ipfsCid.slice(-8)}.jpg`;
        const downloadResult = await FileSystem.downloadAsync(url, fileUri);

        if (downloadResult.status === 200) {
          await MediaLibrary.saveToLibraryAsync(downloadResult.uri);
        } else {
          throw new Error('Download failed');
        }
      }
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  if (!userId) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <ArrowLeft size={24} color="#FDFDFD" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>User not found</Text>
          <TouchableOpacity style={styles.errorButton} onPress={handleBack}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <ArrowLeft size={24} color="#FDFDFD" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FDFDFD" />
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <ArrowLeft size={24} color="#FDFDFD" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>User not found</Text>
          <TouchableOpacity style={styles.errorButton} onPress={handleBack}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const userAvatar = profile.avatar_url ? `https://gateway.pinata.cloud/ipfs/${profile.avatar_url}` : null;
  const coverImage = profile.cover_image_url ? `https://gateway.pinata.cloud/ipfs/${profile.cover_image_url}` : null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <ArrowLeft size={24} color="#FDFDFD" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{profile.name || profile.username}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container}>
        {coverImage && <Image source={{ uri: coverImage }} style={styles.coverImage} resizeMode="cover" />}
        <View style={styles.header}>
          {userAvatar ? (
            <Image source={{ uri: userAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{(profile.name || profile.username).charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.name}>{profile.name || profile.username}</Text>
          <Text style={styles.username}>@{profile.username}</Text>

          {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

          <View style={styles.infoContainer}>
            {profile.location && (
              <View style={styles.infoItem}>
                <MapPin size={14} color="#666" />
                <Text style={styles.infoText}>{profile.location}</Text>
              </View>
            )}
            {profile.website && (
              <TouchableOpacity
                style={styles.infoItem}
                onPress={() => {
                  if (profile.website) {
                    const url = profile.website.startsWith('http')
                      ? profile.website
                      : `https://${profile.website}`;
                    Linking.openURL(url);
                  }
                }}
              >
                <LinkIcon size={14} color="#007AFF" />
                <Text style={[styles.infoText, styles.linkText]}>{profile.website}</Text>
              </TouchableOpacity>
            )}
          </View>

          {user?.id !== userId && (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.followButton, isFollowing && styles.followingButton]}
                onPress={handleFollow}
              >
                {isFollowing ? <UserCheck size={16} color="#FDFDFD" /> : <UserPlus size={16} color="#7A7A7E" />}
                <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.messageButton} onPress={handleMessage}>
                <MessageCircle size={16} color="#FDFDFD" />
                <Text style={styles.messageButtonText}>Message</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{mediaItems.length}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push({ pathname: '/followers', params: { userId } })}
            >
              <Text style={styles.statNumber}>{followersCount}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push({ pathname: '/following', params: { userId } })}
            >
              <Text style={styles.statNumber}>{followingCount}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Posts</Text>
          {mediaItems.length === 0 ? (
            <View style={styles.emptyState}>
              <ImageIcon size={48} color="#ccc" />
              <Text style={styles.emptyText}>No posts yet</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {mediaItems.map((item) => {
                const imageUri = getIPFSGatewayUrl(item.ipfs_cid);
                const isVideo = item.media_type === 'video';

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.gridItem, { width: ITEM_SIZE, height: ITEM_SIZE }]}
                    onPress={() => setSelectedPost(item)}
                  >
                    {isVideo ? (
                      <View style={styles.videoThumbnail}>
                        <View style={styles.videoThumbnailOverlay}>
                          <Play size={32} color="#FDFDFD" fill="#FDFDFD" />
                        </View>
                        <View style={styles.videoIconBadge}>
                          <VideoIcon size={14} color="#FDFDFD" />
                        </View>
                      </View>
                    ) : (
                      <Image source={{ uri: imageUri }} style={styles.gridImage} resizeMode="cover" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Post feed modal */}
        <Modal
          visible={!!selectedPost}
          animationType="fade"
          transparent={Platform.OS === 'web'}
          presentationStyle={Platform.OS === 'web' ? 'overFullScreen' : 'pageSheet'}
          onRequestClose={() => setSelectedPost(null)}
        >
          <View style={Platform.OS === 'web' ? styles.webModalBackdrop : { flex: 1 }}>
          {selectedPost && (
            <View style={[styles.postModal, Platform.OS === 'web' && styles.postModalWeb]}>
              <View style={styles.postModalHeader}>
                <TouchableOpacity onPress={() => setSelectedPost(null)}>
                  <X size={24} color="#7A7A7E" />
                </TouchableOpacity>
              </View>
              <ScrollView>
                {selectedPost.media_type === 'video' ? (
                  <VideoPlayer uri={getIPFSGatewayUrl(selectedPost.ipfs_cid)} style={styles.postModalMedia} />
                ) : (
                  <Image source={{ uri: getIPFSGatewayUrl(selectedPost.ipfs_cid) }} style={styles.postModalMedia} resizeMode="contain" />
                )}
                <View style={styles.postModalActions}>
                  <View style={styles.postModalLeftActions}>
                    <TouchableOpacity
                      style={styles.postModalActionBtn}
                      onPress={() => handleLike(selectedPost.id, selectedPost.is_liked || false)}
                      disabled={likingPosts.has(selectedPost.id)}
                    >
                      <Heart
                        size={26}
                        color={selectedPost.is_liked ? '#E040FB' : '#7A7A7E'}
                        fill={selectedPost.is_liked ? '#E040FB' : 'transparent'}
                      />
                      {(selectedPost.likes || 0) > 0 && (
                        <Text style={styles.postModalActionCount}>{selectedPost.likes}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.postModalActionBtn}
                      onPress={() => openComments(selectedPost)}
                    >
                      <MessageCircle size={26} color="#7A7A7E" />
                      {(selectedPost.comments_count || 0) > 0 && (
                        <Text style={styles.postModalActionCount}>{selectedPost.comments_count}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.postModalActionBtn}
                    onPress={() => handleDownload(selectedPost.ipfs_cid)}
                  >
                    <Download size={26} color="#7A7A7E" />
                  </TouchableOpacity>
                </View>
                {selectedPost.caption && (
                  <View style={styles.postModalCaption}>
                    <Text style={styles.postModalCaptionText}>{selectedPost.caption}</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
          </View>
        </Modal>

        {/* Comments modal */}
        <Modal
          visible={commentsVisible}
          animationType="fade"
          transparent={Platform.OS === 'web'}
          presentationStyle={Platform.OS === 'web' ? 'overFullScreen' : 'pageSheet'}
          onRequestClose={() => setCommentsVisible(false)}
        >
          <View style={Platform.OS === 'web' ? styles.webModalBackdrop : { flex: 1 }}>
          <KeyboardAvoidingView style={[styles.postModal, Platform.OS === 'web' && styles.postModalWeb]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.postModalHeader}>
              <Text style={styles.commentsTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setCommentsVisible(false)}>
                <X size={24} color="#7A7A7E" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }}>
              {loadingComments ? (
                <ActivityIndicator size="large" color="#FDFDFD" style={{ padding: 40 }} />
              ) : comments.length === 0 ? (
                <View style={styles.emptyComments}>
                  <Text style={styles.emptyCommentsText}>No comments yet</Text>
                </View>
              ) : (
                comments.map(comment => (
                  <View key={comment.id} style={styles.commentItem}>
                    <View style={styles.commentAvatar}>
                      <Text style={styles.commentAvatarText}>
                        {(comment.users?.username || 'A').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.commentUsername}>{comment.users?.username || 'Anonymous'}</Text>
                      <Text style={styles.commentText}>{comment.content}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder="Write a comment..."
                placeholderTextColor="#7A7A7E"
                value={commentText}
                onChangeText={setCommentText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.commentSendBtn, (!commentText.trim() || sendingComment) && styles.commentSendBtnDisabled]}
                onPress={sendComment}
                disabled={!commentText.trim() || sendingComment}
              >
                {sendingComment ? (
                  <ActivityIndicator size="small" color="#FDFDFD" />
                ) : (
                  <Send size={20} color="#FDFDFD" />
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#0D0D0F',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 8,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FDFDFD',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D0D0F',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  errorButton: {
    backgroundColor: '#FDFDFD',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  errorButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  coverImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#1a1a1a',
  },
  header: {
    backgroundColor: '#1a1a1a',
    padding: 24,
    paddingTop: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FDFDFD',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FDFDFD',
    marginBottom: 4,
  },
  username: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  bio: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  infoContainer: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 4,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#999',
  },
  linkText: {
    color: '#00A0DC',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FDFDFD',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    flex: 1,
  },
  followingButton: {
    backgroundColor: '#333',
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  followingButtonText: {
    color: '#FDFDFD',
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#333',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    flex: 1,
  },
  messageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FDFDFD',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 32,
    marginTop: 8,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FDFDFD',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FDFDFD',
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoThumbnailOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoIconBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    padding: 4,
  },
  webModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postModal: {
    flex: 1,
    backgroundColor: '#0D0D0F',
  },
  postModalWeb: {
    flex: undefined,
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%' as any,
    borderRadius: 16,
    overflow: 'hidden',
  },
  postModalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 16,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#141417',
  },
  postModalMedia: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#141417',
    maxHeight: 500,
  },
  postModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  postModalLeftActions: {
    flexDirection: 'row',
    gap: 16,
  },
  postModalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
  },
  postModalActionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A0A0B8',
  },
  postModalCaption: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  postModalCaptionText: {
    fontSize: 14,
    color: '#C0C0D8',
  },
  commentsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FDFDFD',
    flex: 1,
  },
  emptyComments: {
    padding: 40,
    alignItems: 'center',
  },
  emptyCommentsText: {
    fontSize: 15,
    color: '#4A4A4E',
  },
  commentItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#141417',
    gap: 12,
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#00A0DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    color: '#FDFDFD',
    fontSize: 14,
    fontWeight: '700',
  },
  commentUsername: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FDFDFD',
    marginBottom: 2,
  },
  commentText: {
    fontSize: 14,
    color: '#C0C0D8',
  },
  commentInputRow: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#141417',
    gap: 10,
    alignItems: 'flex-end',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#141417',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
    color: '#FDFDFD',
    borderWidth: 1,
    borderColor: '#252528',
  },
  commentSendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#00A0DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentSendBtnDisabled: {
    backgroundColor: '#252528',
  },
});
