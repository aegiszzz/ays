import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Search, UserPlus, Check } from 'lucide-react-native';

interface User {
  id: string;
  username: string;
  email: string;
}

interface Friend {
  friend_id: string;
}

export default function SearchUsersScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [usersResult, friendsResult] = await Promise.all([
        supabase.from('users').select('id, username, email').neq('id', user?.id),
        supabase
          .from('friends')
          .select('friend_id')
          .eq('user_id', user?.id)
          .eq('status', 'accepted'),
      ]);

      if (usersResult.error) throw usersResult.error;
      if (friendsResult.error) throw friendsResult.error;

      setUsers(usersResult.data || []);
      setFriends(new Set((friendsResult.data || []).map((f: Friend) => f.friend_id)));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (friendId: string) => {
    if (!user) return;

    setAdding(friendId);
    try {
      const { error } = await supabase.from('friends').insert({
        user_id: user.id,
        friend_id: friendId,
      });

      if (error) throw error;

      await supabase.from('notifications').insert({
        user_id: friendId,
        type: 'friend_add',
        related_user_id: user.id,
        related_item_id: null,
        content: null,
      });

      setFriends(prev => new Set([...prev, friendId]));
      alert('Friend added successfully!');
    } catch (error) {
      console.error('Error adding friend:', error);
      alert('Failed to add friend. Please try again.');
    } finally {
      setAdding(null);
    }
  };

  const filteredUsers = users.filter(
    u =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderUserItem = ({ item }: { item: User }) => {
    const isFriend = friends.has(item.id);
    const isAdding = adding === item.id;

    return (
      <View style={styles.userCard}>
        <TouchableOpacity
          style={styles.userClickable}
          onPress={() => router.push(`/user-profile?userId=${item.id}`)}
        >
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>{item.username.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.username}>@{item.username}</Text>
          </View>
        </TouchableOpacity>
        {isFriend ? (
          <View style={styles.friendBadge}>
            <Check size={16} color="#fff" />
            <Text style={styles.friendBadgeText}>Friend</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addButton, isAdding && styles.addButtonDisabled]}
            onPress={() => handleAddFriend(item.id)}
            disabled={isAdding}>
            {isAdding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <UserPlus size={20} color="#fff" />
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (!user) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Search Users</Text>
          <Text style={styles.subtitle}>Find and add friends</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Search size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username or email..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
        />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          renderItem={renderUserItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchQuery ? 'No users found' : 'Start typing to search'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  userClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#666',
  },
  addButton: {
    backgroundColor: '#000',
    padding: 10,
    borderRadius: 20,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  friendBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
});
