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
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl } from '@/lib/ipfs';
import { Download } from 'lucide-react-native';

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
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [media, setMedia] = useState<MediaShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user) {
      fetchMedia();
    }
  }, [user]);

  const fetchMedia = async () => {
    try {
      const { data, error } = await supabase
        .from('media_shares')
        .select(
          `
          *,
          users:user_id (username)
        `
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      setMedia(data || []);
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

  const renderMediaItem = ({ item }: { item: MediaShare }) => {
    const imageUrl = getIPFSGatewayUrl(item.ipfs_cid);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.username}>
              {item.users?.username || 'Anonymous'}
            </Text>
            <Text style={styles.timestamp}>
              {new Date(item.created_at).toLocaleDateString()}
            </Text>
          </View>
          {item.is_public ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Public</Text>
            </View>
          ) : (
            <View style={[styles.badge, styles.privateBadge]}>
              <Text style={styles.badgeText}>Private</Text>
            </View>
          )}
        </View>

        <Image source={{ uri: imageUrl }} style={styles.media} resizeMode="cover" />

        {item.caption && <Text style={styles.caption}>{item.caption}</Text>}

        <View style={styles.footer}>
          <Text style={styles.mediaType}>{item.media_type}</Text>
          <TouchableOpacity style={styles.downloadButton}>
            <Download size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <Text style={styles.cid} numberOfLines={1} ellipsizeMode="middle">
          IPFS: {item.ipfs_cid}
        </Text>
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
      <View style={styles.header}>
        <Text style={styles.title}>Media Feed</Text>
        <Text style={styles.subtitle}>Shared via IPFS</Text>
      </View>

      <FlatList
        data={media}
        renderItem={renderMediaItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No media shared yet</Text>
            <Text style={styles.emptySubtext}>Start by uploading your first photo or video!</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 12,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  privateBadge: {
    backgroundColor: '#FF9800',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  media: {
    width: '100%',
    height: 300,
    backgroundColor: '#ddd',
  },
  caption: {
    padding: 16,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  mediaType: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
  },
  downloadButton: {
    padding: 8,
  },
  cid: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
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
});
