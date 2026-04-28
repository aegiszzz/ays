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
import { ArrowLeft, Search, UserPlus, Check, Users } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';

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
  const { t } = useLanguage();
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
        supabase
          .from('users')
          .select('id, username, email')
          .neq('id', user?.id)
          .order('username', { ascending: true }),
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

  const isSearching = searchQuery.trim().length > 0;

  const displayedUsers = isSearching
    ? users.filter(u =>
        u.username.toLowerCase().startsWith(searchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase())
      ).sort((a, b) => {
        // Prefix matches first
        const aStarts = a.username.toLowerCase().startsWith(searchQuery.toLowerCase());
        const bStarts = b.username.toLowerCase().startsWith(searchQuery.toLowerCase());
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.username.localeCompare(b.username);
      })
    : users;

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
            <Check size={16} color="#FDFDFD" />
            <Text style={styles.friendBadgeText}>Friend</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addButton, isAdding && styles.addButtonDisabled]}
            onPress={() => handleAddFriend(item.id)}
            disabled={isAdding}>
            {isAdding ? (
              <ActivityIndicator size="small" color="#FDFDFD" />
            ) : (
              <UserPlus size={20} color="#7A7A7E" />
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
          <ArrowLeft size={24} color="#FDFDFD" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Search Users</Text>
          <Text style={styles.subtitle}>Find and add friends</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Search size={20} color="#8e8e93" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t.searchUsers.placeholder}
          placeholderTextColor="#4A4A4E"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
        />
        {isSearching && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FDFDFD" />
        </View>
      ) : (
        <FlatList
          data={displayedUsers}
          renderItem={renderUserItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            !isSearching && users.length > 0 ? (
              <View style={styles.sectionHeader}>
                <Users size={16} color="#7A7A7E" />
                <Text style={styles.sectionTitle}>{t.searchUsers.explore}</Text>
                <Text style={styles.sectionCount}>{users.length} {t.searchUsers.users}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {isSearching ? `"${searchQuery}" ${t.searchUsers.noResultsFor}` : t.searchUsers.noRegisteredUsers}
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
    backgroundColor: '#0D0D0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#141417',
    borderBottomWidth: 1,
    borderBottomColor: '#252528',
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
    color: '#FDFDFD',
  },
  subtitle: {
    fontSize: 14,
    color: '#7A7A7E',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141417',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#252528',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FDFDFD',
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  clearButtonText: {
    color: '#7A7A7E',
    fontSize: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7A7A7E',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex: 1,
  },
  sectionCount: {
    fontSize: 12,
    color: '#4A4A4E',
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
    backgroundColor: '#141417',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#252528',
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00A0DC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FDFDFD',
    fontSize: 18,
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
    fontSize: 15,
    fontWeight: '600',
    color: '#FDFDFD',
  },
  addButton: {
    backgroundColor: '#252528',
    padding: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3A3A3E',
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A3A1A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: '#2A5A2A',
  },
  friendBadgeText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#4A4A4E',
    textAlign: 'center',
  },
});
