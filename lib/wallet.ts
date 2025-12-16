import { ethers } from 'ethers';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

global.Buffer = global.Buffer || Buffer;

const PRIVATE_KEY_PREFIX = 'wallet_private_key_';
const SOLANA_PRIVATE_KEY_PREFIX = 'solana_wallet_private_key_';
const BSC_RPC_URL = 'https://bsc-dataseed1.binance.org';
const SOLANA_RPC_URLS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-api.projectserum.com',
  'https://rpc.ankr.com/solana'
];

const setSecureItem = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } else {
    await SecureStore.setItemAsync(key, value);
  }
};

const getSecureItem = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return null;
  } else {
    return await SecureStore.getItemAsync(key);
  }
};

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

export const encryptPrivateKey = (privateKey: string, userId: string): string => {
  try {
    return privateKey;
  } catch (error) {
    console.error('Error encrypting private key:', error);
    throw new Error('Failed to encrypt private key');
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

    await setSecureItem(`${PRIVATE_KEY_PREFIX}${userId}`, privateKey);

    return address;
  } catch (error) {
    console.error('Error creating wallet:', error);
    throw new Error('Failed to create wallet');
  }
};

export const getWalletAddress = async (userId: string): Promise<string | null> => {
  try {
    const privateKey = await getSecureItem(`${PRIVATE_KEY_PREFIX}${userId}`);
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

  for (let i = 0; i < SOLANA_RPC_URLS.length; i++) {
    const rpcUrl = SOLANA_RPC_URLS[i];
    try {
      console.log(`Trying RPC endpoint ${i + 1}/${SOLANA_RPC_URLS.length}:`, rpcUrl);
      const connection = new Connection(rpcUrl, 'confirmed');
      const publicKey = new PublicKey(address);
      const balance = await connection.getBalance(publicKey);
      console.log('Raw balance (lamports):', balance);
      const balanceInSol = balance / LAMPORTS_PER_SOL;
      console.log('Balance in SOL:', balanceInSol);

      return balanceInSol.toFixed(4);
    } catch (error) {
      console.error(`Error with RPC ${rpcUrl}:`, error);
      if (i === SOLANA_RPC_URLS.length - 1) {
        console.error('All RPC endpoints failed');
        return '0.0000';
      }
    }
  }

  return '0.0000';
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

    const privateKey = await getSecureItem(`${PRIVATE_KEY_PREFIX}${userId}`);
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

    const privateKey = await getSecureItem(`${PRIVATE_KEY_PREFIX}${userId}`);
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
