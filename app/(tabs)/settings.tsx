import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { LogOut, Mail, Calendar, User as UserIcon, Wallet, Copy, QrCode, Send, Key } from 'lucide-react-native';
import { getWalletBalance } from '@/lib/wallet';
import { Alert, Modal, TextInput, ActivityIndicator, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import WithdrawModal from '@/components/WithdrawModal';
import PrivateKeyModal from '@/components/PrivateKeyModal';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState('0.0');
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showPrivateKeyModal, setShowPrivateKeyModal] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUsername();
    }
  }, [user]);

  const fetchUsername = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('username, wallet_address')
        .eq('id', user!.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setUsername(data.username);
        setWalletAddress(data.wallet_address);
        if (data.wallet_address) {
          fetchBalance(data.wallet_address);
        }
      }
    } catch (error) {
      console.error('Error fetching username:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalance = async (address: string) => {
    setLoadingBalance(true);
    try {
      const walletInfo = await getWalletBalance(address);
      setBalance(walletInfo.balanceInEth);
    } catch (error) {
      console.error('Error fetching balance:', error);
    } finally {
      setLoadingBalance(false);
    }
  };

  const copyAddress = async () => {
    if (walletAddress) {
      if (Platform.OS === 'web') {
        navigator.clipboard.writeText(walletAddress);
        Alert.alert('Copied', 'Wallet address copied to clipboard');
      } else {
        await Clipboard.setStringAsync(walletAddress);
        Alert.alert('Copied', 'Wallet address copied to clipboard');
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (!user) {
    return null;
  }

  const userName = user.user_metadata?.full_name || user.user_metadata?.name || 'User';
  const userHandle = user.user_metadata?.user_name || user.email?.split('@')[0] || '';
  const userAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const createdAt = new Date(user.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        {userAvatar ? (
          <Image source={{ uri: userAvatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.name}>{userName}</Text>
        {userHandle && <Text style={styles.handle}>@{userHandle}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Information</Text>

        <View style={styles.infoCard}>
          {username && (
            <>
              <View style={styles.infoRow}>
                <UserIcon size={20} color="#666" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Username</Text>
                  <Text style={styles.infoValue}>@{username}</Text>
                </View>
              </View>
              <View style={styles.divider} />
            </>
          )}

          <View style={styles.infoRow}>
            <Mail size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user.email || 'Not specified'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Calendar size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Member Since</Text>
              <Text style={styles.infoValue}>{createdAt}</Text>
            </View>
          </View>
        </View>
      </View>

      {walletAddress && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wallet</Text>

          <View style={styles.infoCard}>
            <View style={styles.walletHeader}>
              <Wallet size={24} color="#000" />
              <View style={styles.walletHeaderText}>
                <Text style={styles.walletTitle}>Your Crypto Wallet</Text>
                <Text style={styles.walletSubtitle}>EVM Compatible</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.balanceContainer}>
              <Text style={styles.balanceLabel}>Balance</Text>
              {loadingBalance ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.balanceValue}>{balance} ETH</Text>
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.addressContainer}>
              <Text style={styles.addressLabel}>Address</Text>
              <View style={styles.addressRow}>
                <Text style={styles.addressValue} numberOfLines={1}>
                  {walletAddress.slice(0, 12)}...{walletAddress.slice(-10)}
                </Text>
                <TouchableOpacity onPress={copyAddress} style={styles.iconButton}>
                  <Copy size={18} color="#666" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.walletActions}>
              <TouchableOpacity
                style={styles.walletActionButton}
                onPress={() => setShowDepositModal(true)}
              >
                <QrCode size={20} color="#000" />
                <Text style={styles.walletActionText}>Deposit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.walletActionButton}
                onPress={() => setShowWithdrawModal(true)}
              >
                <Send size={20} color="#000" />
                <Text style={styles.walletActionText}>Withdraw</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.privateKeyButton}
              onPress={() => setShowPrivateKeyModal(true)}
            >
              <Key size={18} color="#FF3B30" />
              <Text style={styles.privateKeyText}>Export Private Key</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={20} color="#FF3B30" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>v1.0.0 - Social Media Platform</Text>
      </View>

      <Modal visible={showDepositModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Deposit</Text>
            <Text style={styles.modalDescription}>
              Send ETH or ERC-20 tokens to this address:
            </Text>
            <View style={styles.modalAddressContainer}>
              <Text style={styles.modalAddress}>{walletAddress}</Text>
            </View>
            <TouchableOpacity style={styles.modalButton} onPress={copyAddress}>
              <Copy size={18} color="#fff" />
              <Text style={styles.modalButtonText}>Copy Address</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowDepositModal(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <WithdrawModal
        visible={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        userId={user!.id}
        currentBalance={balance}
        onSuccess={() => {
          if (walletAddress) {
            fetchBalance(walletAddress);
          }
        }}
      />

      <PrivateKeyModal
        visible={showPrivateKeyModal}
        onClose={() => setShowPrivateKeyModal(false)}
        userId={user!.id}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 32,
    paddingTop: 60,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
  },
  name: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  handle: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 16,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  signOutText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  walletHeaderText: {
    flex: 1,
  },
  walletTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  walletSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  balanceContainer: {
    paddingVertical: 8,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  addressContainer: {
    paddingVertical: 8,
  },
  addressLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressValue: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    fontFamily: 'monospace',
  },
  iconButton: {
    padding: 8,
  },
  walletActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  walletActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  walletActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  privateKeyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  privateKeyText: {
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  modalAddressContainer: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  modalAddress: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#1a1a1a',
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000',
    padding: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalCloseButton: {
    padding: 14,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#666',
  },
});
