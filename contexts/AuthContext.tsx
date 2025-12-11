import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { createWallet } from '@/lib/wallet';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithTwitter: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (event === 'SIGNED_IN' && session?.user) {
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('id', session.user.id)
          .single();

        if (!existingUser) {
          const walletAddress = await createWallet(session.user.id);

          let username = session.user.email?.split('@')[0] ||
                        session.user.user_metadata?.user_name ||
                        session.user.user_metadata?.name ||
                        `user_${session.user.id.substring(0, 8)}`;

          const { data: existingUsername } = await supabase
            .from('users')
            .select('username')
            .eq('username', username)
            .single();

          if (existingUsername) {
            username = `${username}_${Math.floor(Math.random() * 1000)}`;
          }

          await supabase.from('users').insert({
            id: session.user.id,
            email: session.user.email,
            username,
            wallet_address: walletAddress,
          });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithTwitter = async () => {
    const redirectUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081';

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'twitter',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: false,
      },
    });

    if (error) {
      console.error('Twitter login error:', error);
      alert('Login failed: ' + error.message);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, password: string, username: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    if (data.user) {
      const walletAddress = await createWallet(data.user.id);

      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: data.user.id,
          username,
          email,
          wallet_address: walletAddress,
        });

      if (profileError) {
        throw profileError;
      }
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        signInWithTwitter,
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
