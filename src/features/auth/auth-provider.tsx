'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  getRedirectResult,
  indexedDBLocalPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateEmail,
  updatePassword,
  browserLocalPersistence,
  type AuthError,
  type UserCredential,
  type User,
} from 'firebase/auth';

import {
  auth,
  createAppleProvider,
  createFacebookProvider,
  createGoogleProvider,
  firebaseSetupError,
  isFirebaseConfigured,
} from '@/lib/firebase';
import { officialPublicUrl } from '@/lib/public-url';

export type AuthProviderId = 'google' | 'facebook' | 'apple';

type AuthContextValue = {
  activeProvider: AuthProviderId | null;
  debug: AuthDebugState;
  error: string | null;
  isConfigured: boolean;
  isLoading: boolean;
  isReady: boolean;
  setupError: string | null;
  resetPassword: (email: string) => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signIn: (provider: AuthProviderId) => Promise<void>;
  createAccountWithEmail: (email: string, password: string) => Promise<void>;
  updateCurrentEmail: (email: string) => Promise<boolean>;
  updateCurrentPassword: (password: string) => Promise<boolean>;
  signOutUser: () => Promise<void>;
  user: User | null;
};

export type AuthDebugState = {
  currentUrl: string;
  lastAuthEvent: string;
  lastRedirectResultStatus: string;
  persistenceType: string;
  reasonLoginScreenShown: string;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const MOBILE_REDIRECT_PENDING_KEY = 'e_trading_n:v1:auth-redirect-pending';
const LOCAL_NETWORK_HOST = '192.168.50.112';
const isAuthDebugEnabled = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_AUTH_DEBUG === 'true';
let authPersistencePromise: Promise<string> | null = null;
let redirectResultPromise: Promise<UserCredential | null> | null = null;

function ensureAuthPersistence(firebaseAuth: NonNullable<typeof auth>) {
  if (!authPersistencePromise) {
    authDebug('auth initialized', {
      currentUser: describeUser(firebaseAuth.currentUser),
      userAgent: typeof navigator === 'undefined' ? 'server' : navigator.userAgent,
    });

    authPersistencePromise = setPersistence(firebaseAuth, browserLocalPersistence)
      .then(() => {
        authDebug('persistence set', { persistence: 'browserLocalPersistence' });
        return 'browserLocalPersistence';
      })
      .catch((localPersistenceError: unknown) => {
        authDebug('browserLocalPersistence failed, trying indexedDBLocalPersistence', {
          error: getErrorMessage(localPersistenceError),
        });

        return setPersistence(firebaseAuth, indexedDBLocalPersistence).then(() => {
          authDebug('persistence set', { persistence: 'indexedDBLocalPersistence' });
          return 'indexedDBLocalPersistence';
        });
      });
  }

  return authPersistencePromise;
}

function getRedirectResultOnce(firebaseAuth: NonNullable<typeof auth>) {
  if (!redirectResultPromise) {
    redirectResultPromise = ensureAuthPersistence(firebaseAuth).then(() => getRedirectResult(firebaseAuth));
  }

  return redirectResultPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(!auth);
  const [isLoading, setIsLoading] = useState(Boolean(auth));
  const [activeProvider, setActiveProvider] = useState<AuthProviderId | null>(() => getPendingRedirectProvider());
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<AuthDebugState>(() => ({
    currentUrl: getCurrentUrl(),
    lastAuthEvent: auth ? 'auth-provider-mounted' : 'auth-not-initialized',
    lastRedirectResultStatus: 'not-started',
    persistenceType: 'not-started',
    reasonLoginScreenShown: 'auth-check-not-finished',
  }));

  const updateDebug = (nextDebug: Partial<AuthDebugState>, logMessage: string, details?: Record<string, unknown>) => {
    setDebug((current) => ({ ...current, currentUrl: getCurrentUrl(), ...nextDebug }));
    authDebug(logMessage, details);
  };

  useEffect(() => {
    if (!auth) return;

    const firebaseAuth = auth;
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    setIsReady(false);
    setIsLoading(true);
    updateDebug(
      {
        lastAuthEvent: 'auth-startup-begin',
        lastRedirectResultStatus: 'waiting',
        reasonLoginScreenShown: 'auth-check-not-finished',
      },
      'auth startup begin',
      { currentUser: describeUser(firebaseAuth.currentUser) },
    );

    const bootstrapAuthSession = async () => {
      try {
        const persistenceType = await ensureAuthPersistence(firebaseAuth);
        if (!isMounted) return;
        updateDebug(
          {
            persistenceType,
          },
          'persistence ready',
          { persistenceType },
        );
      } catch (persistenceError) {
        if (!isMounted) return;
        updateDebug(
          {
            lastAuthEvent: `persistence-error: ${getErrorMessage(persistenceError)}`,
            persistenceType: 'failed',
          },
          'persistence setup failed',
          { error: getErrorMessage(persistenceError) },
        );
        setError(getReadableAuthError(persistenceError));
      }

      const redirectResult = await getRedirectResultOnce(firebaseAuth)
        .then((result) => {
          if (!isMounted) return null;
          const status = result?.user
            ? `user:${result.user.uid}`
            : result
              ? `no-user-operation:${result.operationType}`
              : 'none';
          updateDebug(
            {
              lastRedirectResultStatus: status,
            },
            'redirect result received',
            {
              currentUser: describeUser(firebaseAuth.currentUser),
              operationType: result?.operationType ?? null,
              redirectUser: describeUser(result?.user),
            },
          );
          return result;
        })
        .catch((redirectError: unknown) => {
          if (!isMounted) return null;
          updateDebug(
            {
              lastRedirectResultStatus: `error: ${getErrorMessage(redirectError)}`,
            },
            'redirect result received',
            { error: getErrorMessage(redirectError) },
          );
          setError(getReadableAuthError(redirectError));
          return null;
        });

      if (!isMounted) return;

      updateDebug(
        {
          lastAuthEvent: 'waiting-for-onAuthStateChanged',
        },
        'waiting for onAuthStateChanged',
        { redirectUser: describeUser(redirectResult?.user), currentUser: describeUser(firebaseAuth.currentUser) },
      );

      const initialAuthStatePromise = new Promise<User | null>((resolve) => {
        unsubscribe = onAuthStateChanged(
          firebaseAuth,
          (nextUser) => {
            if (!isMounted) return;
            setUser((currentUser) => (currentUser?.uid === nextUser?.uid ? currentUser : nextUser));
            updateDebug(
              {
                lastAuthEvent: nextUser ? `onAuthStateChanged:user:${nextUser.uid}` : 'onAuthStateChanged:null-user',
                reasonLoginScreenShown: nextUser ? 'not-shown-user-exists' : 'authLoading=false-and-user-null',
              },
              'onAuthStateChanged user uid',
              {
                currentUser: describeUser(firebaseAuth.currentUser),
                email: nextUser?.email ?? null,
                uid: nextUser?.uid ?? null,
              },
            );
            resolve(nextUser);
            setIsReady(true);
            setIsLoading(false);
            setActiveProvider(null);
            if (nextUser) clearPendingRedirect();
          },
          (stateError) => {
            if (!isMounted) return;
            updateDebug(
              {
                lastAuthEvent: `onAuthStateChanged-error: ${getErrorMessage(stateError)}`,
                reasonLoginScreenShown: 'auth-state-error',
              },
              'onAuthStateChanged error',
              { error: getErrorMessage(stateError) },
            );
            setError(getReadableAuthError(stateError));
            resolve(firebaseAuth.currentUser);
            setIsReady(true);
            setIsLoading(false);
            setActiveProvider(null);
          },
        );
      });

      await initialAuthStatePromise;
    };

    void bootstrapAuthSession().catch((sessionError: unknown) => {
      if (!isMounted) return;
      updateDebug(
        {
          lastAuthEvent: `auth-hydration-failed: ${getErrorMessage(sessionError)}`,
          reasonLoginScreenShown: 'auth-hydration-failed',
        },
        'auth hydration failed',
        { error: getErrorMessage(sessionError) },
      );
      setError(getReadableAuthError(sessionError));
      setIsReady(true);
      setIsLoading(false);
      setActiveProvider(null);
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!isReady || user || !auth) return;

    updateDebug(
      {
        reasonLoginScreenShown: 'authLoading=false-and-user-null',
      },
      'reason login screen rendered',
      {
        reason: 'authLoading=false-and-user-null',
        currentUser: describeUser(auth.currentUser),
      },
    );
  }, [isReady, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      activeProvider,
      debug,
      error,
      isConfigured: isFirebaseConfigured && Boolean(auth),
      isLoading,
      isReady,
      setupError: firebaseSetupError,
      user,
      resetPassword: async (email) => {
        if (!auth) {
          setError(firebaseSetupError ?? getBilingualMessage('Firebase Authentication failed to initialize.', 'אתחול Firebase Authentication נכשל.'));
          return false;
        }

        setError(null);
        setIsLoading(true);

        try {
          await ensureAuthPersistence(auth);
          await sendPasswordResetEmail(auth, email);
          return true;
        } catch (resetError) {
          setError(getReadableAuthError(resetError, 'email'));
          return false;
        } finally {
          setIsLoading(false);
        }
      },
      createAccountWithEmail: async (email, password) => {
        if (!auth) {
          setError(firebaseSetupError ?? getBilingualMessage('Firebase Authentication failed to initialize.', 'אתחול Firebase Authentication נכשל.'));
          return;
        }

        setError(null);
        setIsLoading(true);
        setActiveProvider(null);

        try {
          await ensureAuthPersistence(auth);
          await createUserWithEmailAndPassword(auth, email, password);
        } catch (accountError) {
          setError(getReadableAuthError(accountError, 'email'));
        } finally {
          setIsLoading(false);
        }
      },
      signIn: async (providerId) => {
        if (!auth) {
          setError(firebaseSetupError ?? getBilingualMessage('Firebase Authentication failed to initialize.', 'אתחול Firebase Authentication נכשל.'));
          return;
        }

        setError(null);
        setIsLoading(true);
        setActiveProvider(providerId);

        try {
          await ensureAuthPersistence(auth);
          const provider =
            providerId === 'google' ? createGoogleProvider() : providerId === 'facebook' ? createFacebookProvider() : createAppleProvider();

          if (shouldUseRedirectSignIn()) {
            const originError = getMobileRedirectOriginError();
            if (originError) {
              authDebug('redirect trigger reason', {
                providerId,
                reason: 'blocked-mobile-origin',
                url: window.location.href,
              });
              setError(originError);
              return;
            }

            authDebug('redirect trigger reason', {
              providerId,
              reason: 'mobile-browser-sign-in',
              url: window.location.href,
            });
            setPendingRedirect(providerId);
            await signInWithRedirect(auth, provider);
            return;
          }

          await signInWithPopup(auth, provider);
        } catch (signInError) {
          setError(getReadableAuthError(signInError, providerId));
        } finally {
          if (!hasPendingRedirect()) {
            setIsLoading(false);
            setActiveProvider(null);
          }
        }
      },
      signInWithEmail: async (email, password) => {
        if (!auth) {
          setError(firebaseSetupError ?? getBilingualMessage('Firebase Authentication failed to initialize.', 'אתחול Firebase Authentication נכשל.'));
          return;
        }

        setError(null);
        setIsLoading(true);
        setActiveProvider(null);

        try {
          await ensureAuthPersistence(auth);
          await signInWithEmailAndPassword(auth, email, password);
        } catch (emailError) {
          setError(getReadableAuthError(emailError, 'email'));
        } finally {
          setIsLoading(false);
        }
      },
      signOutUser: async () => {
        if (!auth) return;

        setError(null);
        setIsLoading(true);
        setActiveProvider(null);

        try {
          await signOut(auth);
        } catch (signOutError) {
          setError(getReadableAuthError(signOutError));
        } finally {
          setIsLoading(false);
        }
      },
      updateCurrentEmail: async (email) => {
        if (!auth?.currentUser) {
          setError(getBilingualMessage('No signed-in user was found.', 'לא נמצא משתמש מחובר.'));
          return false;
        }

        setError(null);
        setIsLoading(true);

        try {
          await updateEmail(auth.currentUser, email);
          return true;
        } catch (emailUpdateError) {
          setError(getReadableAuthError(emailUpdateError, 'email'));
          return false;
        } finally {
          setIsLoading(false);
        }
      },
      updateCurrentPassword: async (password) => {
        if (!auth?.currentUser) {
          setError(getBilingualMessage('No signed-in user was found.', 'לא נמצא משתמש מחובר.'));
          return false;
        }

        setError(null);
        setIsLoading(true);

        try {
          await updatePassword(auth.currentUser, password);
          return true;
        } catch (passwordUpdateError) {
          setError(getReadableAuthError(passwordUpdateError, 'email'));
          return false;
        } finally {
          setIsLoading(false);
        }
      },
    }),
    [activeProvider, debug, error, isLoading, isReady, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

function getReadableAuthError(error: unknown, providerId?: AuthProviderId | 'email') {
  const code = normalizeFirebaseAuthCode(error);
  const providerName = getProviderName(providerId);

  switch (code) {
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key':
    case 'auth/invalid-api-key':
      return getBilingualMessage(
        'Invalid Firebase API key. Copy the Web app apiKey from Firebase Console into NEXT_PUBLIC_FIREBASE_API_KEY, then restart Next.js.',
        'מפתח Firebase API אינו תקין. העתק את ערך ה-Web app apiKey מ-Firebase Console אל NEXT_PUBLIC_FIREBASE_API_KEY ואז הפעל מחדש את Next.js.',
      );
    case 'auth/operation-not-allowed':
      return getBilingualMessage(
        `${providerName.en} login is disabled. Enable it in Firebase Console > Authentication > Sign-in method.`,
        `התחברות עם ${providerName.he} כבויה. הפעל אותה ב-Firebase Console > Authentication > Sign-in method.`,
      );
    case 'auth/popup-blocked':
      return getBilingualMessage(
        `${providerName.en} popup was blocked. On mobile the app will use a redirect; on desktop, allow popups for this site and try again.`,
        `חלון ההתחברות של ${providerName.he} נחסם. במובייל האפליקציה תשתמש בהפניה; במחשב, אפשר חלונות קופצים לאתר ונסה שוב.`,
      );
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/redirect-cancelled-by-user':
      return getBilingualMessage(
        `${providerName.en} login was closed before it finished. Open it again and complete the provider flow.`,
        `חלון ההתחברות של ${providerName.he} נסגר לפני הסיום. פתח שוב והשלים את תהליך ההתחברות.`,
      );
    case 'auth/unauthorized-domain':
      return getBilingualMessage(
        `This domain is not authorized for Firebase Authentication. Add localhost, 127.0.0.1, and ${LOCAL_NETWORK_HOST} in Firebase Console > Authentication > Settings > Authorized domains.`,
        `הדומיין הזה אינו מורשה ב-Firebase Authentication. הוסף localhost, 127.0.0.1 ואת ${LOCAL_NETWORK_HOST} ב-Firebase Console > Authentication > Settings > Authorized domains.`,
      );
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/credential-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return getBilingualMessage(
        `${providerName.en} credentials were rejected. Check the password, use password reset, or create a new account if this email does not exist yet.`,
        `פרטי ההתחברות של ${providerName.he} נדחו. בדוק את הסיסמה, השתמש באיפוס סיסמה, או צור חשבון חדש אם האימייל עדיין לא קיים.`,
      );
    case 'auth/network-request-failed':
      return getBilingualMessage(
        'Firebase could not reach the auth service. Check your connection and try again.',
        'Firebase לא הצליח להתחבר לשירות האימות. בדוק חיבור ונסה שוב.',
      );
    case 'auth/internal-error':
      return getBilingualMessage(
        'Firebase Authentication hit an internal error. Refresh the page and try again; if you are on mobile, open the app through the local network IP.',
        'Firebase Authentication נתקל בשגיאה פנימית. רענן את העמוד ונסה שוב; אם אתה במובייל, פתח את האפליקציה דרך כתובת ה-IP המקומית.',
      );
    case 'auth/email-already-in-use':
      return getBilingualMessage(
        'This email already has an account. Use login instead of create account.',
        'לכתובת האימייל הזו כבר יש חשבון. השתמש בהתחברות במקום יצירת חשבון.',
      );
    case 'auth/weak-password':
      return getBilingualMessage(
        'Password is too weak. Use at least 6 characters.',
        'הסיסמה חלשה מדי. השתמש לפחות ב-6 תווים.',
      );
    case 'auth/invalid-email':
      return getBilingualMessage(
        'Email address is not valid.',
        'כתובת האימייל אינה תקינה.',
      );
    case 'auth/requires-recent-login':
      return getBilingualMessage(
        'For security, Firebase requires a fresh login before changing email or password. Sign out, sign in again, then retry.',
        'מטעמי אבטחה Firebase דורש התחברות מחדש לפני שינוי אימייל או סיסמה. התנתק, התחבר שוב ונסה מחדש.',
      );
    default:
      if (error instanceof Error && error.message) {
        return getBilingualMessage(error.message, `שגיאת התחברות: ${error.message}`);
      }

      return getBilingualMessage(`${providerName.en} login failed.`, `התחברות עם ${providerName.he} נכשלה.`);
  }
}

function normalizeFirebaseAuthCode(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? (error as AuthError).code : undefined;
  const message = error instanceof Error ? error.message : '';
  const extractedCode = message.match(/\((auth\/[^)]+)\)/)?.[1];

  return (code ?? extractedCode)?.replace(/\.+$/, '');
}

function getProviderName(providerId?: AuthProviderId | 'email') {
  if (providerId === 'email') return { en: 'Email/password', he: 'אימייל וסיסמה' };
  if (providerId === 'facebook') return { en: 'Facebook', he: 'Facebook' };
  if (providerId === 'apple') return { en: 'Apple', he: 'Apple' };
  return { en: 'Google', he: 'Google' };
}

function getBilingualMessage(en: string, he: string) {
  return `${he}\n${en}`;
}

function shouldUseRedirectSignIn() {
  if (typeof window === 'undefined') return false;

  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile) return true;

  const userAgent = navigator.userAgent || '';
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  const isTouchTablet = maxTouchPoints > 1 && /Macintosh|iPad/.test(userAgent);

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(userAgent) || isTouchTablet;
}

function getMobileRedirectOriginError() {
  if (typeof window === 'undefined') return null;

  const { hostname, href, origin, protocol } = window.location;
  const localNetworkUrl = getLocalNetworkAppUrl();
  if (href === 'about:blank' || origin === 'null' || protocol === 'about:') {
    return getBilingualMessage(
      `This page cannot start mobile login from ${href}. Open the app at ${localNetworkUrl} and try again.`,
      `אי אפשר להתחיל התחברות במובייל מהעמוד ${href}. פתח את האפליקציה בכתובת ${localNetworkUrl} ונסה שוב.`,
    );
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return getBilingualMessage(
      `On a real phone, localhost points to the phone itself. Open ${localNetworkUrl} on the phone, and make sure ${LOCAL_NETWORK_HOST} is authorized in Firebase Authentication.`,
      `בטלפון אמיתי localhost מצביע לטלפון עצמו. פתח בטלפון את ${localNetworkUrl} וודא ש-${LOCAL_NETWORK_HOST} מורשה ב-Firebase Authentication.`,
    );
  }

  return null;
}

function getLocalNetworkAppUrl() {
  if (typeof window === 'undefined') return officialPublicUrl;
  if (window.location.hostname === 'e-trading-n.firebaseapp.com') return officialPublicUrl;
  const port = window.location.port ? `:${window.location.port}` : '';
  return `${window.location.protocol}//${LOCAL_NETWORK_HOST}${port}`;
}

function describeUser(nextUser: User | null | undefined) {
  if (!nextUser) return null;
  return {
    email: nextUser.email,
    uid: nextUser.uid,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function authDebug(message: string, details?: Record<string, unknown>) {
  if (!isAuthDebugEnabled) return;
  if (typeof window === 'undefined') return;
  console.log('[auth-debug]', message, details ?? {});
}

function getCurrentUrl() {
  if (typeof window === 'undefined') return 'server';
  return window.location.href;
}

function hasPendingRedirect() {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(MOBILE_REDIRECT_PENDING_KEY) !== null;
}

function getPendingRedirectProvider() {
  if (typeof window === 'undefined') return null;
  const providerId = window.sessionStorage.getItem(MOBILE_REDIRECT_PENDING_KEY);
  return providerId === 'google' || providerId === 'facebook' || providerId === 'apple' ? providerId : null;
}

function setPendingRedirect(providerId: AuthProviderId) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(MOBILE_REDIRECT_PENDING_KEY, providerId);
}

function clearPendingRedirect() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(MOBILE_REDIRECT_PENDING_KEY);
}
