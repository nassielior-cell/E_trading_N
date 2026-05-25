'use client';

import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  FacebookAuthProvider,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  indexedDBLocalPersistence,
  OAuthProvider,
  type Auth,
} from 'firebase/auth';

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const firebaseConfigError = validateFirebaseConfig(firebaseConfig);
const firebaseClient = createFirebaseClient(firebaseConfig, firebaseConfigError);

export const firebaseSetupError = firebaseConfigError ?? firebaseClient.error;
export const isFirebaseConfigured = firebaseSetupError === null && Boolean(firebaseClient.auth);

export const app = firebaseClient.app;
export const auth = firebaseClient.auth;
export const firestore = firebaseClient.firestore;
export const firebaseStorage = firebaseClient.firebaseStorage;

export { FacebookAuthProvider, GoogleAuthProvider, OAuthProvider };

export function createAppleProvider() {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  return provider;
}

export function createFacebookProvider() {
  const provider = new FacebookAuthProvider();
  provider.addScope('email');
  return provider;
}

export function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  return provider;
}

function getOrCreateFirebaseApp(config: FirebaseOptions) {
  if (getApps().length > 0) return getApp();
  return initializeApp(config);
}

function createFirebaseClient(config: FirebaseOptions, configError: string | null) {
  const emptyClient: {
    app: FirebaseApp | null;
    auth: Auth | null;
    error: string | null;
    firebaseStorage: FirebaseStorage | null;
    firestore: Firestore | null;
  } = {
    app: null,
    auth: null,
    error: null,
    firebaseStorage: null,
    firestore: null,
  };

  if (typeof window === 'undefined' || configError) return emptyClient;

  try {
    const firebaseApp = getOrCreateFirebaseApp(config);

    return {
      app: firebaseApp,
      auth: getOrCreateAuth(firebaseApp),
      error: null,
      firebaseStorage: getStorage(firebaseApp),
      firestore: getOrCreateFirestore(firebaseApp),
    };
  } catch (error) {
    return {
      ...emptyClient,
      error: getFirebaseInitializationMessage(error),
    };
  }
}

function getOrCreateAuth(firebaseApp: FirebaseApp) {
  try {
    return initializeAuth(firebaseApp, {
      persistence: [browserLocalPersistence, indexedDBLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(firebaseApp);
  }
}

function getOrCreateFirestore(firebaseApp: FirebaseApp) {
  try {
    return initializeFirestore(firebaseApp, {
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    return getFirestore(firebaseApp);
  }
}

function validateFirebaseConfig(config: FirebaseOptions) {
  const missingKeys = [
    ['NEXT_PUBLIC_FIREBASE_API_KEY', config.apiKey],
    ['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', config.authDomain],
    ['NEXT_PUBLIC_FIREBASE_PROJECT_ID', config.projectId],
    ['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', config.storageBucket],
    ['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', config.messagingSenderId],
    ['NEXT_PUBLIC_FIREBASE_APP_ID', config.appId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    return `Firebase setup is incomplete. Missing ${missingKeys.join(', ')} in C:\\E_trading_N\\.env.local. Add the Web app config from Firebase Console, then restart Next.js.`;
  }

  if (typeof config.apiKey === 'string' && !config.apiKey.startsWith('AIza')) {
    return 'Firebase setup error: NEXT_PUBLIC_FIREBASE_API_KEY must be the Web app apiKey from Firebase Console. It is not the project name, project id, auth domain, or app nickname.';
  }

  return null;
}

function getFirebaseInitializationMessage(error: unknown) {
  const details = error instanceof Error && error.message ? ` Details: ${error.message}` : '';

  return `Firebase initialization failed. Check the six NEXT_PUBLIC_FIREBASE_* values in C:\\E_trading_N\\.env.local and restart Next.js.${details}`;
}
