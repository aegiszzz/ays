import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { createWallet } from '@/lib/wallet';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<{ userId: string; email: string }>;
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
          .select('wallet_address')
          .eq('id', session.user.id)
          .maybeSingle();

        if (existingUser && !existingUser.wallet_address) {
          const walletAddress = await createWallet(session.user.id);

          await supabase
            .from('users')
            .update({ wallet_address: walletAddress })
            .eq('id', session.user.id);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
      options: {
        data: {
          username: username,
        },
        emailRedirectTo: undefined,
      }
    });

    if (error) {
      throw error;
    }

    if (!data.user) {
      throw new Error('Kullanıcı oluşturulamadı');
    }

    const walletAddress = await createWallet(data.user.id);

    await new Promise(resolve => setTimeout(resolve, 1500));

    const { error: updateError } = await supabase
      .from('users')
      .update({ wallet_address: walletAddress, username })
      .eq('id', data.user.id);

    if (updateError) {
      console.error('Wallet update error:', updateError);
    }

    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-verification-email`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, userId: data.user.id }),
      }
    );

    if (!response.ok) {
      throw new Error('Doğrulama kodu gönderilemedi');
    }

    await supabase.auth.signOut();

    return { userId: data.user.id, email };
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
