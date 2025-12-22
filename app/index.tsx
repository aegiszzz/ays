import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

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

      if (password.length < 6) {
        setError('Password must be at least 6 characters');
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

        const { error: updateError } = await supabase
          .from('access_codes')
          .update({
            used: true,
            used_at: new Date().toISOString(),
          })
          .eq('code', accessCode);

        if (updateError) {
          console.error('Failed to mark access code as used:', updateError);
        }

        router.replace({
          pathname: '/verify-email',
          params: {
            email: result.email,
            userId: result.userId,
            username: result.username,
            password: btoa(password),
            isNewAccount: 'true',
          }
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
        <Text style={styles.title}>AYS</Text>
        <Text style={styles.subtitle}>
          {isSignUp ? 'Create your account' : 'Sign in to continue'}
        </Text>

        <View style={styles.formContainer}>
          {isSignUp && (
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#636366"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          )}
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#636366"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#636366"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {isSignUp && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor="#636366"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              <TextInput
                style={styles.input}
                placeholder="Access Code (e.g. A7B2K9)"
                placeholderTextColor="#636366"
                value={accessCode}
                onChangeText={(text) => setAccessCode(text.toUpperCase())}
                autoCapitalize="characters"
                maxLength={6}
              />
              <Text style={styles.betaText}>Beta access only - enter your invite code</Text>
            </>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.emailButton, loading && styles.buttonDisabled]}
            onPress={handleEmailAuth}
            disabled={loading}
          >
            <Mail size={20} color="#fff" />
            <Text style={styles.buttonText}>
              {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.infoText}>
          By signing in, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    padding: 20,
    alignItems: 'center',
  },
  content: {
    backgroundColor: '#1c1c1e',
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
    borderColor: '#2c2c2e',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#8e8e93',
    textAlign: 'center',
    marginBottom: 24,
  },
  formContainer: {
    width: '100%',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    backgroundColor: '#2c2c2e',
    borderWidth: 1,
    borderColor: '#3a3a3c',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    marginBottom: 10,
    color: '#ffffff',
  },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  switchText: {
    color: '#007AFF',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 14,
    marginBottom: 8,
  },
  betaText: {
    fontSize: 12,
    color: '#8e8e93',
    textAlign: 'center',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  infoText: {
    fontSize: 12,
    color: '#636366',
    textAlign: 'center',
    marginTop: 16,
  },
});
