import { ethers } from 'ethers';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';

const PRIVATE_KEY_PREFIX = 'wallet_private_key_';
const RPC_URL = 'https://ethereum-rpc.publicnode.com';

export interface WalletInfo {
  address: string;
  balance: string;
  balanceInEth: string;
}

export interface Wallet {
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

    await SecureStore.setItemAsync(`${PRIVATE_KEY_PREFIX}${userId}`, privateKey);

    return address;
  } catch (error) {
    console.error('Error creating wallet:', error);
    throw new Error('Failed to create wallet');
  }
};

export const getWalletAddress = async (userId: string): Promise<string | null> => {
  try {
    const privateKey = await SecureStore.getItemAsync(`${PRIVATE_KEY_PREFIX}${userId}`);
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
    const provider = new ethers.JsonRpcProvider(RPC_URL);
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

    const privateKey = await SecureStore.getItemAsync(`${PRIVATE_KEY_PREFIX}${userId}`);
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

    const privateKey = await SecureStore.getItemAsync(`${PRIVATE_KEY_PREFIX}${userId}`);
    if (!privateKey) {
      throw new Error('Wallet not found');
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
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
