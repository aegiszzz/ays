import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { getIPFSGatewayUrl } from '@/lib/ipfs';
import { VideoPlayer } from '@/components/VideoPlayer';
import { ArrowLeft, Heart, MessageCircle } from 'lucide-react-native';

interface Post {
  id: string;
  user_id: string;
  ipfs_cid: string;
  media_type: 'image' | 'video';
  caption: string | null;
  created_at: string;
  users?: { username: string; avatar_url: string | null };
  likes?: number;
  comments_count?: number;
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (id) fetchPost();
  }, [id]);

  const fetchPost = async () => {
    try {
      const { data, error } = await supabase
        .from('media_shares')
        .select('id, user_id, ipfs_cid, media_type, caption, created_at, users:user_id(username, avatar_url)')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) { setNotFound(true); return; }

      const [likesRes, commentsRes] = await Promise.all([
        supabase.from('likes').select('id', { count: 'exact' }).eq('media_share_id', id),
        supabase.from('comments').select('id', { count: 'exact' }).eq('media_share_id', id),
      ]);

      setPost({
        ...data,
        users: Array.isArray(data.users) ? data.users[0] : data.users,
        likes: likesRes.count ?? 0,
        comments_count: commentsRes.count ?? 0,
      });
    } catch (e) {
      console.error('Error fetching post:', e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00A0DC" />
      </View>
    );
  }

  if (notFound || !post) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundText}>Post not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const mediaUrl = getIPFSGatewayUrl(post.ipfs_cid);
  const isVideo = post.media_type === 'video';
  const username = post.users?.username || 'Anonymous';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#FDFDFD" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView>
        <TouchableOpacity
          style={styles.userRow}
          onPress={() => router.push(`/user-profile?userId=${post.user_id}`)}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{username.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.username}>@{username}</Text>
            <Text style={styles.date}>
              {new Date(post.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>
        </TouchableOpacity>

        {isVideo ? (
          <VideoPlayer uri={mediaUrl} style={styles.media} />
        ) : (
          <Image source={{ uri: mediaUrl }} style={styles.media} resizeMode="contain" />
        )}

        <View style={styles.stats}>
          <View style={styles.statItem}>
            <Heart size={20} color="#7A7A7E" />
            <Text style={styles.statText}>{post.likes ?? 0}</Text>
          </View>
          <View style={styles.statItem}>
            <MessageCircle size={20} color="#7A7A7E" />
            <Text style={styles.statText}>{post.comments_count ?? 0}</Text>
          </View>
        </View>

        {post.caption && (
          <View style={styles.captionContainer}>
            <Text style={styles.captionUsername}>@{username}</Text>
            <Text style={styles.caption}> {post.caption}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0F',
  },
  centered: {
    flex: 1,
    backgroundColor: '#0D0D0F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#252528',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FDFDFD',
  },
  backButton: {
    padding: 4,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00A0DC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FDFDFD',
  },
  date: {
    fontSize: 12,
    color: '#7A7A7E',
    marginTop: 2,
  },
  media: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#141417',
  },
  stats: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 20,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 15,
    color: '#7A7A7E',
  },
  captionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  captionUsername: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FDFDFD',
  },
  caption: {
    fontSize: 14,
    color: '#FDFDFD',
    lineHeight: 20,
  },
  notFoundText: {
    fontSize: 16,
    color: '#7A7A7E',
    marginBottom: 16,
  },
  backBtn: {
    backgroundColor: '#00A0DC',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#000',
    fontWeight: '600',
  },
});
