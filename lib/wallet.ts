import { ethers } from 'ethers';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { Keypair, PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import Constants from 'expo-constants';

global.Buffer = global.Buffer || Buffer;

const PRIVATE_KEY_PREFIX = 'wallet_private_key_';
const SOLANA_PRIVATE_KEY_PREFIX = 'solana_wallet_private_key_';
const BSC_RPC_URL = 'https://bsc-dataseed1.binance.org';
const SOLANA_RPC_URLS = [
  'https://api.mainnet-beta.solana.com',
  'https://mainnet.helius-rpc.com/?api-key=public',
  'https://solana.public-rpc.com',
  'https://rpc.ankr.com/solana',
  'https://solana-api.projectserum.com'
];

// --- Web Crypto AES-GCM encryption helpers ---

const getEncryptionKey = async (userId: string, salt: Uint8Array): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(userId),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const encryptForWeb = async (plaintext: string, userId: string): Promise<string> => {
  const encoder = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey(userId, salt);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  return Buffer.from(combined).toString('base64');
};

const decryptForWeb = async (encryptedData: string, userId: string): Promise<string> => {
  const combined = Buffer.from(encryptedData, 'base64');
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const encrypted = combined.slice(28);
  const key = await getEncryptionKey(userId, salt);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  return new TextDecoder().decode(decrypted);
};

// --- Secure storage (native: SecureStore, web: AES-GCM encrypted localStorage) ---

const setSecureItem = async (key: string, value: string, userId?: string): Promise<void> => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (userId && window.crypto?.subtle) {
        const encrypted = await encryptForWeb(value, userId);
        window.localStorage.setItem(key, encrypted);
      } else {
        window.localStorage.setItem(key, value);
      }
    }
  } else {
    await SecureStore.setItemAsync(key, value);
  }
};

const getSecureItem = async (key: string, userId?: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(key);
      if (!stored) return null;
      if (userId && window.crypto?.subtle) {
        try {
          return await decryptForWeb(stored, userId);
        } catch {
          // Legacy unencrypted value — return as-is for backward compat
          return stored;
        }
      }
      return stored;
    }
    return null;
  } else {
    return await SecureStore.getItemAsync(key);
  }
};

// --- Public interfaces ---

export interface WalletInfo {
  address: string;
  balance: string;
  balanceInEth: string;
}

export interface Wallet {
  address: string;
  privateKey: string;
}

export interface SolanaWallet {
  address: string;
  privateKey: string;
}

export const generateWallet = async (): Promise<Wallet> => {
  try {
    const wallet = ethers.Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
    };
  } catch (error) {
    console.error('Error generating wallet:', error);
    throw new Error('Failed to generate wallet');
  }
};

export const shortenAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const createWallet = async (userId: string): Promise<string> => {
  try {
    const wallet = ethers.Wallet.createRandom();
    const privateKey = wallet.privateKey;
    const address = wallet.address;

    await setSecureItem(`${PRIVATE_KEY_PREFIX}${userId}`, privateKey, userId);

    return address;
  } catch (error) {
    console.error('Error creating wallet:', error);
    throw new Error('Failed to create wallet');
  }
};

export const getWalletAddress = async (userId: string): Promise<string | null> => {
  try {
    const privateKey = await getSecureItem(`${PRIVATE_KEY_PREFIX}${userId}`, userId);
    if (!privateKey) return null;

    const wallet = new ethers.Wallet(privateKey);
    return wallet.address;
  } catch (error) {
    console.error('Error getting wallet address:', error);
    return null;
  }
};

export const getWalletBalance = async (address: string): Promise<WalletInfo> => {
  try {
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const balance = await provider.getBalance(address);
    const balanceInEth = ethers.formatEther(balance);

    return {
      address,
      balance: balance.toString(),
      balanceInEth
    };
  } catch (error) {
    console.error('Error getting balance:', error);
    return {
      address,
      balance: '0',
      balanceInEth: '0.0'
    };
  }
};

export const generateSolanaWallet = async (): Promise<SolanaWallet> => {
  try {
    const keypair = Keypair.generate();
    const privateKeyArray = Array.from(keypair.secretKey);
    const privateKey = Buffer.from(privateKeyArray).toString('base64');

    return {
      address: keypair.publicKey.toString(),
      privateKey: privateKey,
    };
  } catch (error) {
    console.error('Error generating Solana wallet:', error);
    throw new Error('Failed to generate Solana wallet');
  }
};

export const getSolanaBalance = async (address: string): Promise<string> => {
  console.log('Fetching Solana balance for address:', address);

  try {
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;
    const anonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      console.error('Missing Supabase configuration');
      return '0.0000';
    }

    const apiUrl = `${supabaseUrl}/functions/v1/get-solana-balance?address=${encodeURIComponent(address)}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✓ Solana balance:', data.balance, 'SOL');

    return data.balance || '0.0000';
  } catch (error: any) {
    console.error('❌ Failed to get Solana balance:', error.message);
    return '0.0000';
  }
};

export const authenticateWithBiometric = async (): Promise<boolean> => {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return true;
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) {
      return true;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to access your wallet',
      fallbackLabel: 'Use passcode',
      disableDeviceFallback: false,
    });

    return result.success;
  } catch (error) {
    console.error('Biometric auth error:', error);
    return false;
  }
};

export const exportPrivateKey = async (userId: string): Promise<string | null> => {
  try {
    const authenticated = await authenticateWithBiometric();
    if (!authenticated) {
      throw new Error('Authentication failed');
    }

    const privateKey = await getSecureItem(`${PRIVATE_KEY_PREFIX}${userId}`, userId);
    return privateKey;
  } catch (error) {
    console.error('Error exporting private key:', error);
    return null;
  }
};

export const sendTransaction = async (
  userId: string,
  toAddress: string,
  amountInEth: string
): Promise<string> => {
  try {
    const authenticated = await authenticateWithBiometric();
    if (!authenticated) {
      throw new Error('Authentication failed');
    }

    const privateKey = await getSecureItem(`${PRIVATE_KEY_PREFIX}${userId}`, userId);
    if (!privateKey) {
      throw new Error('Wallet not found');
    }

    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: ethers.parseEther(amountInEth),
    });

    await tx.wait();
    return tx.hash;
  } catch (error: any) {
    console.error('Transaction error:', error);
    throw new Error(error?.message || 'Transaction failed');
  }
};

export const validateAddress = (address: string): boolean => {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
};
