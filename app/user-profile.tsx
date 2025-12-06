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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl } from '@/lib/ipfs';
import { useResponsive } from '@/lib/responsive';
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
} from 'lucide-react-native';
import { VideoPlayer } from '@/components/VideoPlayer';

interface MediaItem {
  id: string;
  ipfs_cid: string;
  media_type: string;
  caption: string | null;
  created_at: string;
}

interface UserProfile {
  id: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  website: string | null;
  location: string | null;
}

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { isDesktop } = useResponsive();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video'>('image');
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [friendshipId, setFriendshipId] = useState<string | null>(null);

  const ITEM_SIZE = isDesktop ? 200 : (width - 48) / 3;

  useEffect(() => {
    if (userId) {
      fetchUserData();
      checkFriendshipStatus();
    }
  }, [userId]);

  const fetchUserData = async () => {
    try {
      const [userResult, mediaResult, followersResult, followingResult] = await Promise.all([
        supabase
          .from('users')
          .select('id, username, bio, avatar_url, cover_image_url, website, location')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('media_shares')
          .select('id, ipfs_cid, media_type, caption, created_at')
          .eq('user_id', userId)
          .eq('is_public', true)
          .order('created_at', { ascending: false }),
        supabase.from('friends').select('id', { count: 'exact' }).eq('friend_id', userId).eq('status', 'accepted'),
        supabase.from('friends').select('id', { count: 'exact' }).eq('user_id', userId).eq('status', 'accepted'),
      ]);

      if (userResult.data) {
        setProfile(userResult.data);
      }

      if (mediaResult.data) {
        setMediaItems(mediaResult.data);
      }

      setFollowersCount(followersResult.count || 0);
      setFollowingCount(followingResult.count || 0);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
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
      Alert.alert('Error', 'Failed to update follow status');
    }
  };

  const handleMessage = () => {
    if (!userId) return;
    router.push({ pathname: '/send-message', params: { userId } });
  };

  if (!userId) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>User not found</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>User not found</Text>
      </View>
    );
  }

  const userAvatar = profile.avatar_url ? `https://gateway.pinata.cloud/ipfs/${profile.avatar_url}` : null;
  const coverImage = profile.cover_image_url ? `https://gateway.pinata.cloud/ipfs/${profile.cover_image_url}` : null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{profile.username}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={[styles.container, isDesktop && styles.containerDesktop]}>
        {coverImage && <Image source={{ uri: coverImage }} style={styles.coverImage} resizeMode="cover" />}
        <View style={styles.header}>
          {userAvatar ? (
            <Image source={{ uri: userAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{profile.username.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.name}>{profile.username}</Text>
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
                {isFollowing ? <UserCheck size={16} color="#000" /> : <UserPlus size={16} color="#fff" />}
                <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.messageButton} onPress={handleMessage}>
                <MessageCircle size={16} color="#000" />
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
                    onPress={() => {
                      setSelectedImage(imageUri);
                      setSelectedMediaType(isVideo ? 'video' : 'image');
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
                      <Image source={{ uri: imageUri }} style={styles.gridImage} resizeMode="cover" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <Modal
          visible={!!selectedImage}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedImage(null)}
        >
          <View style={styles.modalContainer}>
            <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSelectedImage(null)} />
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  onPress={() => {
                    if (selectedImage) {
                      Linking.openURL(selectedImage);
                    }
                  }}
                  style={styles.downloadButton}
                >
                  <Download size={24} color="#fff" />
                  <Text style={styles.downloadText}>Download</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedImage(null)} style={styles.closeButton}>
                  <X size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              {selectedImage &&
                (selectedMediaType === 'video' ? (
                  <VideoPlayer uri={selectedImage} style={styles.modalImage} />
                ) : (
                  <Image source={{ uri: selectedImage }} style={styles.modalImage} resizeMode="contain" />
                ))}
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 8,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  errorText: {
    fontSize: 16,
    color: '#999',
  },
  container: {
    flex: 1,
  },
  containerDesktop: {
    marginLeft: 240,
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
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
    backgroundColor: '#000',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    flex: 1,
  },
  followingButton: {
    backgroundColor: '#f0f0f0',
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  followingButtonText: {
    color: '#000',
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    flex: 1,
  },
  messageButtonText: {
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
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
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
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
  modalContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  downloadText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 10,
    borderRadius: 20,
  },
  modalImage: {
    width: '90%',
    height: '70%',
  },
});
