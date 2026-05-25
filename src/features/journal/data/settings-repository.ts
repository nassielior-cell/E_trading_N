import type { Language } from '@/lib/i18n/translations';
import { doc, getDoc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from '@/lib/firebase';

import { localStorageAdapter, type StorageAdapter } from './storage-adapter';

const settingsStorageKey = 'e_trading_n:v1:settings';
const legacyLanguageStorageKey = 'e_trading_n_language';
const defaultWorkspaceId = (process.env.NEXT_PUBLIC_FIREBASE_WORKSPACE_ID || 'personal-journal').trim() || 'personal-journal';
const logPrefix = '[firebase-settings-sync]';

export type AppSettingsSnapshot = {
  version: 1;
  language: Language;
  theme: 'light' | 'dark';
  savedAt: string;
};

export type SettingsRepository = {
  load: () => AppSettingsSnapshot;
  save: (settings: AppSettingsSnapshot) => void;
  setLanguage: (language: Language) => void;
  setTheme: (theme: AppSettingsSnapshot['theme']) => void;
  loadCloud: () => Promise<AppSettingsSnapshot | null>;
  saveCloud: (settings: AppSettingsSnapshot) => Promise<void>;
  subscribeCloud: (onChange: (settings: AppSettingsSnapshot) => void, onError?: (error: Error) => void) => Unsubscribe;
  clear: () => void;
};

export const createDefaultSettingsSnapshot = (): AppSettingsSnapshot => ({
  version: 1,
  language: 'he',
  theme: 'light',
  savedAt: new Date().toISOString(),
});

export const createSettingsRepository = (storage: StorageAdapter = localStorageAdapter): SettingsRepository => ({
  load: () => {
    const raw = storage.getItem(settingsStorageKey);

    if (raw) {
      try {
        return normalizeSettings(JSON.parse(raw));
      } catch {
        return createDefaultSettingsSnapshot();
      }
    }

    const legacyLanguage = storage.getItem(legacyLanguageStorageKey);
    if (legacyLanguage === 'en' || legacyLanguage === 'he') {
      return { ...createDefaultSettingsSnapshot(), language: legacyLanguage };
    }

    return createDefaultSettingsSnapshot();
  },
  save: (settings) => {
    const normalizedSettings = { ...normalizeSettings(settings), savedAt: new Date().toISOString() };
    storage.setItem(settingsStorageKey, JSON.stringify(normalizedSettings));
    storage.setItem(legacyLanguageStorageKey, normalizedSettings.language);
  },
  setLanguage: (language) => {
    const currentSettings = normalizeSettings(JSON.parse(storage.getItem(settingsStorageKey) ?? '{}'));
    storage.setItem(settingsStorageKey, JSON.stringify({ ...currentSettings, language, savedAt: new Date().toISOString() }));
    storage.setItem(legacyLanguageStorageKey, language);
  },
  setTheme: (theme) => {
    const currentSettings = normalizeSettings(JSON.parse(storage.getItem(settingsStorageKey) ?? '{}'));
    storage.setItem(settingsStorageKey, JSON.stringify({ ...currentSettings, theme, savedAt: new Date().toISOString() }));
  },
  loadCloud: async () => {
    if (!isFirebaseConfigured || !firestore) {
      console.info(logPrefix, 'language read skipped: Firestore is not configured');
      return null;
    }

    const settingsRef = doc(firestore, 'workspaces', defaultWorkspaceId, 'settings', 'app');
    console.info(logPrefix, 'language read start', {
      workspaceId: defaultWorkspaceId,
      path: settingsRef.path,
    });
    const snapshot = await getDoc(settingsRef);
    const settings = snapshot.exists() ? normalizeSettings(snapshot.data()) : null;
    console.info(logPrefix, 'language read success', {
      workspaceId: defaultWorkspaceId,
      path: settingsRef.path,
      exists: snapshot.exists(),
      language: settings?.language,
      theme: settings?.theme,
    });
    return settings;
  },
  saveCloud: async (settings) => {
    if (!isFirebaseConfigured || !firestore) {
      console.info(logPrefix, 'language write skipped: Firestore is not configured');
      return;
    }

    const settingsRef = doc(firestore, 'workspaces', defaultWorkspaceId, 'settings', 'app');
    const nextSettings = {
      ...normalizeSettings(settings),
      savedAt: new Date().toISOString(),
    };
    console.info(logPrefix, 'language write start', {
      workspaceId: defaultWorkspaceId,
      path: settingsRef.path,
      language: nextSettings.language,
      theme: nextSettings.theme,
    });
    await setDoc(settingsRef, nextSettings);
    console.info(logPrefix, 'language write success', {
      workspaceId: defaultWorkspaceId,
      path: settingsRef.path,
      language: nextSettings.language,
      theme: nextSettings.theme,
      savedAt: nextSettings.savedAt,
    });
  },
  subscribeCloud: (onChange, onError) => {
    if (!isFirebaseConfigured || !firestore) {
      console.info(logPrefix, 'language listener skipped: Firestore is not configured');
      return () => undefined;
    }

    const settingsRef = doc(firestore, 'workspaces', defaultWorkspaceId, 'settings', 'app');
    console.info(logPrefix, 'language listener start', {
      workspaceId: defaultWorkspaceId,
      path: settingsRef.path,
    });
    return onSnapshot(
      settingsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const settings = normalizeSettings(snapshot.data());
          console.info(logPrefix, 'language realtime snapshot received', {
            workspaceId: defaultWorkspaceId,
            path: settingsRef.path,
            language: settings.language,
            theme: settings.theme,
            savedAt: settings.savedAt,
          });
          onChange(settings);
        }
      },
      (error) => {
        console.error(logPrefix, 'language listener error', { path: settingsRef.path, error });
        onError?.(error);
      },
    );
  },
  clear: () => {
    storage.removeItem(settingsStorageKey);
    storage.removeItem(legacyLanguageStorageKey);
  },
});

export const settingsRepository = createSettingsRepository();

function normalizeSettings(value: Partial<AppSettingsSnapshot>): AppSettingsSnapshot {
  const defaults = createDefaultSettingsSnapshot();

  return {
    version: 1,
    language: value.language === 'en' || value.language === 'he' ? value.language : defaults.language,
    theme: value.theme === 'dark' || value.theme === 'light' ? value.theme : defaults.theme,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : defaults.savedAt,
  };
}
