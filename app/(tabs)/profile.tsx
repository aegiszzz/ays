import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  Dimensions,
  Modal,
  TouchableOpacity,
  Linking,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl } from '@/lib/ipfs';
import { ImageIcon, X, Download, Edit, MapPin, Link as LinkIcon, Video as VideoIcon, Play, Heart, MessageCircle, Share, Trash2, Edit2, Star } from 'lucide-react-native';
import { VideoPlayer } from '@/components/VideoPlayer';

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
  username: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  website: string | null;
  location: string | null;
  total_points?: number;
}

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video'>('image');
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingPost, setEditingPost] = useState<MediaItem | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [updatingPost, setUpdatingPost] = useState(false);
  const [feedModalVisible, setFeedModalVisible] = useState(false);
  const [selectedPostIndex, setSelectedPostIndex] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);

  const { width } = Dimensions.get('window');
  const ITEM_SIZE = (width - 48) / 3;

  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchUserData();
      }
    }, [user])
  );

  const handleDeletePost = async (postId: string) => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('media_shares')
                .delete()
                .eq('id', postId);

              if (error) throw error;

              setMediaItems(prev => prev.filter(item => item.id !== postId));
              Alert.alert('Success', 'Post deleted successfully');
            } catch (error: any) {
              console.error('Error deleting post:', error);
              Alert.alert('Error', 'Failed to delete post');
            }
          },
        },
      ]
    );
  };

  const handleEditPost = (post: MediaItem) => {
    setEditingPost(post);
    setEditCaption(post.caption || '');
    setEditModalVisible(true);
  };

  const handleUpdatePost = async () => {
    if (!editingPost) return;

    setUpdatingPost(true);
    try {
      const { error } = await supabase
        .from('media_shares')
        .update({ caption: editCaption.trim() || null })
        .eq('id', editingPost.id);

      if (error) throw error;

      setMediaItems(prev =>
        prev.map(item =>
          item.id === editingPost.id
            ? { ...item, caption: editCaption.trim() || null }
            : item
        )
      );

      setEditModalVisible(false);
      setEditingPost(null);
      setEditCaption('');
      Alert.alert('Success', 'Post updated successfully');
    } catch (error: any) {
      console.error('Error updating post:', error);
      Alert.alert('Error', 'Failed to update post');
    } finally {
      setUpdatingPost(false);
    }
  };

  const handleLike = async (mediaId: string, isLiked: boolean) => {
    if (!user) return;

    try {
      if (isLiked) {
        await supabase
          .from('likes')
          .delete()
          .eq('media_share_id', mediaId)
          .eq('user_id', user.id);

        setMediaItems(prev =>
          prev.map(item =>
            item.id === mediaId
              ? { ...item, likes: (item.likes || 1) - 1, is_liked: false }
              : item
          )
        );
      } else {
        await supabase
          .from('likes')
          .insert({ media_share_id: mediaId, user_id: user.id });

        setMediaItems(prev =>
          prev.map(item =>
            item.id === mediaId
              ? { ...item, likes: (item.likes || 0) + 1, is_liked: true }
              : item
          )
        );
      }
    } catch (error) {
      console.error('Error liking post:', error);
    }
  };

  const fetchUserData = async () => {
    try {
      const [userResult, mediaResult, followersResult, followingResult] = await Promise.all([
        supabase
          .from('users')
          .select('username, name, bio, avatar_url, cover_image_url, website, location, total_points')
          .eq('id', user!.id)
          .maybeSingle(),
        supabase
          .from('media_shares')
          .select('id, ipfs_cid, media_type, caption, created_at')
          .eq('user_id', user!.id)
          .order('created_at', { ascending: false }),
        supabase.from('friends').select('id', { count: 'exact' }).eq('friend_id', user!.id).eq('status', 'accepted'),
        supabase.from('friends').select('id', { count: 'exact' }).eq('user_id', user!.id).eq('status', 'accepted'),
      ]);

      if (userResult.data) {
        setProfile(userResult.data);
        setTotalPoints(userResult.data.total_points || 0);
      }

      if (mediaResult.data) {
        const mediaIds = mediaResult.data.map(m => m.id);

        const { data: likesData } = await supabase
          .from('likes')
          .select('media_share_id, user_id')
          .in('media_share_id', mediaIds);

        const { data: commentsData } = await supabase
          .from('comments')
          .select('media_share_id')
          .in('media_share_id', mediaIds);

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

        const mediaWithCounts = mediaResult.data.map(m => ({
          ...m,
          likes: likesMap.get(m.id)?.count || 0,
          is_liked: likesMap.get(m.id)?.isLiked || false,
          comments_count: commentsMap.get(m.id) || 0
        }));

        setMediaItems(mediaWithCounts);
      }

      setFollowersCount(followersResult.count || 0);
      setFollowingCount(followingResult.count || 0);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  const userName = profile?.name || profile?.username || 'User';
  const userAvatar = profile?.avatar_url
    ? `https://gateway.pinata.cloud/ipfs/${profile.avatar_url}`
    : user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const coverImage = profile?.cover_image_url
    ? `https://gateway.pinata.cloud/ipfs/${profile.cover_image_url}`
    : null;

  const renderPostInModal = ({ item, index }: { item: MediaItem; index: number }) => {
    const imageUri = getIPFSGatewayUrl(item.ipfs_cid);
    const isVideo = item.media_type === 'video';

    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <View style={styles.postUserInfo}>
            {userAvatar ? (
              <Image source={{ uri: userAvatar }} style={styles.postAvatar} />
            ) : (
              <View style={styles.postAvatarPlaceholder}>
                <Text style={styles.postAvatarText}>{userName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.postUsername}>@{profile?.username || 'user'}</Text>
          </View>
          <View style={styles.postActions}>
            <TouchableOpacity
              style={styles.postActionButton}
              onPress={() => {
                setFeedModalVisible(false);
                setTimeout(() => handleEditPost(item), 300);
              }}
            >
              <Edit2 size={20} color="#666" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.postActionButton}
              onPress={() => {
                setFeedModalVisible(false);
                setTimeout(() => handleDeletePost(item.id), 300);
              }}
            >
              <Trash2 size={20} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        </View>

        {isVideo ? (
          <VideoPlayer uri={imageUri} style={styles.postMedia} />
        ) : (
          <Image source={{ uri: imageUri }} style={styles.postMedia} resizeMode="cover" />
        )}

        {item.caption && <Text style={styles.postCaption}>{item.caption}</Text>}

        <View style={styles.postInteractions}>
          <TouchableOpacity
            style={styles.interactionButton}
            onPress={() => handleLike(item.id, item.is_liked || false)}
          >
            <Heart
              size={24}
              color={item.is_liked ? '#FF3B30' : '#000'}
              fill={item.is_liked ? '#FF3B30' : 'none'}
            />
            <Text style={styles.interactionText}>{item.likes || 0}</Text>
          </TouchableOpacity>
          <View style={styles.interactionButton}>
            <MessageCircle size={24} color="#000" />
            <Text style={styles.interactionText}>{item.comments_count || 0}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <>
    <ScrollView style={styles.container}>
        {coverImage && (
          <Image source={{ uri: coverImage }} style={styles.coverImage} resizeMode="cover" />
        )}
        <View style={styles.header}>
          <View style={styles.avatarRow}>
            <TouchableOpacity
              style={styles.pointsButton}
              onPress={() => router.push('/tasks')}
            >
              <Star size={18} color="#FFD700" fill="#FFD700" />
              <Text style={styles.pointsText}>Points</Text>
            </TouchableOpacity>
          </View>
          {userAvatar ? (
            <Image source={{ uri: userAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
            </View>
          )}

          <Text style={styles.name}>{userName}</Text>
          {profile?.username && <Text style={styles.username}>@{profile.username}</Text>}

          {profile?.bio && (
            <Text style={styles.bio}>{profile.bio}</Text>
          )}

          <View style={styles.infoContainer}>
            {profile?.location && (
              <View style={styles.infoItem}>
                <MapPin size={14} color="#666" />
                <Text style={styles.infoText}>{profile.location}</Text>
              </View>
            )}
            {profile?.website && (
              <TouchableOpacity
                style={styles.infoItem}
                onPress={() => {
                  if (profile.website) {
                    const url = profile.website.startsWith('http')
                      ? profile.website
                      : `https://${profile.website}`;
                    require('react-native').Linking.openURL(url);
                  }
                }}
              >
                <LinkIcon size={14} color="#007AFF" />
                <Text style={[styles.infoText, styles.linkText]}>{profile.website}</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push('/edit-profile')}
          >
            <Edit size={16} color="#000" />
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{mediaItems.length}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push({ pathname: '/followers', params: { userId: user.id } })}
            >
              <Text style={styles.statNumber}>{followersCount}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push({ pathname: '/following', params: { userId: user.id } })}
            >
              <Text style={styles.statNumber}>{followingCount}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Uploads</Text>
          {loading ? (
            <ActivityIndicator size="large" color="#000" style={styles.loader} />
          ) : mediaItems.length === 0 ? (
            <View style={styles.emptyState}>
              <ImageIcon size={48} color="#ccc" />
              <Text style={styles.emptyText}>No uploads yet</Text>
              <Text style={styles.emptySubtext}>
                Your uploaded photos and videos will appear here
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {mediaItems.map((item, index) => {
                const imageUri = getIPFSGatewayUrl(item.ipfs_cid);
                const isVideo = item.media_type === 'video';

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.gridItem, { width: ITEM_SIZE, height: ITEM_SIZE }]}
                    onPress={() => {
                      setSelectedPostIndex(index);
                      setFeedModalVisible(true);
                    }}
                  >
                    {isVideo ? (
                      <View style={styles.videoThumbnail}>
                        <View style={styles.videoThumbnailOverlay}>
                          <Play size={32} color="#fff" fill="#fff" />
                        </View>
                        <View style={styles.videoIconBadge}>
                          <VideoIcon size={14} color="#fff" />
                        </View>
                      </View>
                    ) : (
                      <Image
                        source={{ uri: imageUri }}
                        style={styles.gridImage}
                        resizeMode="cover"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={feedModalVisible}
        animationType="slide"
        onRequestClose={() => setFeedModalVisible(false)}
      >
        <View style={styles.feedModalContainer}>
          <View style={styles.feedModalHeader}>
            <TouchableOpacity
              onPress={() => setFeedModalVisible(false)}
              style={styles.feedModalCloseButton}
            >
              <X size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.feedModalTitle}>Posts</Text>
            <View style={{ width: 24 }} />
          </View>
          <FlatList
            data={mediaItems}
            renderItem={({ item, index }) => renderPostInModal({ item, index })}
            keyExtractor={item => item.id}
            initialScrollIndex={selectedPostIndex}
            getItemLayout={(data, index) => ({
              length: 600,
              offset: 600 * index,
              index,
            })}
            onScrollToIndexFailed={() => {}}
          />
        </View>
      </Modal>

      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setEditModalVisible(false)}
          />
          <View style={styles.editModalContent}>
            <Text style={styles.editModalTitle}>Edit Post</Text>
            <TextInput
              style={styles.editInput}
              value={editCaption}
              onChangeText={setEditCaption}
              placeholder="Enter caption..."
              multiline
              maxLength={500}
            />
            <Text style={styles.charCount}>{editCaption.length}/500</Text>
            <View style={styles.editModalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.updateButton}
                onPress={handleUpdatePost}
                disabled={updatingPost}
              >
                {updatingPost ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.updateButtonText}>Update</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  coverImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#f0f0f0',
  },
  header: {
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  avatarRow: {
    position: 'absolute',
    top: 12,
    right: 24,
    zIndex: 1,
  },
  pointsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF9E6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  pointsText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
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
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  username: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  bio: {
    fontSize: 14,
    color: '#1a1a1a',
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
    color: '#666',
  },
  linkText: {
    color: '#007AFF',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 16,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
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
    color: '#1a1a1a',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
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
    color: '#1a1a1a',
    marginBottom: 12,
  },
  loader: {
    marginTop: 40,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridItem: {
    backgroundColor: '#ddd',
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
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  postCard: {
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  postUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  postAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  postAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  postUsername: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  postActions: {
    flexDirection: 'row',
    gap: 8,
  },
  postActionButton: {
    padding: 4,
  },
  postMedia: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#f0f0f0',
  },
  postCaption: {
    fontSize: 14,
    color: '#1a1a1a',
    padding: 12,
    lineHeight: 20,
  },
  postInteractions: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 16,
  },
  interactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  interactionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  editModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },
  editModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  editInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#1a1a1a',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 8,
  },
  editModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  updateButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#000',
    alignItems: 'center',
  },
  updateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  feedModalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  feedModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  feedModalCloseButton: {
    padding: 4,
  },
  feedModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
});
