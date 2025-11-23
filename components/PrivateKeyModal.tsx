import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { Key, Eye, EyeOff, Copy, AlertTriangle } from 'lucide-react-native';
import { exportPrivateKey } from '@/lib/wallet';
import * as Clipboard from 'expo-clipboard';

interface PrivateKeyModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
}

export default function PrivateKeyModal({
  visible,
  onClose,
  userId,
}: PrivateKeyModalProps) {
  const [loading, setLoading] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleExport = async () => {
    if (!confirmed) {
      Alert.alert(
        'Confirmation Required',
        'Please read and understand the warning before proceeding.'
      );
      return;
    }

    setLoading(true);
    try {
      const key = await exportPrivateKey(userId);
      if (key) {
        setPrivateKey(key);
      } else {
        Alert.alert('Error', 'Authentication failed or private key not found');
        onClose();
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to export private key');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const copyPrivateKey = async () => {
    if (privateKey) {
      if (Platform.OS === 'web') {
        navigator.clipboard.writeText(privateKey);
        Alert.alert('Copied', 'Private key copied to clipboard');
      } else {
        await Clipboard.setStringAsync(privateKey);
        Alert.alert('Copied', 'Private key copied to clipboard');
      }
    }
  };

  const handleClose = () => {
    setPrivateKey(null);
    setShowKey(false);
    setConfirmed(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Key size={24} color="#FF3B30" />
            <Text style={styles.title}>Export Private Key</Text>
          </View>

          {!privateKey ? (
            <>
              <View style={styles.warningContainer}>
                <AlertTriangle size={24} color="#FF3B30" />
                <View style={styles.warningContent}>
                  <Text style={styles.warningTitle}>Critical Warning</Text>
                  <Text style={styles.warningText}>
                    • Never share your private key with anyone{'\n'}
                    • Anyone with your private key can steal your funds{'\n'}
                    • Store it securely offline{'\n'}
                    • We will never ask for your private key
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => setConfirmed(!confirmed)}
              >
                <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
                  {confirmed && <View style={styles.checkboxInner} />}
                </View>
                <Text style={styles.checkboxLabel}>
                  I understand the risks and will keep my private key secure
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.exportButton, !confirmed && styles.exportButtonDisabled]}
                onPress={handleExport}
                disabled={loading || !confirmed}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Key size={20} color="#fff" />
                    <Text style={styles.exportButtonText}>
                      Export Private Key
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.keyContainer}>
                <Text style={styles.keyLabel}>Your Private Key</Text>
                <View style={styles.keyBox}>
                  <Text style={[styles.keyText, !showKey && styles.keyTextBlurred]}>
                    {showKey ? privateKey : '••••••••••••••••••••••••••••••••'}
                  </Text>
                </View>
                <View style={styles.keyActions}>
                  <TouchableOpacity
                    style={styles.keyActionButton}
                    onPress={() => setShowKey(!showKey)}
                  >
                    {showKey ? (
                      <>
                        <EyeOff size={18} color="#666" />
                        <Text style={styles.keyActionText}>Hide</Text>
                      </>
                    ) : (
                      <>
                        <Eye size={18} color="#666" />
                        <Text style={styles.keyActionText}>Show</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.keyActionButton}
                    onPress={copyPrivateKey}
                  >
                    <Copy size={18} color="#666" />
                    <Text style={styles.keyActionText}>Copy</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.reminderContainer}>
                <AlertTriangle size={16} color="#FF9500" />
                <Text style={styles.reminderText}>
                  Make sure you're in a private location before revealing your key
                </Text>
              </View>
            </>
          )}

          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  warningContainer: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#FFE5E5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF3B30',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#FF3B30',
    lineHeight: 20,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 24,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    borderColor: '#000',
    backgroundColor: '#000',
  },
  checkboxInner: {
    width: 10,
    height: 10,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    lineHeight: 20,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF3B30',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  keyContainer: {
    marginBottom: 20,
  },
  keyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  keyBox: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  keyText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#1a1a1a',
    lineHeight: 18,
  },
  keyTextBlurred: {
    fontSize: 16,
    letterSpacing: 2,
  },
  keyActions: {
    flexDirection: 'row',
    gap: 12,
  },
  keyActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  keyActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  reminderContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF5E5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  reminderText: {
    flex: 1,
    fontSize: 12,
    color: '#FF9500',
    lineHeight: 18,
  },
  closeButton: {
    padding: 16,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#666',
  },
});
