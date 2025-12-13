import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ArrowLeft } from 'lucide-react-native';

export default function VerifyEmail() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const email = params.email as string;
  const userId = params.userId as string;
  const encodedPassword = params.password as string;

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const verifyCode = async () => {
    if (code.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('verification_codes')
        .select('*')
        .eq('user_id', userId)
        .eq('code', code)
        .eq('verified', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        Alert.alert('Error', 'Invalid or expired code');
        return;
      }

      const { error: updateError } = await supabase
        .from('verification_codes')
        .update({ verified: true })
        .eq('id', data.id);

      if (updateError) {
        throw updateError;
      }

      const password = atob(encodedPassword);

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        Alert.alert('Verified', 'Email verified! Please sign in.', [
          { text: 'OK', onPress: () => router.replace('/') }
        ]);
        return;
      }

      router.replace('/(tabs)/');
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setResending(true);
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-verification-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, userId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to send code');
      }

      setCountdown(60);
      Alert.alert('Success', 'New verification code sent');
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.replace('/')}
      >
        <ArrowLeft color="#fff" size={24} />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>Email Verification</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code sent to {email}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="000000"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={verifyCode}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Verify</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resendButton}
          onPress={resendCode}
          disabled={countdown > 0 || resending}
        >
          {resending ? (
            <ActivityIndicator color="#007AFF" />
          ) : (
            <Text style={[styles.resendText, countdown > 0 && styles.resendTextDisabled]}>
              {countdown > 0 ? `Resend (${countdown}s)` : 'Resend code'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backButton: {
    position: 'absolute',
    top: 48,
    left: 16,
    zIndex: 1,
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  resendButton: {
    padding: 16,
    alignItems: 'center',
  },
  resendText: {
    color: '#007AFF',
    fontSize: 16,
  },
  resendTextDisabled: {
    color: '#666',
  },
});
