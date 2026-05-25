'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  languageDirections,
  translations,
  type Language,
  type TranslationKey,
} from './translations';
import { settingsRepository } from '@/features/journal/data/settings-repository';
import { useJournalStore } from '@/features/journal/store/journal-store';

type LanguageContextValue = {
  dir: 'ltr' | 'rtl';
  language: Language;
  setLanguage: (language: Language) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  t: (key: TranslationKey) => string;
  theme: 'light' | 'dark';
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('he');
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const localSettings = settingsRepository.load();
    setLanguageState(localSettings.language);
    setThemeState(localSettings.theme);

    settingsRepository
      .loadCloud()
      .then((cloudSettings) => {
        if (cloudSettings) {
          settingsRepository.save(cloudSettings);
          setLanguageState(cloudSettings.language);
          setThemeState(cloudSettings.theme);
        } else {
          void settingsRepository.saveCloud(localSettings).catch(() => undefined);
        }
      })
      .catch(() => undefined);

    const unsubscribe = settingsRepository.subscribeCloud(
      (cloudSettings) => {
        settingsRepository.save(cloudSettings);
        setLanguageState(cloudSettings.language);
        setThemeState(cloudSettings.theme);
      },
      () => undefined,
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    document.documentElement.dir = languageDirections[language];
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (nextLanguage: Language) => {
    const nextSettings = { ...settingsRepository.load(), language: nextLanguage, savedAt: new Date().toISOString() };
    setLanguageState(nextLanguage);
    settingsRepository.setLanguage(nextLanguage);
    useJournalStore.getState().recordEvent('language_changed', { language: nextLanguage });
    void settingsRepository
      .saveCloud(nextSettings)
      .catch(() => undefined);
  };

  const setTheme = (nextTheme: 'light' | 'dark') => {
    const nextSettings = { ...settingsRepository.load(), theme: nextTheme, savedAt: new Date().toISOString() };
    setThemeState(nextTheme);
    settingsRepository.setTheme(nextTheme);
    useJournalStore.getState().recordEvent('settings_changed', { setting: 'theme', theme: nextTheme });
    void settingsRepository
      .saveCloud(nextSettings)
      .catch(() => undefined);
  };

  const value = useMemo<LanguageContextValue>(() => {
    const dir = languageDirections[language];

    return {
      dir,
      language,
      setLanguage,
      setTheme,
      t: (key) => translations[language][key] ?? translations.en[key],
      theme,
    };
  }, [language, theme]);

  return (
    <LanguageContext.Provider value={value}>
      <div dir={value.dir} lang={language} className={`${value.dir === 'rtl' ? 'rtl' : 'ltr'} min-h-screen bg-background text-ink`}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }

  return context;
}
