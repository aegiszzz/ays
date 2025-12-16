import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { uploadToIPFS } from '@/lib/ipfs';
import { Camera, Image as ImageIcon, X, ArrowLeft, Users, Check, Video as VideoIcon } from 'lucide-react-native';
import DesktopSidebar from '@/components/DesktopSidebar';
import { useResponsive } from '@/lib/responsive';

interface Friend {
  id: string;
  username: string;
  avatar_url: string | null;
}

export default function GroupShareScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { isDesktop } = useResponsive();
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) {
      fetchFriends();
    }
  }, [user]);

  const fetchFriends = async () => {
    try {
      const { data, error } = await supabase
        .from('friends')
        .select(`
          friend_id,
          users!friends_friend_id_fkey(id, username, avatar_url)
        `)
        .eq('user_id', user!.id)
        .eq('status', 'accepted');

      if (error) throw error;

      const friendsList = data
        .map((f: any) => ({
          id: f.users.id,
          username: f.users.username,
          avatar_url: f.users.avatar_url,
        }))
        .filter((f) => f.username);

      setFriends(friendsList);
    } catch (error) {
      console.error('Error fetching friends:', error);
    } finally {
      setLoadingFriends(false);
    }
  };

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }
      return next;
    });
  };

  const requestPermissions = async () => {
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
      Alert.alert('Permission Required', 'We need camera and media library permissions!');
      return false;
    }
    return true;
  };

  const pickFromCamera = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedMedia(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const pickFromGallery = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedMedia(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const handleCreateGroup = async () => {
    if (selectedFriends.size === 0) {
      Alert.alert('Error', 'Please select at least one friend');
      return;
    }

    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    if (!user) return;

    setCreating(true);

    try {
      console.log('Creating group with user.id:', user.id);
      console.log('Group name:', groupName.trim());

      const { data: sessionData } = await supabase.auth.getSession();
      console.log('Current session user:', sessionData.session?.user?.id);

      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: groupName.trim(),
          created_by: user.id,
        })
        .select()
        .single();

      if (groupError) {
        console.error('Group creation error details:', groupError);
        throw groupError;
      }

      const memberInserts = [
        { group_id: groupData.id, user_id: user.id },
        ...Array.from(selectedFriends).map((friendId) => ({
          group_id: groupData.id,
          user_id: friendId,
        })),
      ];

      const { error: membersError } = await supabase.from('group_members').insert(memberInserts);

      if (membersError) throw membersError;

      if (selectedMedia) {
        const cid = await uploadToIPFS(selectedMedia, mediaType);

        const { error: messageError } = await supabase.from('group_messages').insert({
          group_id: groupData.id,
          sender_id: user.id,
          media_type: mediaType,
          ipfs_cid: cid,
        });

        if (messageError) throw messageError;
      }

      Alert.alert('Success', 'Group created successfully!');
      router.replace(`/group-conversation?groupId=${groupData.id}&groupName=${groupData.name}`);
    } catch (error) {
      console.error('Group creation error:', error);
      Alert.alert('Error', 'Failed to create group. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <>
      <DesktopSidebar />
      <View style={[styles.container, isDesktop && styles.containerDesktop]}>
        <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Create Group</Text>
          <Text style={styles.subtitle}>Select friends to create a group</Text>
        </View>
      </View>

      {loadingFriends ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      ) : friends.length === 0 ? (
        <View style={styles.emptyState}>
          <Users size={48} color="#ccc" />
          <Text style={styles.emptyText}>No friends yet</Text>
          <Text style={styles.emptySubtext}>Add friends to create groups</Text>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          <View style={styles.formSection}>
            <Text style={styles.label}>Group Name</Text>
            <TextInput
              style={styles.input}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Enter group name..."
              maxLength={50}
            />
          </View>

          <View style={styles.selectionHeader}>
            <Text style={styles.selectionTitle}>Select Friends</Text>
            <Text style={styles.selectionCount}>{selectedFriends.size} selected</Text>
          </View>

          <View style={styles.friendsList}>
            {friends.map((friend) => {
              const isSelected = selectedFriends.has(friend.id);

              return (
                <TouchableOpacity
                  key={friend.id}
                  style={[styles.friendItem, isSelected && styles.friendItemSelected]}
                  onPress={() => toggleFriendSelection(friend.id)}
                >
                  <View style={styles.friendInfo}>
                    {friend.avatar_url ? (
                      <Image
                        source={{
                          uri: `https://gateway.pinata.cloud/ipfs/${friend.avatar_url}`,
                        }}
                        style={styles.friendAvatar}
                      />
                    ) : (
                      <View style={styles.friendAvatarPlaceholder}>
                        <Text style={styles.friendAvatarText}>
                          {friend.username.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.friendUsername}>@{friend.username}</Text>
                  </View>
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Check size={16} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.mediaSection}>
            <Text style={styles.sectionTitle}>Share Media (Optional)</Text>
            {!selectedMedia ? (
              <View style={styles.mediaButtons}>
                <TouchableOpacity style={styles.mediaButton} onPress={pickFromCamera}>
                  <Camera size={24} color="#000" />
                  <Text style={styles.mediaButtonText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mediaButton} onPress={pickFromGallery}>
                  <ImageIcon size={24} color="#000" />
                  <Text style={styles.mediaButtonText}>Gallery</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.mediaPreview}>
                {mediaType === 'video' ? (
                  <View style={styles.videoPreview}>
                    <VideoIcon size={32} color="#666" />
                    <Text style={styles.videoText}>Video selected</Text>
                  </View>
                ) : (
                  <Image source={{ uri: selectedMedia }} style={styles.previewImage} resizeMode="cover" />
                )}
                <TouchableOpacity style={styles.removeButton} onPress={() => setSelectedMedia(null)}>
                  <X size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.createButton,
                (selectedFriends.size === 0 || !groupName.trim() || creating) && styles.createButtonDisabled,
              ]}
              onPress={handleCreateGroup}
              disabled={selectedFriends.size === 0 || !groupName.trim() || creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createButtonText}>Create Group</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  containerDesktop: {
    marginLeft: 240,
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
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
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
  },
  content: {
    flex: 1,
  },
  formSection: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f8f8f8',
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  selectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectionCount: {
    fontSize: 14,
    color: '#666',
  },
  friendsList: {
    backgroundColor: '#fff',
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  friendItemSelected: {
    backgroundColor: '#f8f8f8',
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  friendAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  friendUsername: {
    fontSize: 16,
    fontWeight: '500',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  mediaSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1a1a1a',
  },
  mediaButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  mediaButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  mediaButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  mediaPreview: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  videoPreview: {
    width: '100%',
    height: 200,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  videoText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 8,
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    marginTop: 16,
  },
  createButton: {
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.4,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
