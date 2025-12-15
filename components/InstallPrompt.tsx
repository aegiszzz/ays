import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Share, X } from 'lucide-react-native';

const INSTALL_DISMISSED_KEY = 'ays_install_dismissed';

function isMobileBrowser(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent || navigator.vendor || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;

  return isMobile && !isStandalone;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(userAgent);
}

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || '';
  return /Android/i.test(userAgent);
}

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    try {
      const wasDismissed = localStorage.getItem(INSTALL_DISMISSED_KEY);
      if (wasDismissed !== 'true' && isMobileBrowser()) {
        setShowPrompt(true);
      }
    } catch {
      if (isMobileBrowser()) {
        setShowPrompt(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
    } catch {}
    setShowPrompt(false);
  };

  if (!showPrompt || Platform.OS !== 'web') {
    return null;
  }

  const iosDevice = isIOS();
  const androidDevice = isAndroid();

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeIcon} onPress={handleDismiss}>
          <X size={24} color="#666" />
        </TouchableOpacity>

        <Text style={styles.title}>Install the app for easier access!</Text>

        <View style={styles.steps}>
          {iosDevice ? (
            <>
              <View style={styles.step}>
                <Text style={styles.stepNumber}>1.</Text>
                <Text style={styles.stepText}>Tap on the </Text>
                <View style={styles.iconBox}>
                  <Share size={20} color="#007AFF" />
                </View>
                <Text style={styles.stepText}> button in the browser menu</Text>
              </View>

              <View style={styles.step}>
                <Text style={styles.stepNumber}>2.</Text>
                <Text style={styles.stepText}>Scroll down and select add to homescreen</Text>
              </View>

              <View style={styles.step}>
                <Text style={styles.stepNumber}>3.</Text>
                <Text style={styles.stepText}>Look for the </Text>
                <View style={styles.appIconContainer}>
                  <Image
                    source={require('../assets/images/icon.png')}
                    style={styles.appIcon}
                  />
                </View>
                <Text style={styles.stepText}> icon on your homescreen</Text>
              </View>
            </>
          ) : androidDevice ? (
            <>
              <View style={styles.step}>
                <Text style={styles.stepNumber}>1.</Text>
                <Text style={styles.stepText}>Tap the menu button (three dots) in your browser</Text>
              </View>

              <View style={styles.step}>
                <Text style={styles.stepNumber}>2.</Text>
                <Text style={styles.stepText}>Select "Add to Home screen" or "Install app"</Text>
              </View>

              <View style={styles.step}>
                <Text style={styles.stepNumber}>3.</Text>
                <Text style={styles.stepText}>Look for the </Text>
                <View style={styles.appIconContainer}>
                  <Image
                    source={require('../assets/images/icon.png')}
                    style={styles.appIcon}
                  />
                </View>
                <Text style={styles.stepText}> icon on your homescreen</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.step}>
                <Text style={styles.stepNumber}>1.</Text>
                <Text style={styles.stepText}>Open your browser menu</Text>
              </View>

              <View style={styles.step}>
                <Text style={styles.stepNumber}>2.</Text>
                <Text style={styles.stepText}>Select "Add to Home screen" or "Install"</Text>
              </View>

              <View style={styles.step}>
                <Text style={styles.stepNumber}>3.</Text>
                <Text style={styles.stepText}>Look for the Ays icon on your homescreen</Text>
              </View>
            </>
          )}
        </View>

        <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
          <Text style={styles.dismissButtonText}>I already installed the app</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    position: 'relative',
  },
  closeIcon: {
    position: 'absolute',
    top: -40,
    right: 0,
    padding: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 40,
  },
  steps: {
    gap: 24,
    marginBottom: 48,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  stepNumber: {
    fontSize: 18,
    color: '#007AFF',
    marginRight: 8,
    fontWeight: '500',
  },
  stepText: {
    fontSize: 18,
    color: '#999',
  },
  iconBox: {
    width: 36,
    height: 36,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  appIconContainer: {
    width: 36,
    height: 36,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    overflow: 'hidden',
    marginHorizontal: 4,
  },
  appIcon: {
    width: 36,
    height: 36,
  },
  dismissButton: {
    backgroundColor: '#FF6B35',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 50,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
