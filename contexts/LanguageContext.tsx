import React, { createContext, useContext, useState } from 'react';
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


export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language] = useState<Language>('en');

  const setLanguage = (_lang: Language) => {};

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: getTranslations(language) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
