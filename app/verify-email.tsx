import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Mail } from 'lucide-react-native';
import { consumePendingPassword } from '@/lib/authTemp';

export default function VerifyEmail() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 15 * 60 * 1000;

  const email = params.email as string;
  const userId = params.userId as string;
  const username = params.username as string;
  const isNewAccount = params.isNewAccount === 'true';
  const pendingPassword = consumePendingPassword();

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  useEffect(() => {
    if (email && userId) {
      resendCode();
    }
  }, []);

  const verifyCode = async () => {
    if (lockedUntil && Date.now() < lockedUntil) {
      const mins = Math.ceil((lockedUntil - Date.now()) / 60000);
      setError(`Too many attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`);
      return;
    }

    if (code.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/verify-email-code`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId, code, email, username }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        if (newAttempts >= MAX_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_MS);
          setError('Too many failed attempts. Please wait 15 minutes before trying again.');
        } else {
          setError(`Invalid or expired code. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts > 1 ? 's' : ''} remaining.`);
        }
        setLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: pendingPassword || '',
      });

      if (signInError) {
        router.replace('/');
        return;
      }

      router.replace('/(tabs)/');
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setResending(true);
    setError('');

    try {
      const { error: fnError } = await supabase.functions.invoke('send-verification-email', {
        body: { email, userId },
      });

      if (fnError) throw fnError;

      setCountdown(60);
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  const handleCancel = async () => {
    if (isNewAccount) {
      try {
        await supabase.from('users').delete().eq('id', userId);
        await supabase.from('verification_codes').delete().eq('user_id', userId);
      } catch (e) {
      }
    }
    router.replace('/');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Mail size={48} color="#007AFF" />
        </View>

        <Text style={styles.title}>Verify Your Email</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to{'\n'}
          <Text style={styles.emailText}>{email}</Text>
        </Text>

        <TextInput
          style={styles.input}
          placeholder="000000"
          placeholderTextColor="#636366"
          value={code}
          onChangeText={(text) => {
            setCode(text);
            setError('');
          }}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={verifyCode}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FDFDFD" />
          ) : (
            <Text style={styles.buttonText}>Verify Email</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resendButton}
          onPress={resendCode}
          disabled={countdown > 0 || resending}
        >
          {resending ? (
            <ActivityIndicator color="#007AFF" size="small" />
          ) : (
            <Text style={[styles.resendText, countdown > 0 && styles.resendTextDisabled]}>
              {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend verification code'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0F',
    justifyContent: 'center',
    padding: 20,
    alignItems: 'center',
  },
  content: {
    backgroundColor: '#141417',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#252528',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#252528',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FDFDFD',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#7A7A7E',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  emailText: {
    color: '#00A0DC',
    fontWeight: '600',
  },
  input: {
    width: '100%',
    backgroundColor: '#252528',
    borderWidth: 1,
    borderColor: '#252528',
    borderRadius: 8,
    padding: 16,
    fontSize: 24,
    color: '#FDFDFD',
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#00A0DC',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FDFDFD',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButton: {
    padding: 12,
    alignItems: 'center',
  },
  resendText: {
    color: '#00A0DC',
    fontSize: 14,
  },
  resendTextDisabled: {
    color: '#636366',
  },
  cancelButton: {
    padding: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: '#7A7A7E',
    fontSize: 14,
  },
});
