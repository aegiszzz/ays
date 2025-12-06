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
  Switch,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl, uploadToIPFS } from '@/lib/ipfs';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Heart, MessageCircle, Share, Search, Download, X, Send, Copy, Users, Video as VideoIcon, Plus, Camera, Image as ImageIcon } from 'lucide-react-native';
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
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [uploadMediaType, setUploadMediaType] = useState<'image' | 'video'>('image');
  const [uploadCaption, setUploadCaption] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

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
        Alert.alert('Success', 'Image downloaded successfully!');
      } else {
        const fileUri = FileSystem.documentDirectory + `ays-${ipfsCid.slice(-8)}.jpg`;
        const downloadResult = await FileSystem.downloadAsync(url, fileUri);

        if (downloadResult.status === 200) {
          Alert.alert('Success', 'Image saved to your device!');
        } else {
          throw new Error('Download failed');
        }
      }
    } catch (error) {
      console.error('Error downloading image:', error);
      Alert.alert('Error', 'Failed to download image. Please try again.');
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
          ipfs_cid: postToShare.ipfs_cid,
          media_type: postToShare.media_type,
          caption: postToShare.caption,
        });

      if (error) throw error;

      Alert.alert('Sent!', `Photo shared with ${friendUsername}`);
      setShareModalVisible(false);
    } catch (error) {
      console.error('Error sending to friend:', error);
      Alert.alert('Error', 'Failed to send photo');
    }
  };

  const requestPermissions = async () => {
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
      Alert.alert('Permission Required', 'We need camera and media library permissions to upload photos and videos.');
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
    try {
      let base64: string;

      if (selectedMedia.startsWith('data:')) {
        base64 = selectedMedia;
      } else if (selectedMedia.startsWith('blob:') || selectedMedia.startsWith('http')) {
        const response = await fetch(selectedMedia);
        const blob = await response.blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        base64 = await FileSystem.readAsStringAsync(selectedMedia, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      const cid = await uploadToIPFS(base64);

      const { error } = await supabase.from('media_shares').insert({
        user_id: user.id,
        ipfs_cid: cid,
        media_type: uploadMediaType,
        caption: uploadCaption.trim() || null,
        is_public: isPublic,
      });

      if (error) throw error;

      setUploadSuccess(true);
      setTimeout(() => {
        setSelectedMedia(null);
        setUploadCaption('');
        setIsPublic(true);
        setUploadSuccess(false);
        setUploadModalVisible(false);
        fetchMedia();
      }, 1500);
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Error', 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const renderMediaItem = ({ item }: { item: MediaShare }) => {
    const imageUrl = getIPFSGatewayUrl(item.ipfs_cid);

    return (
      <View style={[styles.card, isDesktop && styles.cardDesktop]}>
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
    <View style={[styles.container, isDesktop && styles.containerDesktop]}>
      <InstallPrompt />
      <View style={[styles.header, isDesktop && styles.headerDesktop]}>
        <View style={[styles.headerTop, isDesktop && styles.headerTopDesktop]}>
          <View>
            <Text style={styles.title}>AYS</Text>
            <Text style={styles.subtitle}>Discover amazing content</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setUploadModalVisible(true)}>
              <Plus size={24} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push('/search-users')}>
              <Search size={24} color="#000" />
            </TouchableOpacity>
          </View>
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
            <Text style={styles.modalTitle}>Upload Media</Text>
            <TouchableOpacity onPress={() => {
              setUploadModalVisible(false);
              setSelectedMedia(null);
              setUploadCaption('');
            }}>
              <X size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {!selectedMedia ? (
            <View style={styles.uploadPickerContainer}>
              <TouchableOpacity style={styles.uploadPickerButton} onPress={pickFromCamera}>
                <Camera size={32} color="#000" />
                <Text style={styles.uploadPickerButtonText}>Take Photo/Video</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.uploadPickerButton} onPress={pickFromGallery}>
                <ImageIcon size={32} color="#000" />
                <Text style={styles.uploadPickerButtonText}>Choose from Gallery</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.uploadFormContainer}>
              <View style={styles.uploadPreviewContainer}>
                {uploadMediaType === 'video' ? (
                  <View style={styles.videoPlaceholder}>
                    <VideoIcon size={48} color="#666" />
                    <Text style={styles.videoText}>Video selected</Text>
                    <Text style={styles.videoSubtext}>Ready to upload</Text>
                  </View>
                ) : (
                  <Image source={{ uri: selectedMedia }} style={styles.uploadPreview} resizeMode="cover" />
                )}
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => setSelectedMedia(null)}>
                  <X size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={styles.uploadForm}>
                <Text style={styles.uploadLabel}>Caption (optional)</Text>
                <TextInput
                  style={styles.uploadInput}
                  value={uploadCaption}
                  onChangeText={setUploadCaption}
                  placeholder="Add a caption..."
                  placeholderTextColor="#999"
                  multiline
                  maxLength={500}
                />

                <View style={styles.uploadSwitchContainer}>
                  <Text style={styles.uploadLabel}>Public</Text>
                  <Switch value={isPublic} onValueChange={setIsPublic} />
                </View>

                <Text style={styles.uploadHelperText}>
                  {isPublic
                    ? 'Anyone can view this media'
                    : 'Only users you share with can view'}
                </Text>

                {uploadSuccess ? (
                  <View style={styles.uploadSuccessContainer}>
                    <Text style={styles.uploadSuccessText}>✓ Uploaded successfully!</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
                    onPress={handleUpload}
                    disabled={uploading}>
                    {uploading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.uploadButtonText}>Upload to IPFS</Text>
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
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
  },
  uploadPickerContainer: {
    padding: 20,
    gap: 16,
  },
  uploadPickerButton: {
    backgroundColor: '#f5f5f5',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  uploadPickerButtonText: {
    fontSize: 16,
    fontWeight: '600',
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
    height: 300,
    borderRadius: 12,
    backgroundColor: '#ddd',
  },
  uploadForm: {
    padding: 20,
    gap: 16,
  },
  uploadLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  uploadInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  uploadSwitchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  uploadHelperText: {
    fontSize: 14,
    color: '#666',
    marginTop: -8,
  },
  uploadSuccessContainer: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  uploadSuccessText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadButton: {
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  videoPlaceholder: {
    width: '100%',
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
  },
  videoText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  videoSubtext: {
    color: '#999',
    fontSize: 14,
    marginTop: 4,
  },
});
