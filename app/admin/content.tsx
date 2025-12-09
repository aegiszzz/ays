import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl } from '@/lib/ipfs';
import { ArrowLeft, Trash2, Eye, X, Home } from 'lucide-react-native';
import { VideoPlayer } from '@/components/VideoPlayer';

interface MediaPost {
  id: string;
  ipfs_cid: string;
  caption: string | null;
  media_type: string;
  is_public: boolean;
  created_at: string;
  user_id: string;
  username?: string;
}

export default function ContentModeration() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<MediaPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<MediaPost | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const { data: mediaData, error: mediaError } = await supabase
        .from('media_shares')
        .select('id, ipfs_cid, caption, media_type, is_public, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(100);

      if (mediaError) throw mediaError;

      const { data: usersData } = await supabase
        .from('users')
        .select('id, username');

      const postsWithUsernames = mediaData?.map(post => {
        const user = usersData?.find(u => u.id === post.user_id);
        return {
          ...post,
          username: user?.username || 'Unknown',
        };
      }) || [];

      setPosts(postsWithUsernames);
    } catch (error) {
      console.error('Error fetching posts:', error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

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
              Alert.alert('Success', 'Post deleted successfully');
              fetchPosts();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const handlePreview = (post: MediaPost) => {
    setSelectedPost(post);
    setPreviewVisible(true);
  };

  const renderPost = ({ item }: { item: MediaPost }) => {
    const imageUrl = getIPFSGatewayUrl(item.ipfs_cid);

    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <View style={styles.postInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(item.username || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.username}>{item.username || 'Unknown'}</Text>
              <Text style={styles.date}>
                {new Date(item.created_at).toLocaleDateString()} at{' '}
                {new Date(item.created_at).toLocaleTimeString()}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity onPress={() => handlePreview(item)}>
          {item.media_type === 'video' ? (
            <View style={styles.mediaThumbnail}>
              <Text style={styles.videoLabel}>VIDEO</Text>
            </View>
          ) : (
            <Image source={{ uri: imageUrl }} style={styles.media} resizeMode="cover" />
          )}
        </TouchableOpacity>

        {item.caption && <Text style={styles.caption}>{item.caption}</Text>}

        <View style={styles.postActions}>
          <View style={styles.postMeta}>
            <Text style={styles.metaText}>
              {item.is_public ? '🌍 Public' : '🔒 Private'}
            </Text>
            <Text style={styles.metaText}>
              {item.media_type === 'video' ? '🎥 Video' : '📷 Photo'}
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handlePreview(item)}
            >
              <Eye size={20} color="#007AFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleDeletePost(item.id)}
            >
              <Trash2 size={20} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#000" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Content Moderation</Text>
            <Text style={styles.subtitle}>{posts.length} total posts</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => router.push('/')}
        >
          <Home size={20} color="#000" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No posts found</Text>
            </View>
          }
        />
      )}

      <Modal visible={previewVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setPreviewVisible(false)}
            >
              <X size={24} color="#fff" />
            </TouchableOpacity>
            {selectedPost && (
              selectedPost.media_type === 'video' ? (
                <VideoPlayer
                  uri={getIPFSGatewayUrl(selectedPost.ipfs_cid)}
                  style={styles.modalMedia}
                />
              ) : (
                <Image
                  source={{ uri: getIPFSGatewayUrl(selectedPost.ipfs_cid) }}
                  style={styles.modalMedia}
                  resizeMode="contain"
                />
              )
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  homeButton: {
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  postCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  postHeader: {
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  postInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
  },
  email: {
    fontSize: 12,
    color: '#666',
  },
  date: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  media: {
    width: '100%',
    height: 300,
    backgroundColor: '#f0f0f0',
  },
  mediaThumbnail: {
    width: '100%',
    height: 300,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  caption: {
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  postMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  metaText: {
    fontSize: 12,
    color: '#666',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 600,
    height: '80%',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 8,
  },
  modalMedia: {
    width: '100%',
    height: '100%',
  },
});
