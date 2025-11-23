import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import { LogOut, Mail, Calendar, User as UserIcon, Wallet, Copy, Plus } from 'lucide-react-native';
import { generateWallet, encryptPrivateKey, shortenAddress } from '../../lib/wallet';
import { Alert, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [creatingWallet, setCreatingWallet] = useState(false);

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
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const createWallet = async () => {
    if (creatingWallet) return;

    setCreatingWallet(true);
    try {
      const wallet = await generateWallet();
      const encryptedKey = encryptPrivateKey(wallet.privateKey, user!.id);

      const { error } = await supabase
        .from('users')
        .update({
          wallet_address: wallet.address,
          encrypted_private_key: encryptedKey,
        })
        .eq('id', user!.id);

      if (error) throw error;

      setWalletAddress(wallet.address);
      Alert.alert('Success', 'Crypto wallet created successfully!');
    } catch (error) {
      console.error('Error creating wallet:', error);
      Alert.alert('Error', 'Failed to create wallet. Please try again.');
    } finally {
      setCreatingWallet(false);
    }
  };

  const copyWalletAddress = async () => {
    if (walletAddress) {
      if (Platform.OS === 'web') {
        navigator.clipboard.writeText(walletAddress);
        Alert.alert('Copied!', 'Wallet address copied to clipboard');
      } else {
        await Clipboard.setStringAsync(walletAddress);
        Alert.alert('Copied!', 'Wallet address copied to clipboard');
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Crypto Wallet</Text>

        {walletAddress ? (
          <View style={styles.walletCard}>
            <View style={styles.walletHeader}>
              <Wallet size={24} color="#000" />
              <Text style={styles.walletTitle}>EVM Wallet</Text>
            </View>
            <View style={styles.walletAddressContainer}>
              <Text style={styles.walletAddress}>{shortenAddress(walletAddress)}</Text>
              <TouchableOpacity onPress={copyWalletAddress} style={styles.copyButton}>
                <Copy size={18} color="#007AFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.walletNote}>
              Compatible with Ethereum, Polygon, BSC, and all EVM chains.
            </Text>
          </View>
        ) : (
          <View style={styles.walletCard}>
            <View style={styles.walletHeader}>
              <Wallet size={24} color="#666" />
              <Text style={styles.walletTitle}>No Wallet Yet</Text>
            </View>
            <Text style={styles.walletNote}>
              Create a crypto wallet to receive and send tokens on EVM-compatible chains.
            </Text>
            <TouchableOpacity
              style={styles.createWalletButton}
              onPress={createWallet}
              disabled={creatingWallet}
            >
              {creatingWallet ? (
                <>
                  <Text style={styles.createWalletButtonText}>Creating...</Text>
                </>
              ) : (
                <>
                  <Plus size={20} color="#fff" />
                  <Text style={styles.createWalletButtonText}>Create Wallet</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={20} color="#FF3B30" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>v1.0.0 - Social Media Platform</Text>
      </View>
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
  walletCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  walletTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  walletAddressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  walletAddress: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    fontFamily: 'monospace',
  },
  copyButton: {
    padding: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
  },
  walletNote: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  createWalletButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000',
    padding: 14,
    borderRadius: 8,
    marginTop: 16,
  },
  createWalletButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
