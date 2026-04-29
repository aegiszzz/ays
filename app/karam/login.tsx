import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Lock, Mail, Shield } from 'lucide-react-native';

type Step = 'credentials' | 'totp-enroll' | 'totp-verify';

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [step, setStep] = useState<Step>('credentials');
  const [qrUri, setQrUri] = useState('');
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  React.useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userData } = await supabase
          .from('users')
          .select('is_admin')
          .eq('id', user.id)
          .maybeSingle();
        if (userData?.is_admin) {
          router.replace('/karam/dashboard');
          return;
        }
      }
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Login failed');

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (userError) throw userError;

      if (!userData?.is_admin) {
        await supabase.auth.signOut();
        Alert.alert('Access Denied', 'You do not have admin privileges');
        return;
      }

      // Check if TOTP is enrolled for this admin account
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      const totpFactor = factorsData?.totp?.find(f => f.status === 'verified');

      if (!totpFactor) {
        // No verified TOTP — enroll now
        const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'Admin TOTP',
        });
        if (enrollError) throw enrollError;
        setFactorId(enrollData.id);
        setQrUri(enrollData.totp.qr_code);
        setStep('totp-enroll');
      } else {
        // Already enrolled — challenge
        setFactorId(totpFactor.id);
        const { data: challengeData, error: challengeError } =
          await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
        if (challengeError) throw challengeError;
        setChallengeId(challengeData.id);
        setStep('totp-verify');
      }
    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEnrollVerify = async () => {
    if (!totpCode || totpCode.length !== 6) {
      Alert.alert('Error', 'Enter the 6-digit code from your authenticator app');
      return;
    }
    setLoading(true);
    try {
      // Challenge then verify to finalise enrollment
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: totpCode,
      });
      if (verifyError) throw verifyError;

      router.replace('/karam/dashboard');
    } catch (error: any) {
      Alert.alert('Verification Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTotpVerify = async () => {
    if (!totpCode || totpCode.length !== 6) {
      Alert.alert('Error', 'Enter the 6-digit code from your authenticator app');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: totpCode,
      });
      if (error) throw error;
      router.replace('/karam/dashboard');
    } catch (error: any) {
      Alert.alert('Verification Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (step === 'totp-enroll') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Shield size={48} color="#000" />
            <Text style={styles.title}>Set Up 2FA</Text>
            <Text style={styles.subtitle}>Scan this QR code with your authenticator app</Text>
          </View>
          {qrUri ? (
            <View style={styles.qrContainer}>
              {/* On web, render as img; on native show the uri as text fallback */}
              {typeof window !== 'undefined' ? (
                <img src={qrUri} alt="TOTP QR Code" style={{ width: 200, height: 200 }} />
              ) : (
                <Text style={styles.qrText} selectable>{qrUri}</Text>
              )}
            </View>
          ) : null}
          <Text style={styles.hint}>Then enter the 6-digit code to confirm enrollment:</Text>
          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Shield size={20} color="#666" />
              <TextInput
                style={styles.input}
                placeholder="6-digit code"
                value={totpCode}
                onChangeText={setTotpCode}
                keyboardType="number-pad"
                maxLength={6}
                editable={!loading}
              />
            </View>
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleEnrollVerify}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FDFDFD" />
              ) : (
                <Text style={styles.loginButtonText}>Confirm & Continue</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (step === 'totp-verify') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Shield size={48} color="#000" />
            <Text style={styles.title}>Two-Factor Auth</Text>
            <Text style={styles.subtitle}>Enter the code from your authenticator app</Text>
          </View>
          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Shield size={20} color="#666" />
              <TextInput
                style={styles.input}
                placeholder="6-digit code"
                value={totpCode}
                onChangeText={setTotpCode}
                keyboardType="number-pad"
                maxLength={6}
                editable={!loading}
              />
            </View>
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleTotpVerify}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FDFDFD" />
              ) : (
                <Text style={styles.loginButtonText}>Verify</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Lock size={48} color="#000" />
          <Text style={styles.title}>Admin Panel</Text>
          <Text style={styles.subtitle}>AYS Administration</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Mail size={20} color="#666" />
            <TextInput
              style={styles.input}
              placeholder="Admin Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Lock size={20} color="#666" />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FDFDFD" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FDFDFD',
    borderRadius: 16,
    padding: 40,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  qrText: {
    fontSize: 10,
    color: '#333',
    wordBreak: 'break-all',
  } as any,
  form: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FDFDFD',
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
    outlineStyle: 'none',
  } as any,
  loginButton: {
    backgroundColor: '#000',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonDisabled: {
    opacity: 0.5,
  },
  loginButtonText: {
    color: '#FDFDFD',
    fontSize: 16,
    fontWeight: '600',
  },
});
