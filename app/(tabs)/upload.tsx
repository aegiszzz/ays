import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { uploadToIPFS } from '@/lib/ipfs';
import { Camera, Image as ImageIcon, X } from 'lucide-react-native';

export default function UploadScreen() {
  const { user } = useAuth();
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const requestPermissions = async () => {
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
      alert('Sorry, we need camera and media library permissions to make this work!');
      return false;
    }
    return true;
  };

  const pickFromCamera = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
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
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedMedia(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const handleUpload = async () => {
    if (!selectedMedia || !user) return;

    setUploading(true);
    try {
      const fileInfo = await FileSystem.readAsStringAsync(selectedMedia, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const uint8Array = Uint8Array.from(atob(fileInfo), c => c.charCodeAt(0));

      const cid = await uploadToIPFS(uint8Array);

      const { error } = await supabase.from('media_shares').insert({
        user_id: user.id,
        ipfs_cid: cid,
        media_type: mediaType,
        caption: caption.trim() || null,
        is_public: isPublic,
      });

      if (error) throw error;

      setUploadSuccess(true);
      setTimeout(() => {
        setSelectedMedia(null);
        setCaption('');
        setIsPublic(true);
        setUploadSuccess(false);
      }, 2000);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Upload Media</Text>
        <Text style={styles.subtitle}>Share photos and videos via IPFS</Text>
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
      ) : (
        <View style={styles.uploadContainer}>
          <View style={styles.previewContainer}>
            <Image source={{ uri: selectedMedia }} style={styles.preview} resizeMode="cover" />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => setSelectedMedia(null)}>
              <X size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Caption (optional)</Text>
            <TextInput
              style={styles.input}
              value={caption}
              onChangeText={setCaption}
              placeholder="Add a caption..."
              multiline
              maxLength={500}
            />

            <View style={styles.switchContainer}>
              <Text style={styles.label}>Public</Text>
              <Switch value={isPublic} onValueChange={setIsPublic} />
            </View>

            <Text style={styles.helperText}>
              {isPublic
                ? 'Anyone can view this media'
                : 'Only users you share with can view'}
            </Text>

            {uploadSuccess ? (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>✓ Uploaded successfully!</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
                onPress={handleUpload}
                disabled={uploading}>
                {uploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.uploadButtonText}>Upload to IPFS</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
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
  uploadContainer: {
    padding: 20,
  },
  previewContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  preview: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    backgroundColor: '#ddd',
  },
  removeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    backgroundColor: '#fff',
    padding: 20,
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
    minHeight: 100,
    textAlignVertical: 'top',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  helperText: {
    fontSize: 14,
    color: '#666',
    marginTop: -8,
  },
  uploadButton: {
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  successContainer: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  successText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
