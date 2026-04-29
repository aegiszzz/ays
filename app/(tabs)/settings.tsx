import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRouter, useFocusEffect } from 'expo-router';
import { LogOut, Mail, Calendar, User as UserIcon, Wallet, Copy, Plus, Key, Eye, EyeOff, AlertTriangle, Shield, Lock, RefreshCw, HardDrive } from 'lucide-react-native';
import { generateWallet, encryptPrivateKey, decryptPrivateKey, shortenAddress, generateSolanaWallet, getWalletBalance, getSolanaBalance, authenticateWithBiometric } from '../../lib/wallet';
import * as Clipboard from 'expo-clipboard';
import { useStorage } from '@/hooks/useStorage';
import { useLanguage } from '@/contexts/LanguageContext';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { storageSummary, formatStorage, getStorageStatusColor } = useStorage();
  const { t } = useLanguage();
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [solanaWalletAddress, setSolanaWalletAddress] = useState<string | null>(null);
  const [bscBalance, setBscBalance] = useState<string>('0.0000');
  const [solanaBalance, setSolanaBalance] = useState<string>('0.0000');
  const [solanaBalanceError, setSolanaBalanceError] = useState<string | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [creatingSolanaWallet, setCreatingSolanaWallet] = useState(false);
  const [showPrivateKeyModal, setShowPrivateKeyModal] = useState(false);
  const [privateKey, setPrivateKey] = useState<string>('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [loadingPrivateKey, setLoadingPrivateKey] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [walletType, setWalletType] = useState<'bsc' | 'solana'>('bsc');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchUsername();
      }

      // Auto-refresh balances every 30 seconds while screen is focused
      const interval = setInterval(() => {
        if (walletAddress) fetchBscBalance(walletAddress);
        if (solanaWalletAddress) fetchSolanaBalance(solanaWalletAddress);
      }, 30000);

      return () => clearInterval(interval);
    }, [user, walletAddress, solanaWalletAddress])
  );

  const fetchUsername = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('username, wallet_address, solana_wallet_address, is_admin')
        .eq('id', user!.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setUsername(data.username);
        setWalletAddress(data.wallet_address);
        setSolanaWalletAddress(data.solana_wallet_address);
        setIsAdmin(data.is_admin || false);

        if (data.wallet_address) {
          fetchBscBalance(data.wallet_address);
        }
        if (data.solana_wallet_address) {
          fetchSolanaBalance(data.solana_wallet_address);
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBscBalance = async (address: string) => {
    try {
      setLoadingBalances(true);
      const walletInfo = await getWalletBalance(address);
      setBscBalance(parseFloat(walletInfo.balanceInEth).toFixed(4));
    } catch (error) {
      console.error('Error fetching BSC balance:', error);
    } finally {
      setLoadingBalances(false);
    }
  };

  const fetchSolanaBalance = async (address: string) => {
    try {
      console.log('Settings: Fetching Solana balance for:', address);
      setLoadingBalances(true);
      setSolanaBalanceError(null);
      const result = await getSolanaBalance(address);
      console.log('Settings: Received balance:', result.balance, 'error:', result.error);
      setSolanaBalance(result.balance);
      if (result.error) {
        setSolanaBalanceError(result.error);
      }
    } catch (error) {
      console.error('Error fetching Solana balance:', error);
      setSolanaBalanceError('Failed to fetch balance');
    } finally {
      setLoadingBalances(false);
    }
  };

  const createWallet = async () => {
    if (creatingWallet) return;

    setCreatingWallet(true);
    try {
      const wallet = await generateWallet();
      const encryptedKey = await encryptPrivateKey(wallet.privateKey, user!.id);

      const { error } = await supabase
        .from('users')
        .update({
          wallet_address: wallet.address,
          encrypted_private_key: encryptedKey,
        })
        .eq('id', user!.id);

      if (error) throw error;

      setWalletAddress(wallet.address);
      fetchBscBalance(wallet.address);
      Alert.alert('Success', 'BSC wallet created successfully!');
    } catch (error) {
      console.error('Error creating wallet:', error);
      Alert.alert('Error', 'Failed to create wallet. Please try again.');
    } finally {
      setCreatingWallet(false);
    }
  };

  const createSolanaWallet = async () => {
    if (creatingSolanaWallet) return;

    setCreatingSolanaWallet(true);
    try {
      const wallet = await generateSolanaWallet();
      const encryptedKey = await encryptPrivateKey(wallet.privateKey, user!.id);

      const { error } = await supabase
        .from('users')
        .update({
          solana_wallet_address: wallet.address,
          encrypted_solana_private_key: encryptedKey,
        })
        .eq('id', user!.id);

      if (error) throw error;

      setSolanaWalletAddress(wallet.address);
      fetchSolanaBalance(wallet.address);
      Alert.alert('Success', 'Solana wallet created successfully!');
    } catch (error) {
      console.error('Error creating Solana wallet:', error);
      Alert.alert('Error', 'Failed to create Solana wallet. Please try again.');
    } finally {
      setCreatingSolanaWallet(false);
    }
  };

  const copyWalletAddress = async (address: string | null) => {
    if (address) {
      if (Platform.OS === 'web') {
        navigator.clipboard.writeText(address);
        Alert.alert('Copied!', 'Wallet address copied to clipboard');
      } else {
        await Clipboard.setStringAsync(address);
        Alert.alert('Copied!', 'Wallet address copied to clipboard');
      }
    }
  };

  const exportPrivateKey = async (type: 'bsc' | 'solana') => {
    setLoadingPrivateKey(true);
    setWalletType(type);
    try {
      const auth = await authenticateWithBiometric();
      if (!auth.success) {
        Alert.alert('Authentication Required', auth.reason || 'Biometric authentication failed.');
        return;
      }

      const { data: keyData, error } = await supabase.rpc('get_my_private_key', { p_type: type });

      if (error) throw error;

      if (keyData) {
        try {
          const decrypted = await decryptPrivateKey(keyData, user!.id);
          setPrivateKey(decrypted);
        } catch {
          setPrivateKey(keyData);
        }
        setShowPrivateKeyModal(true);
      } else {
        Alert.alert('Error', `Private key not found. Please create a ${type === 'bsc' ? 'BSC' : 'Solana'} wallet first.`);
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to retrieve private key. Please try again.');
    } finally {
      setLoadingPrivateKey(false);
    }
  };

  const copyPrivateKey = async () => {
    if (privateKey) {
      if (Platform.OS === 'web') {
        navigator.clipboard.writeText(privateKey);
        Alert.alert('Copied!', 'Private key copied to clipboard');
      } else {
        await Clipboard.setStringAsync(privateKey);
        Alert.alert('Copied!', 'Private key copied to clipboard');
      }
    }
  };

  const closePrivateKeyModal = () => {
    setShowPrivateKeyModal(false);
    setPrivateKey('');
    setShowPrivateKey(false);
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      Alert.alert('Success', 'Password changed successfully');
      closePasswordModal();
    } catch (error: any) {
      console.error('Error changing password:', error);
      Alert.alert('Error', error.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#7A7A7E" />
      </View>
    );
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
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 70 : 90 }}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
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
        <Text style={styles.sectionTitle}>{t.settings.accountInfo}</Text>

        <View style={styles.infoCard}>
          {username && (
            <>
              <View style={styles.infoRow}>
                <UserIcon size={20} color="#666" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>{t.settings.username}</Text>
                  <Text style={styles.infoValue}>@{username}</Text>
                </View>
              </View>
              <View style={styles.divider} />
            </>
          )}

          <View style={styles.infoRow}>
            <Mail size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>{t.settings.email}</Text>
              <Text style={styles.infoValue}>{user.email || 'Not specified'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Calendar size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>{t.settings.memberSince}</Text>
              <Text style={styles.infoValue}>{createdAt}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.changePasswordButton}
          onPress={() => setShowPasswordModal(true)}
        >
          <Lock size={20} color="#007AFF" />
          <Text style={styles.changePasswordText}>{t.settings.changePassword}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.settings.storage}</Text>

        {storageSummary ? (
          <View style={styles.storageCard}>
            <View style={styles.storageHeader}>
              <HardDrive size={24} color="#007AFF" />
              <Text style={styles.storageTitle}>{t.settings.planFree}</Text>
            </View>

            <View style={styles.storageProgressContainer}>
              <View style={styles.storageProgressBar}>
                <View
                  style={[
                    styles.storageProgressFill,
                    {
                      width: `${Math.min(storageSummary.percentage_used, 100)}%`,
                      backgroundColor: getStorageStatusColor(storageSummary.percentage_used),
                    },
                  ]}
                />
              </View>
              <Text style={styles.storagePercentage}>{storageSummary.percentage_used}%</Text>
            </View>

            <View style={styles.storageDetails}>
              <View style={styles.storageDetailRow}>
                <Text style={styles.storageDetailLabel}>{t.settings.used}</Text>
                <Text style={styles.storageDetailValue}>{storageSummary.used_gb.toFixed(2)} GB</Text>
              </View>
              <View style={styles.storageDetailRow}>
                <Text style={styles.storageDetailLabel}>{t.settings.remaining}</Text>
                <Text style={styles.storageDetailValue}>{storageSummary.remaining_gb.toFixed(2)} GB</Text>
              </View>
              <View style={styles.storageDetailRow}>
                <Text style={styles.storageDetailLabel}>{t.settings.total}</Text>
                <Text style={styles.storageDetailValue}>{storageSummary.total_gb.toFixed(2)} GB</Text>
              </View>
            </View>

            {storageSummary.percentage_used >= 80 && (
              <View style={styles.storageWarning}>
                <AlertTriangle size={16} color="#F59E0B" />
                <Text style={styles.storageWarningText}>
                  {storageSummary.percentage_used >= 90
                    ? t.settings.storageAlmostFull
                    : t.settings.storageRunningLow}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.storageCard}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.storageLoadingText}>{t.settings.loadingStorage}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.settings.cryptoWallets}</Text>

        {walletAddress ? (
          <View style={styles.walletCard}>
            <View style={styles.walletHeader}>
              <View style={styles.walletTitleContainer}>
                <Wallet size={24} color="#F0B90B" />
                <Text style={styles.walletTitle}>{t.settings.bscWallet}</Text>
              </View>
              <TouchableOpacity
                onPress={() => fetchBscBalance(walletAddress)}
                style={styles.refreshButton}
                disabled={loadingBalances}
              >
                <RefreshCw size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.walletAddressContainer}>
              <Text style={styles.walletAddress}>{shortenAddress(walletAddress)}</Text>
              <TouchableOpacity onPress={() => copyWalletAddress(walletAddress)} style={styles.copyButton}>
                <Copy size={18} color="#007AFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.balanceContainer}>
              <Text style={styles.balanceLabel}>{t.settings.balance}</Text>
              {loadingBalances ? (
                <ActivityIndicator size="small" color="#FDFDFD" />
              ) : (
                <Text style={styles.balanceValue}>{bscBalance} BNB</Text>
              )}
            </View>
            <Text style={styles.walletNote}>{t.settings.bscNetwork}</Text>
            <TouchableOpacity
              style={styles.exportKeyButton}
              onPress={() => exportPrivateKey('bsc')}
              disabled={loadingPrivateKey}
            >
              {loadingPrivateKey ? (
                <ActivityIndicator size="small" color="#FF3B30" />
              ) : (
                <>
                  <Key size={18} color="#FF3B30" />
                  <Text style={styles.exportKeyText}>{t.settings.exportPrivateKey}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.walletCard}>
            <View style={styles.walletHeader}>
              <Wallet size={24} color="#666" />
              <Text style={styles.walletTitle}>{t.settings.noBscWallet}</Text>
            </View>
            <Text style={styles.walletNote}>{t.settings.bscDesc}</Text>
            <TouchableOpacity
              style={styles.createWalletButton}
              onPress={createWallet}
              disabled={creatingWallet}
            >
              {creatingWallet ? (
                <>
                  <Text style={styles.createWalletButtonText}>{t.settings.creating}</Text>
                </>
              ) : (
                <>
                  <Plus size={20} color="#FDFDFD" />
                  <Text style={styles.createWalletButtonText}>{t.settings.createBscWallet}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {solanaWalletAddress ? (
          <View style={[styles.walletCard, { marginTop: 12 }]}>
            <View style={styles.walletHeader}>
              <View style={styles.walletTitleContainer}>
                <Wallet size={24} color="#14F195" />
                <Text style={styles.walletTitle}>{t.settings.solanaWallet}</Text>
              </View>
              <TouchableOpacity
                onPress={() => fetchSolanaBalance(solanaWalletAddress)}
                style={styles.refreshButton}
                disabled={loadingBalances}
              >
                <RefreshCw size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.walletAddressContainer}>
              <Text style={styles.walletAddress}>{shortenAddress(solanaWalletAddress)}</Text>
              <TouchableOpacity onPress={() => copyWalletAddress(solanaWalletAddress)} style={styles.copyButton}>
                <Copy size={18} color="#007AFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.balanceContainer}>
              <Text style={styles.balanceLabel}>{t.settings.balance}</Text>
              {loadingBalances ? (
                <ActivityIndicator size="small" color="#FDFDFD" />
              ) : (
                <Text style={styles.balanceValue}>{solanaBalance} SOL</Text>
              )}
            </View>
            {solanaBalanceError && (
              <Text style={{ color: '#FF6B6B', fontSize: 11, marginTop: 4 }}>
                RPC Error: {solanaBalanceError}
              </Text>
            )}
            <Text style={styles.walletNote}>{t.settings.solanaNetwork}</Text>
            <TouchableOpacity
              style={styles.exportKeyButton}
              onPress={() => exportPrivateKey('solana')}
              disabled={loadingPrivateKey}
            >
              {loadingPrivateKey ? (
                <ActivityIndicator size="small" color="#FF3B30" />
              ) : (
                <>
                  <Key size={18} color="#FF3B30" />
                  <Text style={styles.exportKeyText}>{t.settings.exportPrivateKey}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.walletCard, { marginTop: 12 }]}>
            <View style={styles.walletHeader}>
              <Wallet size={24} color="#666" />
              <Text style={styles.walletTitle}>{t.settings.noSolanaWallet}</Text>
            </View>
            <Text style={styles.walletNote}>{t.settings.solanaDesc}</Text>
            <TouchableOpacity
              style={styles.createWalletButton}
              onPress={createSolanaWallet}
              disabled={creatingSolanaWallet}
            >
              {creatingSolanaWallet ? (
                <>
                  <Text style={styles.createWalletButtonText}>{t.settings.creating}</Text>
                </>
              ) : (
                <>
                  <Plus size={20} color="#FDFDFD" />
                  <Text style={styles.createWalletButtonText}>{t.settings.createSolanaWallet}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isAdmin && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.adminButton}
            onPress={() => router.push('/admin/dashboard')}
          >
            <Shield size={20} color="#007AFF" />
            <Text style={styles.adminButtonText}>{t.settings.adminPanel}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={20} color="#FF3B30" />
          <Text style={styles.signOutText}>{t.settings.signOut}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>v1.0.0 - Social Media Platform</Text>
      </View>

      <Modal
        visible={showPrivateKeyModal}
        transparent
        animationType="fade"
        onRequestClose={closePrivateKeyModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <AlertTriangle size={24} color="#FF3B30" />
              <Text style={styles.modalTitle}>{walletType === 'bsc' ? 'BSC' : 'Solana'} Private Key</Text>
            </View>

            <Text style={styles.warningText}>{t.settings.privateKeyWarning}</Text>

            <View style={styles.privateKeyContainer}>
              <Text style={styles.privateKeyText}>
                {showPrivateKey ? privateKey : '••••••••••••••••••••••••••••••••'}
              </Text>
              <TouchableOpacity
                onPress={() => setShowPrivateKey(!showPrivateKey)}
                style={styles.eyeButton}
              >
                {showPrivateKey ? (
                  <EyeOff size={20} color="#666" />
                ) : (
                  <Eye size={20} color="#666" />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.copyKeyButton}
                onPress={copyPrivateKey}
              >
                <Copy size={18} color="#FDFDFD" />
                <Text style={styles.copyKeyButtonText}>{t.settings.copyKey}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={closePrivateKeyModal}
              >
                <Text style={styles.closeModalButtonText}>{t.settings.close}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={closePasswordModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Lock size={24} color="#007AFF" />
              <Text style={styles.modalTitle}>{t.settings.changePasswordTitle}</Text>
            </View>

            <View style={styles.passwordInputContainer}>
              <Text style={styles.passwordLabel}>{t.settings.newPassword}</Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder={t.settings.newPassword}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  style={styles.eyeButton}
                >
                  {showNewPassword ? (
                    <EyeOff size={20} color="#666" />
                  ) : (
                    <Eye size={20} color="#666" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.passwordInputContainer}>
              <Text style={styles.passwordLabel}>{t.settings.confirmNewPassword}</Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder={t.settings.confirmNewPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeButton}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} color="#666" />
                  ) : (
                    <Eye size={20} color="#666" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.passwordHint}>{t.settings.passwordMin}</Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.changePasswordSubmitButton}
                onPress={handleChangePassword}
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <ActivityIndicator size="small" color="#FDFDFD" />
                ) : (
                  <Text style={styles.changePasswordSubmitButtonText}>{t.settings.changePassword}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={closePasswordModal}
              >
                <Text style={styles.closeModalButtonText}>{t.settings.cancel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0F',
  },
  header: {
    backgroundColor: '#141417',
    padding: 32,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#252528',
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
    backgroundColor: '#FDFDFD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#000',
  },
  name: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FDFDFD',
    marginBottom: 4,
  },
  handle: {
    fontSize: 16,
    color: '#7A7A7E',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FDFDFD',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#141417',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
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
    color: '#7A7A7E',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#FDFDFD',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#252528',
    marginVertical: 16,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#141417',
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
  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#141417',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00A0DC',
  },
  adminButtonText: {
    color: '#00A0DC',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#7A7A7E',
  },
  storageCard: {
    backgroundColor: '#141417',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  storageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  storageTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FDFDFD',
  },
  storageProgressContainer: {
    marginBottom: 16,
  },
  storageProgressBar: {
    height: 8,
    backgroundColor: '#252528',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  storageProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  storagePercentage: {
    fontSize: 14,
    color: '#7A7A7E',
    textAlign: 'right',
  },
  storageDetails: {
    borderTopWidth: 1,
    borderTopColor: '#252528',
    paddingTop: 16,
  },
  storageDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  storageDetailLabel: {
    fontSize: 14,
    color: '#7A7A7E',
  },
  storageDetailValue: {
    fontSize: 14,
    color: '#FDFDFD',
    fontWeight: '600',
  },
  storageWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#252528',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  storageWarningText: {
    fontSize: 14,
    color: '#F59E0B',
    fontWeight: '500',
  },
  storageLoadingText: {
    fontSize: 14,
    color: '#7A7A7E',
    marginTop: 8,
    textAlign: 'center',
  },
  walletCard: {
    backgroundColor: '#141417',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  walletTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FDFDFD',
  },
  refreshButton: {
    padding: 8,
    backgroundColor: '#1a3a52',
    borderRadius: 8,
  },
  walletAddressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#252528',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  walletAddress: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FDFDFD',
    fontFamily: 'monospace',
  },
  copyButton: {
    padding: 8,
    backgroundColor: '#1a3a52',
    borderRadius: 6,
  },
  walletNote: {
    fontSize: 12,
    color: '#7A7A7E',
    lineHeight: 18,
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#252528',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7A7A7E',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FDFDFD',
  },
  createWalletButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FDFDFD',
    padding: 14,
    borderRadius: 8,
    marginTop: 16,
  },
  createWalletButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  exportKeyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#252528',
  },
  exportKeyText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FF3B30',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#141417',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 450,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FDFDFD',
  },
  warningText: {
    fontSize: 14,
    color: '#FF3B30',
    backgroundColor: '#2c1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    lineHeight: 20,
  },
  privateKeyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252528',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    gap: 12,
  },
  privateKeyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#FDFDFD',
    lineHeight: 18,
  },
  eyeButton: {
    padding: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  copyKeyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FDFDFD',
    padding: 14,
    borderRadius: 8,
  },
  copyKeyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  closeModalButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#252528',
  },
  closeModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7A7A7E',
  },
  changePasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#141417',
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#00A0DC',
  },
  changePasswordText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#00A0DC',
  },
  passwordInputContainer: {
    marginBottom: 16,
  },
  passwordLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FDFDFD',
    marginBottom: 8,
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252528',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FDFDFD',
  },
  passwordHint: {
    fontSize: 12,
    color: '#7A7A7E',
    marginBottom: 20,
  },
  changePasswordSubmitButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00A0DC',
    padding: 14,
    borderRadius: 8,
  },
  changePasswordSubmitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FDFDFD',
  },
});
