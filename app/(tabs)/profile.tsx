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
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl } from '@/lib/ipfs';
import { ImageIcon, X, Download } from 'lucide-react-native';

interface MediaItem {
  id: string;
  ipfs_cid: string;
  media_type: string;
  caption: string | null;
  created_at: string;
}

const { width } = Dimensions.get('window');
const ITEM_SIZE = (width - 48) / 3;

export default function ProfileScreen() {
  const { user } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const fetchUserData = async () => {
    try {
      const [userResult, mediaResult] = await Promise.all([
        supabase.from('users').select('username').eq('id', user!.id).maybeSingle(),
        supabase
          .from('media_shares')
          .select('id, ipfs_cid, media_type, caption, created_at')
          .eq('user_id', user!.id)
          .order('created_at', { ascending: false }),
      ]);

      if (userResult.data) {
        setUsername(userResult.data.username);
      }

      if (mediaResult.data) {
        setMediaItems(mediaResult.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  const userName = user.user_metadata?.full_name || user.user_metadata?.name || 'User';
  const userAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        {userAvatar ? (
          <Image source={{ uri: userAvatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.name}>{userName}</Text>
        {username && <Text style={styles.username}>@{username}</Text>}

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{mediaItems.length}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
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
              const isLoading = loadingImages.has(item.id);

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.gridItem}
                  onPress={() => setSelectedImage(imageUri)}
                >
                  {isLoading && (
                    <View style={styles.imageLoader}>
                      <ActivityIndicator size="small" color="#000" />
                    </View>
                  )}
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.gridImage}
                    resizeMode="cover"
                    onLoadStart={() => {
                      setLoadingImages(prev => new Set(prev).add(item.id));
                    }}
                    onLoadEnd={() => {
                      setLoadingImages(prev => {
                        const next = new Set(prev);
                        next.delete(item.id);
                        return next;
                      });
                    }}
                    onError={(error) => {
                      console.error('Image load error:', imageUri, error.nativeEvent.error);
                      setLoadingImages(prev => {
                        const next = new Set(prev);
                        next.delete(item.id);
                        return next;
                      });
                    }}
                  />
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
              <Image
                source={{ uri: selectedImage }}
                style={styles.modalImage}
                resizeMode="contain"
              />
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
  header: {
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 60,
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
    marginBottom: 16,
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
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    backgroundColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  imageLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    zIndex: 1,
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
