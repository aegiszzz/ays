import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { createWallet, createSolanaWalletForUser, encryptPrivateKey } from '@/lib/wallet';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<{ userId: string; email: string; code?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isSigningUp = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (isSigningUp.current) {
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (event === 'SIGNED_IN' && session?.user) {
        (async () => {
          const { data: existingUser } = await supabase
            .from('users')
            .select('wallet_address, solana_wallet_address')
            .eq('id', session.user.id)
            .maybeSingle();

          if (!existingUser) return;

          const updates: Record<string, string> = {};

          if (!existingUser.wallet_address) {
            try {
              const walletAddress = await createWallet(session.user.id);
              updates.wallet_address = walletAddress;
            } catch (e) {
              console.error('Failed to create BSC wallet:', e);
            }
          }

          if (!existingUser.solana_wallet_address) {
            try {
              const solanaAddress = await createSolanaWalletForUser(session.user.id);
              updates.solana_wallet_address = solanaAddress;
            } catch (e) {
              console.error('Failed to create Solana wallet:', e);
            }
          }

          if (Object.keys(updates).length > 0) {
            await supabase
              .from('users')
              .update(updates)
              .eq('id', session.user.id);
          }
        })();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    if (!authData.user) {
      throw new Error('Failed to sign in');
    }
  };

  const signUpWithEmail = async (email: string, password: string, username: string) => {
    isSigningUp.current = true;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username,
        },
        emailRedirectTo: undefined,
      }
    });

    if (error) {
      isSigningUp.current = false;
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        throw new Error('This email is already registered. Please sign in.');
      }
      throw error;
    }

    if (!data.user) {
      isSigningUp.current = false;
      throw new Error('Failed to create user');
    }

    isSigningUp.current = false;

    return {
      userId: data.user.id,
      email,
      username,
    };
  };

  const signOut = async () => {
    setSession(null);
    setUser(null);

    if (typeof window !== 'undefined') {
      localStorage.clear();
      sessionStorage.clear();
    }

    supabase.auth.signOut().catch(() => {});

    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.location.href = '/';
      }, 50);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        signInWithEmail,
        signUpWithEmail,
        signOut,
      }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
