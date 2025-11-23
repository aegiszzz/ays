import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Send, AlertCircle } from 'lucide-react-native';
import { sendTransaction, validateAddress } from '@/lib/wallet';

interface WithdrawModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  currentBalance: string;
  onSuccess: () => void;
}

export default function WithdrawModal({
  visible,
  onClose,
  userId,
  currentBalance,
  onSuccess,
}: WithdrawModalProps) {
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleWithdraw = async () => {
    setError('');

    if (!toAddress.trim()) {
      setError('Please enter a recipient address');
      return;
    }

    if (!validateAddress(toAddress)) {
      setError('Invalid Ethereum address');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (parseFloat(amount) > parseFloat(currentBalance)) {
      setError('Insufficient balance');
      return;
    }

    setSending(true);

    try {
      const txHash = await sendTransaction(userId, toAddress, amount);

      Alert.alert(
        'Success',
        `Transaction sent!\n\nHash: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`,
        [
          {
            text: 'OK',
            onPress: () => {
              setToAddress('');
              setAmount('');
              onSuccess();
              onClose();
            },
          },
        ]
      );
    } catch (error: any) {
      setError(error?.message || 'Transaction failed');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    if (!sending) {
      setToAddress('');
      setAmount('');
      setError('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Send size={24} color="#000" />
            <Text style={styles.title}>Withdraw ETH</Text>
          </View>

          <Text style={styles.balanceText}>
            Available: {currentBalance} ETH
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Recipient Address</Text>
            <TextInput
              style={styles.input}
              placeholder="0x..."
              placeholderTextColor="#999"
              value={toAddress}
              onChangeText={setToAddress}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!sending}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Amount (ETH)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.0"
              placeholderTextColor="#999"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              editable={!sending}
            />
            <TouchableOpacity
              style={styles.maxButton}
              onPress={() => setAmount(currentBalance)}
              disabled={sending}
            >
              <Text style={styles.maxButtonText}>MAX</Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <AlertCircle size={16} color="#FF3B30" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.warningContainer}>
            <AlertCircle size={16} color="#FF9500" />
            <Text style={styles.warningText}>
              Double-check the address. Transactions cannot be reversed.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.sendButton, sending && styles.sendButtonDisabled]}
            onPress={handleWithdraw}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Send size={20} color="#fff" />
                <Text style={styles.sendButtonText}>Send Transaction</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleClose}
            disabled={sending}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  balanceText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
    position: 'relative',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    padding: 14,
    borderRadius: 8,
    fontSize: 16,
    color: '#1a1a1a',
  },
  maxButton: {
    position: 'absolute',
    right: 12,
    top: 38,
    backgroundColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  maxButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFE5E5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#FF3B30',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF5E5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#FF9500',
    lineHeight: 18,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  cancelButton: {
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
  },
});
