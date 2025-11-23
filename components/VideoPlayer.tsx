import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { Play, Pause } from 'lucide-react-native';

interface VideoPlayerProps {
  uri: string;
  style?: any;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ uri, style }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, style]}>
        <video
          src={uri}
          controls
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            backgroundColor: '#000',
          }}
          onLoadStart={() => setLoading(true)}
          onLoadedData={() => setLoading(false)}
        />
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.placeholder}>
        <TouchableOpacity style={styles.playButton} onPress={togglePlay}>
          {isPlaying ? (
            <Pause size={48} color="#fff" fill="#fff" />
          ) : (
            <Play size={48} color="#fff" fill="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: '#000',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});
