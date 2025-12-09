import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
  Modal,
  TouchableOpacity,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl } from '@/lib/ipfs';
import { useResponsive } from '@/lib/responsive';
import { ImageIcon, X, Download, Edit, MapPin, Link as LinkIcon, Video as VideoIcon, Play } from 'lucide-react-native';
import { VideoPlayer } from '@/components/VideoPlayer';

interface MediaItem {
  id: string;
  ipfs_cid: string;
  media_type: string;
  caption: string | null;
  created_at: string;
}

interface UserProfile {
  username: string;
  bio: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  website: string | null;
  location: string | null;
}

export default function ProfileScreen() {
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

  const ITEM_SIZE = isDesktop ? 200 : (width - 48) / 3;

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const fetchUserData = async () => {
    try {
      const [userResult, mediaResult, followersResult, followingResult] = await Promise.all([
        supabase
          .from('users')
          .select('username, bio, avatar_url, cover_image_url, website, location')
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

  if (!user) {
    return null;
  }

  const userName = user.user_metadata?.full_name || user.user_metadata?.name || profile?.username || 'User';
  const userAvatar = profile?.avatar_url
    ? `https://gateway.pinata.cloud/ipfs/${profile.avatar_url}`
    : user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const coverImage = profile?.cover_image_url
    ? `https://gateway.pinata.cloud/ipfs/${profile.cover_image_url}`
    : null;

  return (
    <ScrollView style={[styles.container, isDesktop && styles.containerDesktop]}>
      {coverImage && (
        <Image source={{ uri: coverImage }} style={styles.coverImage} resizeMode="cover" />
      )}
      <View style={styles.header}>
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

      <Modal
        visible={!!selectedImage}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setSelectedImage(null)}
          />
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
              <TouchableOpacity
                onPress={() => setSelectedImage(null)}
                style={styles.closeButton}
              >
                <X size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            {selectedImage && (
              selectedMediaType === 'video' ? (
                <VideoPlayer uri={selectedImage} style={styles.modalImage} />
              ) : (
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
              )
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  containerDesktop: {
    marginLeft: 220,
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
