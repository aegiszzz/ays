import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Download, X } from 'lucide-react-native';
import { usePWA } from '../hooks/usePWA';

export default function InstallPrompt() {
  const { canInstall, isInstalled, promptInstall } = usePWA();
  const [dismissed, setDismissed] = useState(false);

  if (Platform.OS !== 'web' || isInstalled || !canInstall || dismissed) {
    return null;
  }

  const handleInstall = async () => {
    const installed = await promptInstall();
    if (!installed) {
      setDismissed(true);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Download size={24} color="#fff" />
        <View style={styles.textContainer}>
          <Text style={styles.title}>Install App</Text>
          <Text style={styles.description}>
            Add to your home screen for quick access
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={handleInstall} style={styles.installButton}>
          <Text style={styles.installText}>Install</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setDismissed(true)} style={styles.closeButton}>
          <X size={20} color="#666" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000',
    padding: 16,
    gap: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    color: '#aaa',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  installButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  installText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  closeButton: {
    padding: 4,
  },
});
