import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, Link as LinkIcon, User as UserIcon } from 'lucide-react-native';
import { uploadToIPFS } from '@/lib/ipfs';

interface UserProfile {
  username: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  website: string | null;
}

export default function EditProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('username, name, bio, avatar_url, cover_image_url, website')
        .eq('id', user!.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setUsername(data.username || '');
        setName(data.name || '');
        setBio(data.bio || '');
        setWebsite(data.website || '');
        setAvatarUrl(data.avatar_url);
        setCoverImageUrl(data.cover_image_url);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async (type: 'avatar' | 'cover') => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: type === 'avatar' ? [1, 1] : [16, 9],
        quality: 0.6,
        base64: false,
        exif: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];

        if (type === 'avatar') {
          setUploadingAvatar(true);
        } else {
          setUploadingCover(true);
        }

        const ipfsCid = await uploadToIPFS(asset.uri);

        if (type === 'avatar') {
          setAvatarUrl(ipfsCid);
          setUploadingAvatar(false);
        } else {
          setCoverImageUrl(ipfsCid);
          setUploadingCover(false);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      if (type === 'avatar') {
        setUploadingAvatar(false);
      } else {
        setUploadingCover(false);
      }
    }
  };

  const handleSave = async () => {
    if (!user) return;

    if (bio.length > 200) {
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from('users')
        .update({
          name: name.trim() || null,
          bio: bio.trim() || null,
          website: website.trim() || null,
          avatar_url: avatarUrl,
          cover_image_url: coverImageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      router.back();
    } catch (error: any) {
      console.error('Error updating profile:', error);
    } finally {
      setSaving(false);
    }
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.saveButton, saving && styles.saveButtonDisabled]}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.coverContainer}>
          <TouchableOpacity
            style={styles.coverImageButton}
            onPress={() => pickImage('cover')}
            disabled={uploadingCover}
          >
            {coverImageUrl ? (
              <Image
                source={{ uri: `https://gateway.pinata.cloud/ipfs/${coverImageUrl}` }}
                style={styles.coverImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Camera size={32} color="#999" />
                <Text style={styles.coverPlaceholderText}>Add Cover Photo</Text>
              </View>
            )}
            {uploadingCover && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => pickImage('avatar')}
            disabled={uploadingAvatar}
          >
            {avatarUrl ? (
              <Image
                source={{ uri: `https://gateway.pinata.cloud/ipfs/${avatarUrl}` }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <UserIcon size={40} color="#999" />
              </View>
            )}
            {uploadingAvatar && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
            <View style={styles.cameraIcon}>
              <Camera size={16} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Username</Text>
            <View style={styles.disabledInput}>
              <Text style={styles.disabledInputText}>@{username || 'username'}</Text>
            </View>
            <Text style={styles.helper}>Username cannot be changed</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
              maxLength={50}
            />
          </View>

          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Bio</Text>
              <Text style={styles.charCount}>{bio.length}/200</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell us about yourself"
              multiline
              maxLength={200}
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Website</Text>
            <View style={styles.inputWithIcon}>
              <LinkIcon size={20} color="#666" />
              <TextInput
                style={styles.inputField}
                value={website}
                onChangeText={setWebsite}
                placeholder="https://example.com"
                autoCapitalize="none"
                keyboardType="url"
                maxLength={100}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  saveButtonDisabled: {
    color: '#3a3a3c',
  },
  content: {
    flex: 1,
  },
  coverContainer: {
    height: 200,
    backgroundColor: '#2c2c2e',
  },
  coverImageButton: {
    width: '100%',
    height: '100%',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
  },
  coverPlaceholderText: {
    marginTop: 8,
    fontSize: 14,
    color: '#8e8e93',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: -50,
    marginBottom: 24,
  },
  avatarButton: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#fff',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2c2c2e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#000000',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  form: {
    padding: 16,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  charCount: {
    fontSize: 12,
    color: '#8e8e93',
  },
  input: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#ffffff',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  inputField: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#ffffff',
  },
  helper: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 4,
  },
  disabledInput: {
    backgroundColor: '#2c2c2e',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3a3a3c',
  },
  disabledInputText: {
    fontSize: 16,
    color: '#8e8e93',
  },
});
