import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { Mail, Lock, User, Hash } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { setPendingPassword } from '@/lib/authTemp';

export default function LoginScreen() {
  const { signInWithEmail, signUpWithEmail, session } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isSigningUp = useRef(false);

  useEffect(() => {
    if (session && !loading && !isSigningUp.current) {
      router.replace('/(tabs)/');
    }
  }, [session, loading]);

  const handleEmailAuth = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (isSignUp) {
      if (!username) {
        setError('Please enter a username');
        return;
      }

      if (!confirmPassword) {
        setError('Please confirm your password');
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        setError('Password must contain at least one letter and one number');
        return;
      }

      if (!accessCode) {
        setError('Please enter your access code');
        return;
      }

      if (accessCode.length !== 6 || !/^[A-Z0-9]+$/.test(accessCode)) {
        setError('Access code must be 6 characters (letters and numbers)');
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        const { data: codeData, error: codeError } = await supabase
          .from('access_codes')
          .select('id, code, used')
          .eq('code', accessCode)
          .maybeSingle();

        if (codeError) {
          throw new Error('Failed to verify access code');
        }

        if (!codeData) {
          throw new Error('Invalid access code');
        }

        if (codeData.used) {
          throw new Error('This access code has already been used');
        }

        isSigningUp.current = true;
        const result = await signUpWithEmail(email, password, username);

        await supabase
          .from('access_codes')
          .update({ used: true, used_at: new Date().toISOString() })
          .eq('code', accessCode);

        setPendingPassword(password);

        router.push({
          pathname: '/verify-email',
          params: {
            email: result.email,
            userId: result.userId,
            username: result.username,
            isNewAccount: 'true',
          },
        });
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: any) {
      isSigningUp.current = false;
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>AYS</Text>
          <View style={styles.logoDot} />
        </View>
        <Text style={styles.subtitle}>
          {isSignUp ? 'Create your account' : 'Welcome back'}
        </Text>

        <View style={styles.formContainer}>
          {isSignUp && (
            <View style={styles.inputWrapper}>
              <User size={18} color="#00A0DC" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#4A4A4E"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>
          )}
          <View style={styles.inputWrapper}>
            <Mail size={18} color="#00A0DC" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#4A4A4E"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          <View style={styles.inputWrapper}>
            <Lock size={18} color="#00A0DC" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#4A4A4E"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
          {isSignUp && (
            <>
              <View style={styles.inputWrapper}>
                <Lock size={18} color="#00A0DC" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm Password"
                  placeholderTextColor="#4A4A4E"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
              </View>
              <View style={styles.inputWrapper}>
                <Hash size={18} color="#00A0DC" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Access Code (e.g. A7B2K9)"
                  placeholderTextColor="#4A4A4E"
                  value={accessCode}
                  onChangeText={(text) => setAccessCode(text.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={6}
                />
              </View>
              <Text style={styles.betaText}>Beta access only — enter your invite code</Text>
            </>
          )}

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleEmailAuth}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => { setIsSignUp(!isSignUp); setError(''); }}
          >
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={styles.switchTextBold}>
                {isSignUp ? 'Sign in' : 'Sign up'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.infoText}>
          By continuing, you agree to our Terms of Service
        </Text>
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
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: '#252528',
    shadowColor: '#00A0DC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 4,
    position: 'relative',
  },
  logoText: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FDFDFD',
    letterSpacing: 6,
  },
  logoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00A0DC',
    marginTop: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#7A7A7E',
    marginBottom: 28,
    marginTop: 8,
  },
  formContainer: {
    width: '100%',
    gap: 10,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0D0F',
    borderWidth: 1,
    borderColor: '#252528',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#FDFDFD',
  },
  button: {
    backgroundColor: '#00A0DC',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#00A0DC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FDFDFD',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#252528',
  },
  dividerText: {
    color: '#4A4A4E',
    fontSize: 13,
  },
  switchButton: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  switchText: {
    color: '#7A7A7E',
    fontSize: 14,
  },
  switchTextBold: {
    color: '#00A0DC',
    fontWeight: '700',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    textAlign: 'center',
  },
  betaText: {
    fontSize: 12,
    color: '#4A4A4E',
    textAlign: 'center',
    marginTop: -2,
    fontStyle: 'italic',
  },
  infoText: {
    fontSize: 11,
    color: '#252528',
    textAlign: 'center',
    marginTop: 20,
  },
});
