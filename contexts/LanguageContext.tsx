import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Language, Translations, getTranslations } from '@/lib/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: getTranslations('en'),
});

const STORAGE_KEY = 'app_language';

async function getStoredLanguage(): Promise<Language | null> {
  if (Platform.OS === 'web') {
    const val = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    return (val === 'en' || val === 'tr') ? val : null;
  }
  const val = await SecureStore.getItemAsync(STORAGE_KEY);
  return (val === 'en' || val === 'tr') ? val : null;
}

async function storeLanguage(lang: Language) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, lang);
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, lang);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    getStoredLanguage().then((saved) => {
      if (saved) setLanguageState(saved);
    });
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    storeLanguage(lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: getTranslations(language) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
