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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  useWindowDimensions,
  Switch,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { createURL } from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl, uploadToIPFS } from '@/lib/ipfs';
import { captureVideoThumbnail } from '@/lib/videoThumbnail';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Heart, MessageCircle, Share, Search, Download, X, Send, Copy, Users, Video as VideoIcon, Plus, Camera, Image as ImageIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { VideoPlayer } from '@/components/VideoPlayer';
import InstallPrompt from '@/components/InstallPrompt';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStorage } from '@/hooks/useStorage';

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
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const feedMaxWidth = 620;
  const { beginUpload, finalizeUpload, failUpload } = useStorage();
  const { t } = useLanguage();
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
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [uploadMediaType, setUploadMediaType] = useState<'image' | 'video'>('image');
  const [uploadCaption, setUploadCaption] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'explore' | 'following'>('explore');
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [mediaAspectRatios, setMediaAspectRatios] = useState<Record<string, number>>({});

  useEffect(() => {
    if (user) {
      fetchMedia();
      fetchFollowingIds();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchFollowingIds = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('friends')
      .select('friend_id')
      .eq('user_id', user.id)
      .eq('status', 'accepted');
    setFollowingIds(data?.map(f => f.friend_id) || []);
  };

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

        const post = media.find(m => m.id === mediaId);
        if (post && post.user_id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: post.user_id,
            type: 'like',
            related_user_id: user.id,
            related_item_id: mediaId,
            content: null,
          });
        }

        // Update like_posts task progress
        const { data: likeTask } = await supabase
          .from('tasks')
          .select('id, required_count, points')
          .eq('action_type', 'like_posts')
          .eq('is_active', true)
          .maybeSingle();

        if (likeTask) {
          const { data: existingUserTask } = await supabase
            .from('user_tasks')
            .select('id, current_count, points_earned')
            .eq('user_id', user.id)
            .eq('task_id', likeTask.id)
            .maybeSingle();

          if (existingUserTask) {
            if (existingUserTask.points_earned === 0) {
              const newCount = (existingUserTask.current_count || 0) + 1;
              const completed = newCount >= likeTask.required_count;
              await supabase
                .from('user_tasks')
                .update({
                  current_count: newCount,
                  ...(completed ? { completed_at: new Date().toISOString(), points_earned: likeTask.points } : {}),
                })
                .eq('id', existingUserTask.id);

              if (completed) {
                await supabase.rpc('increment_user_points', {
                  p_user_id: user.id,
                  p_points: likeTask.points,
                });
              }
            }
          } else {
            const completed = 1 >= likeTask.required_count;
            await supabase.from('user_tasks').insert({
              user_id: user.id,
              task_id: likeTask.id,
              current_count: 1,
              points_earned: completed ? likeTask.points : 0,
              ...(completed ? { completed_at: new Date().toISOString() } : {}),
            });
          }
        }

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

      if (selectedPost.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: selectedPost.user_id,
          type: 'comment',
          related_user_id: user.id,
          related_item_id: selectedPost.id,
          content: commentText.trim().substring(0, 50),
        });
      }

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
    const url = createURL(`post/${postToShare.id}`);
    Clipboard.setStringAsync(url);
  };

  const sendToFriend = async (friendId: string, friendUsername: string) => {
    if (!user || !postToShare) return;

    try {
      const { error } = await supabase
        .from('direct_messages')
        .insert({
          sender_id: user.id,
          receiver_id: friendId,
          ipfs_cid: postToShare.ipfs_cid,
          media_type: postToShare.media_type,
          caption: postToShare.caption,
        });

      if (error) throw error;

      setShareModalVisible(false);
    } catch (error) {
      console.error('Error sending to friend:', error);
    }
  };

  const requestPermissions = async () => {
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
      return false;
    }
    return true;
  };

  const pickFromCamera = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedMedia(result.assets[0].uri);
      setUploadMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const pickFromGallery = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedMedia(result.assets[0].uri);
      setUploadMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const handleUpload = async () => {
    if (!selectedMedia || !user) return;

    setUploading(true);
    setUploadError(null);
    let uploadId: string | null = null;

    try {
      let base64: string;
      let fileSizeBytes = 0;

      if (selectedMedia.startsWith('data:')) {
        base64 = selectedMedia;
        const base64Data = base64.split(',')[1] || base64;
        const padding = (base64Data.match(/=/g) || []).length;
        fileSizeBytes = Math.ceil((base64Data.length * 3) / 4) - padding;
      } else if (selectedMedia.startsWith('blob:') || selectedMedia.startsWith('http')) {
        const response = await fetch(selectedMedia);
        const blob = await response.blob();
        fileSizeBytes = blob.size;
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        const fileInfo = await FileSystem.getInfoAsync(selectedMedia);
        if (fileInfo.exists && 'size' in fileInfo) {
          fileSizeBytes = fileInfo.size;
        }
        base64 = await FileSystem.readAsStringAsync(selectedMedia, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      const uploadRecord = await beginUpload(fileSizeBytes, uploadMediaType);
      if (!uploadRecord) {
        throw new Error('Storage limit reached. Upgrade to get more space.');
      }

      uploadId = uploadRecord.upload_id;

      const cid = await uploadToIPFS(base64);

      // For videos: capture first-frame thumbnail in browser, upload as poster
      let videoPosterCid: string | null = null;
      if (uploadMediaType === 'video') {
        try {
          const thumbDataUrl = await captureVideoThumbnail(selectedMedia);
          if (thumbDataUrl) {
            videoPosterCid = await uploadToIPFS(thumbDataUrl);
          }
        } catch (e) {
          console.warn('Video thumbnail capture failed, continuing without poster:', e);
        }
      }

      const { data: mediaShare, error } = await supabase
        .from('media_shares')
        .insert({
          user_id: user.id,
          ipfs_cid: cid,
          media_type: uploadMediaType,
          caption: uploadCaption.trim() || null,
          is_public: isPublic,
          ...(videoPosterCid ? { video_poster_cid: videoPosterCid, thumbnail_cid: videoPosterCid } : {}),
        })
        .select()
        .single();

      if (error) throw error;

      const finalized = await finalizeUpload(uploadId, cid, mediaShare.id);
      if (!finalized) {
        throw new Error('Failed to finalize upload');
      }

      setUploadSuccess(true);
      setTimeout(() => {
        setSelectedMedia(null);
        setUploadCaption('');
        setIsPublic(true);
        setUploadSuccess(false);
        setUploadModalVisible(false);
        fetchMedia();
      }, 1500);
    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadError(error.message || 'Upload failed');

      if (uploadId) {
        await failUpload(uploadId, error.message);
      }
    } finally {
      setUploading(false);
    }
  };

  const renderMediaItem = ({ item }: { item: MediaShare }) => {
    const imageUrl = getIPFSGatewayUrl(item.ipfs_cid);

    return (
      <View style={[styles.card, isWeb && styles.cardWeb]}>
        <View style={styles.cardHeader}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() => {
              console.log('Navigating to user profile:', item.user_id);
              router.push(`/user-profile?userId=${item.user_id}`);
            }}
          >
            <Text style={styles.avatarText}>
              {(item.users?.username || 'A').charAt(0).toUpperCase()}
            </Text>
          </TouchableOpacity>
          <View style={styles.userInfo}>
            <TouchableOpacity onPress={() => router.push(`/user-profile?userId=${item.user_id}`)}>
              <Text style={styles.username}>
                {item.users?.username || 'Anonymous'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.timestamp}>
              {new Date(item.created_at).toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'long',
              })}
            </Text>
          </View>
        </View>

        {item.media_type === 'video' ? (
          <View style={styles.videoContainer}>
            <VideoPlayer uri={imageUrl} style={styles.media} />
            <View style={styles.videoIndicator}>
              <VideoIcon size={20} color="#FDFDFD" />
            </View>
          </View>
        ) : (
          <Image
            source={{ uri: imageUrl }}
            style={[styles.media, { aspectRatio: mediaAspectRatios[item.id] ?? 1 }]}
            resizeMode="contain"
            onLoad={(e: any) => {
              const { width, height } = e.nativeEvent.source;
              if (width && height) {
                setMediaAspectRatios(prev => ({ ...prev, [item.id]: width / height }));
              }
            }}
          />
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
                color={item.is_liked ? "#E040FB" : "#7A7A7E"}
                fill={item.is_liked ? "#E040FB" : "transparent"}
              />
              {(item.likes || 0) > 0 && (
                <Text style={styles.actionCount}>{item.likes}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => openComments(item)}
            >
              <MessageCircle size={24} color="#7A7A7E" />
              {(item.comments_count || 0) > 0 && (
                <Text style={styles.actionCount}>{item.comments_count}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleShare(item)}
            >
              <Share size={24} color="#7A7A7E" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDownload(item.ipfs_cid)}
          >
            <Download size={24} color="#7A7A7E" />
          </TouchableOpacity>
        </View>

        {item.caption && (
          <View style={styles.captionContainer}>
            <TouchableOpacity onPress={() => router.push(`/user-profile?userId=${item.user_id}`)}>
              <Text style={styles.captionUsername}>{item.users?.username || 'Anonymous'}</Text>
            </TouchableOpacity>
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
    <View style={styles.container}>
      <InstallPrompt />
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>AYS</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setUploadModalVisible(true)}>
              <Plus size={24} color="#FDFDFD" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push('/search-users')}>
              <Search size={24} color="#FDFDFD" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('explore')}
          >
            <Text style={[styles.tabText, activeTab === 'explore' && styles.tabTextActive]}>{t.feed.explore}</Text>
            {activeTab === 'explore' && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('following')}
          >
            <Text style={[styles.tabText, activeTab === 'following' && styles.tabTextActive]}>{t.feed.following}</Text>
            {activeTab === 'following' && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={
          activeTab === 'explore'
            ? media.filter(item => item.is_public)
            : media.filter(item => item.is_public && followingIds.includes(item.user_id))
        }
        renderItem={renderMediaItem}
        keyExtractor={item => item.id}
        contentContainerStyle={{
          paddingTop: 12,
          paddingHorizontal: isWeb ? 0 : 12,
          paddingBottom: Platform.OS === 'web' ? 70 : 90,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {activeTab === 'following' ? t.feed.noContent : t.feed.noPosts}
            </Text>
            <Text style={styles.emptySubtext}>
              {activeTab === 'following'
                ? t.feed.followingEmpty
                : t.feed.startUploading}
            </Text>
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
            <Text style={styles.modalTitle}>{t.feed.comments}</Text>
            <TouchableOpacity onPress={() => setCommentsModalVisible(false)}>
              <X size={24} color="#7A7A7E" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.commentsList}>
            {loadingComments ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#000" />
              </View>
            ) : comments.length === 0 ? (
              <View style={styles.emptyCommentsContainer}>
                <Text style={styles.emptyCommentsText}>{t.feed.noComments}</Text>
                <Text style={styles.emptyCommentsSubtext}>{t.feed.beFirst}</Text>
              </View>
            ) : (
              comments.map((comment) => (
                <View key={comment.id} style={styles.commentItem}>
                  <TouchableOpacity
                    style={styles.commentAvatar}
                    onPress={() => {
                      setCommentsModalVisible(false);
                      router.push(`/user-profile?userId=${comment.user_id}`);
                    }}
                  >
                    <Text style={styles.commentAvatarText}>
                      {(comment.users?.username || 'A').charAt(0).toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.commentContent}>
                    <TouchableOpacity
                      onPress={() => {
                        setCommentsModalVisible(false);
                        router.push(`/user-profile?userId=${comment.user_id}`);
                      }}
                    >
                      <Text style={styles.commentUsername}>
                        {comment.users?.username || 'Anonymous'}
                      </Text>
                    </TouchableOpacity>
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
              placeholder={t.feed.addComment}
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
                <ActivityIndicator size="small" color="#FDFDFD" />
              ) : (
                <Send size={20} color="#FDFDFD" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={uploadModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setUploadModalVisible(false);
          setSelectedMedia(null);
          setUploadCaption('');
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t.feed.uploadMedia}</Text>
            <TouchableOpacity onPress={() => {
              setUploadModalVisible(false);
              setSelectedMedia(null);
              setUploadCaption('');
            }}>
              <X size={24} color="#FDFDFD" />
            </TouchableOpacity>
          </View>

          {!selectedMedia ? (
            <View style={styles.uploadPickerContainer}>
              <TouchableOpacity style={styles.uploadPickerButton} onPress={pickFromCamera}>
                <Camera size={32} color="#FDFDFD" />
                <Text style={styles.uploadPickerButtonText}>{t.feed.takePhoto}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.uploadPickerButton} onPress={pickFromGallery}>
                <ImageIcon size={32} color="#FDFDFD" />
                <Text style={styles.uploadPickerButtonText}>{t.feed.chooseGallery}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.uploadFormContainer}>
              <View style={styles.uploadPreviewContainer}>
                {uploadMediaType === 'video' ? (
                  <View style={styles.videoPlaceholder}>
                    <VideoIcon size={48} color="#666" />
                    <Text style={styles.videoText}>{t.feed.videoSelected}</Text>
                    <Text style={styles.videoSubtext}>{t.feed.readyToUpload}</Text>
                  </View>
                ) : (
                  <Image source={{ uri: selectedMedia }} style={styles.uploadPreview} resizeMode="cover" />
                )}
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => setSelectedMedia(null)}>
                  <X size={20} color="#FDFDFD" />
                </TouchableOpacity>
              </View>

              <View style={styles.uploadForm}>
                <Text style={styles.uploadLabel}>{t.feed.caption}</Text>
                <TextInput
                  style={styles.uploadInput}
                  value={uploadCaption}
                  onChangeText={setUploadCaption}
                  placeholder={t.feed.caption}
                  placeholderTextColor="#999"
                  multiline
                  maxLength={500}
                />

                <View style={styles.uploadSwitchContainer}>
                  <Text style={styles.uploadLabel}>{t.feed.public}</Text>
                  <Switch value={isPublic} onValueChange={setIsPublic} />
                </View>

                <Text style={styles.uploadHelperText}>
                  {isPublic
                    ? t.feed.publicDesc
                    : t.feed.privateDesc}
                </Text>

                {uploadError && (
                  <View style={styles.uploadErrorContainer}>
                    <Text style={styles.uploadErrorText}>{uploadError}</Text>
                  </View>
                )}

                {uploadSuccess ? (
                  <View style={styles.uploadSuccessContainer}>
                    <Text style={styles.uploadSuccessText}>{t.feed.uploadedSuccess}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
                    onPress={handleUpload}
                    disabled={uploading}>
                    {uploading ? (
                      <ActivityIndicator color="#FDFDFD" />
                    ) : (
                      <Text style={styles.uploadButtonText}>{t.feed.uploadToIPFS}</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      <Modal
        visible={shareModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShareModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.shareModalBackdrop}
          activeOpacity={1}
          onPress={() => setShareModalVisible(false)}
        />
        <View style={styles.shareModalContainer}>
          <View style={styles.shareModalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t.feed.share}</Text>
            <TouchableOpacity onPress={() => setShareModalVisible(false)}>
              <X size={24} color="#7A7A7E" />
            </TouchableOpacity>
          </View>

          <View style={styles.shareOptionsContainer}>
            <TouchableOpacity style={styles.shareOption} onPress={copyLink}>
              <View style={styles.shareOptionIcon}>
                <Copy size={24} color="#00A0DC" />
              </View>
              <Text style={styles.shareOptionText}>{t.feed.copyLink}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.friendsSectionHeader}>
            <Users size={20} color="#666" />
            <Text style={styles.friendsSectionTitle}>{t.feed.sendToFriends}</Text>
          </View>

          <ScrollView style={styles.friendsList}>
            {loadingFriends ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#000" />
              </View>
            ) : friends.length === 0 ? (
              <View style={styles.emptyCommentsContainer}>
                <Text style={styles.emptyCommentsText}>{t.feed.noFriends}</Text>
                <Text style={styles.emptyCommentsSubtext}>{t.feed.addFriends}</Text>
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
    backgroundColor: '#0D0D0F',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D0D0F',
  },
  header: {
    paddingBottom: 0,
    backgroundColor: '#0D0D0F',
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E24',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  tabsRow: {
    flexDirection: 'row',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    position: 'relative',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4A4A4E',
  },
  tabTextActive: {
    color: '#FDFDFD',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: '#00A0DC',
    borderRadius: 2,
  },
  searchButton: {
    padding: 8,
    backgroundColor: '#141417',
    borderRadius: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#FDFDFD',
  },
  subtitle: {
    fontSize: 12,
    color: '#4A4A4E',
    marginTop: 2,
  },
  list: {
    paddingBottom: 16,
  },
  card: {
    backgroundColor: '#111116',
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E1E24',
    overflow: 'hidden',
  },
  cardWeb: {
    maxWidth: 620,
    width: '100%',
    marginHorizontal: 'auto' as any,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00A0DC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#FDFDFD',
    fontSize: 15,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FDFDFD',
  },
  timestamp: {
    fontSize: 11,
    color: '#4A4A4E',
    marginTop: 1,
  },
  media: {
    width: '100%',
    backgroundColor: '#0D0D0F',
  },
  videoContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
  },
  videoIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(10, 10, 15, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252528',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  leftActions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A0A0B8',
  },
  captionContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexWrap: 'wrap',
  },
  captionUsername: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FDFDFD',
  },
  caption: {
    fontSize: 14,
    flex: 1,
    color: '#C0C0D8',
  },
  emptyContainer: {
    padding: 60,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4A4A4E',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#252528',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0D0D0F',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#141417',
    paddingTop: 60,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FDFDFD',
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
    gap: 8,
  },
  emptyCommentsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A4A4E',
  },
  emptyCommentsSubtext: {
    fontSize: 14,
    color: '#252528',
  },
  commentItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#141417',
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#00A0DC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  commentAvatarText: {
    color: '#FDFDFD',
    fontSize: 14,
    fontWeight: '700',
  },
  commentContent: {
    flex: 1,
  },
  commentUsername: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
    color: '#FDFDFD',
  },
  commentText: {
    fontSize: 14,
    color: '#C0C0D8',
    marginBottom: 4,
  },
  commentTime: {
    fontSize: 11,
    color: '#4A4A4E',
  },
  commentInputContainer: {
    flexDirection: 'row',
    padding: 16,
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
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#00A0DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#252528',
  },
  shareModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  shareModalContainer: {
    backgroundColor: '#0D0D0F',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  shareModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#252528',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  shareOptionsContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#141417',
  },
  shareOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#141417',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#252528',
  },
  shareOptionIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0, 160, 220, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  shareOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FDFDFD',
  },
  friendsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
  },
  friendsSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7A7A7E',
  },
  friendsList: {
    flex: 1,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#141417',
  },
  friendAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#00A0DC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  friendAvatarText: {
    color: '#FDFDFD',
    fontSize: 16,
    fontWeight: '700',
  },
  friendUsername: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#FDFDFD',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 38,
    height: 38,
    backgroundColor: '#141417',
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#252528',
  },
  uploadPickerContainer: {
    flex: 1,
    padding: 24,
    gap: 16,
    justifyContent: 'center',
  },
  uploadPickerButton: {
    backgroundColor: '#141417',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#252528',
  },
  uploadPickerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FDFDFD',
  },
  uploadFormContainer: {
    flex: 1,
  },
  uploadPreviewContainer: {
    position: 'relative',
    margin: 20,
  },
  uploadPreview: {
    width: '100%',
    height: 280,
    borderRadius: 16,
    backgroundColor: '#141417',
  },
  uploadForm: {
    padding: 20,
    gap: 16,
  },
  uploadLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#A0A0B8',
    marginBottom: 6,
  },
  uploadInput: {
    borderWidth: 1,
    borderColor: '#252528',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 90,
    textAlignVertical: 'top',
    backgroundColor: '#141417',
    color: '#FDFDFD',
  },
  uploadSwitchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  uploadHelperText: {
    fontSize: 13,
    color: '#4A4A4E',
    marginTop: -8,
  },
  uploadErrorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  uploadErrorText: {
    color: '#FF6B6B',
    fontSize: 14,
    textAlign: 'center',
  },
  uploadSuccessContainer: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.3)',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  uploadSuccessText: {
    color: '#4ADE80',
    fontSize: 15,
    fontWeight: '600',
  },
  uploadButton: {
    backgroundColor: '#00A0DC',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#00A0DC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    color: '#FDFDFD',
    fontSize: 16,
    fontWeight: '700',
  },
  videoPlaceholder: {
    width: '100%',
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#141417',
    borderRadius: 16,
    gap: 10,
  },
  videoText: {
    color: '#FDFDFD',
    fontSize: 17,
    fontWeight: '600',
  },
  videoSubtext: {
    color: '#4A4A4E',
    fontSize: 13,
  },
  removeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(10,10,15,0.8)',
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
