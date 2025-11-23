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

interface Friend {
  id: string;
  username: string;
  avatar_url: string | null;
}

export default function GroupShareScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [showGroupCreation, setShowGroupCreation] = useState(false);

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

    if (!selectedMedia || !user) return;

    setUploading(true);

    try {
      const cid = await uploadToIPFS(selectedMedia, mediaType);

      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: groupName.trim(),
          created_by: user.id,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      const memberInserts = [
        { group_id: groupData.id, user_id: user.id },
        ...Array.from(selectedFriends).map((friendId) => ({
          group_id: groupData.id,
          user_id: friendId,
        })),
      ];

      const { error: membersError } = await supabase.from('group_members').insert(memberInserts);

      if (membersError) throw membersError;

      const { error: messageError } = await supabase.from('group_messages').insert({
        group_id: groupData.id,
        sender_id: user.id,
        message_text: caption.trim() || null,
        media_type: mediaType,
        ipfs_cid: cid,
      });

      if (messageError) throw messageError;

      Alert.alert('Success', 'Group created and media shared!');
      router.back();
    } catch (error) {
      console.error('Group creation error:', error);
      Alert.alert('Error', 'Failed to create group. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleNext = () => {
    if (selectedFriends.size === 0) {
      Alert.alert('Error', 'Please select at least one friend to create a group');
      return;
    }
    setShowGroupCreation(true);
  };

  if (!user) {
    return null;
  }

  if (showGroupCreation && selectedMedia) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setShowGroupCreation(false)}
            style={styles.backButton}
          >
            <ArrowLeft size={24} color="#000" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Create Group</Text>
            <Text style={styles.subtitle}>
              {selectedFriends.size} friend{selectedFriends.size !== 1 ? 's' : ''} selected
            </Text>
          </View>
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.previewContainer}>
            {mediaType === 'video' ? (
              <View style={styles.videoPreview}>
                <VideoIcon size={48} color="#666" />
                <Text style={styles.videoText}>Video selected</Text>
              </View>
            ) : (
              <Image source={{ uri: selectedMedia }} style={styles.preview} resizeMode="cover" />
            )}
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Group Name</Text>
            <TextInput
              style={styles.input}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Enter group name..."
              maxLength={50}
            />

            <Text style={styles.label}>Caption (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={caption}
              onChangeText={setCaption}
              placeholder="Add a caption..."
              multiline
              maxLength={500}
            />

            <TouchableOpacity
              style={[styles.createButton, uploading && styles.createButtonDisabled]}
              onPress={handleCreateGroup}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createButtonText}>Create Group & Share</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Share with Group</Text>
          <Text style={styles.subtitle}>Select friends to create a group</Text>
        </View>
      </View>

      {!selectedMedia ? (
        <View style={styles.pickerContainer}>
          <TouchableOpacity style={styles.pickerButton} onPress={pickFromCamera}>
            <Camera size={32} color="#000" />
            <Text style={styles.pickerButtonText}>Take Photo/Video</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.pickerButton} onPress={pickFromGallery}>
            <ImageIcon size={32} color="#000" />
            <Text style={styles.pickerButtonText}>Choose from Gallery</Text>
          </TouchableOpacity>
        </View>
      ) : loadingFriends ? (
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
        <View style={styles.content}>
          <View style={styles.selectionHeader}>
            <Text style={styles.selectionTitle}>Select Friends</Text>
            <Text style={styles.selectionCount}>
              {selectedFriends.size} selected
            </Text>
          </View>

          <ScrollView style={styles.friendsList}>
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
                  <View
                    style={[styles.checkbox, isSelected && styles.checkboxSelected]}
                  >
                    {isSelected && <Check size={16} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.nextButton,
                selectedFriends.size === 0 && styles.nextButtonDisabled,
              ]}
              onPress={handleNext}
              disabled={selectedFriends.size === 0}
            >
              <Text style={styles.nextButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  pickerContainer: {
    padding: 20,
    gap: 16,
  },
  pickerButton: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pickerButtonText: {
    fontSize: 16,
    fontWeight: '600',
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
    flex: 1,
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
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  nextButton: {
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.4,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  previewContainer: {
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  preview: {
    width: '100%',
    height: 300,
  },
  videoPreview: {
    width: '100%',
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  videoText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
  },
  form: {
    padding: 16,
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    gap: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  createButton: {
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
