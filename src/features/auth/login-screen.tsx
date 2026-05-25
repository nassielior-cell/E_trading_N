'use client';

import type { ReactElement, ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-provider';

import { type AuthProviderId, useAuth } from './auth-provider';

const visibleProviderButtons: Array<{
  id: AuthProviderId;
  brandClassName: string;
  Icon: () => ReactElement;
}> = [
  { id: 'google', brandClassName: 'border-border bg-white !text-ink hover:bg-muted', Icon: GoogleIcon },
];
const isAuthDebugEnabled =
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_ENABLE_AUTH_DEBUG === 'true';

export function LoginScreen() {
  const { language, t } = useLanguage();
  const {
    activeProvider,
    createAccountWithEmail,
    debug,
    error,
    isConfigured,
    isLoading,
    isReady,
    resetPassword,
    setupError,
    signIn,
    signInWithEmail,
    user,
  } = useAuth();
  const isHebrew = language === 'he';
  const authLoading = !isReady || isLoading;
  const [emailMode, setEmailMode] = useState<'login' | 'create' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthDebugEnabled) return;

    console.log('[auth-debug]', 'reason login screen rendered', {
      activeProvider,
      authLoading,
      isConfigured,
      isLoading,
      isReady,
      reason: debug.reasonLoginScreenShown,
      user: user ? { email: user.email, uid: user.uid } : null,
    });
  }, [activeProvider, authLoading, debug.reasonLoginScreenShown, isConfigured, isLoading, isReady, user]);

  async function submitEmailAction() {
    setLocalMessage(null);

    if (emailMode === 'reset') {
      const sent = await resetPassword(email);
      if (sent) {
        setLocalMessage(isHebrew ? 'נשלח מייל לאיפוס סיסמה.' : 'Password reset email sent.');
      }
      return;
    }

    if (emailMode === 'create') {
      await createAccountWithEmail(email, password);
      return;
    }

    await signInWithEmail(email, password);
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-[460px] place-items-center">
        <section className="grid w-full gap-5 rounded-lg border border-border bg-surface p-5 shadow-soft sm:p-6" dir={isHebrew ? 'rtl' : 'ltr'}>
          <div className="grid gap-2">
            <p className="text-xs font-bold uppercase text-subtle">{t('webFoundation')}</p>
            <h1 className="text-2xl font-bold leading-tight text-ink sm:text-3xl">{t('appTitle')}</h1>
            <p className="text-sm font-semibold leading-6 text-subtle">
              {isHebrew
                ? 'התחברות משחזרת יומנים מכל מכשיר. לכל חשבון יש יומנים נפרדים, ויומן חדש מתחיל ריק.'
                : 'Login restores journals from any device. Each account has separate journals, and a new journal starts empty.'}
            </p>
          </div>

          {isAuthDebugEnabled ? (
            <AuthDebugPanel
              authLoading={authLoading}
              currentUrl={debug.currentUrl}
              lastAuthEvent={debug.lastAuthEvent}
              lastRedirectResultStatus={debug.lastRedirectResultStatus}
              persistenceType={debug.persistenceType}
              reasonLoginScreenShown={debug.reasonLoginScreenShown}
              userEmail={user?.email ?? null}
              userExists={Boolean(user)}
              userUid={user?.uid ?? null}
            />
          ) : null}

          <div className="grid gap-3">
            {visibleProviderButtons.map(({ Icon, brandClassName, id }) => {
              const isActive = activeProvider === id;

              return (
                <Button
                  className={`min-h-12 gap-3 border text-base ${brandClassName}`}
                  disabled={!isConfigured || isLoading}
                  key={id}
                  onClick={() => void signIn(id)}
                  type="button"
                >
                  {isActive ? <LoadingDot /> : <Icon />}
                  <span>{getProviderLabel(id, isHebrew, isActive)}</span>
                </Button>
              );
            })}
          </div>

          <div className="grid gap-3 rounded-md border border-border bg-background p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Button onClick={() => setEmailMode('login')} type="button" variant={emailMode === 'login' ? 'primary' : 'secondary'}>
                {isHebrew ? 'התחברות עם מייל וסיסמה' : 'Login with Email/Password'}
              </Button>
              <Button onClick={() => setEmailMode('create')} type="button" variant={emailMode === 'create' ? 'primary' : 'secondary'}>
                {isHebrew ? 'יצירת חשבון חדש' : 'Create New Account'}
              </Button>
              <Button onClick={() => setEmailMode('reset')} type="button" variant={emailMode === 'reset' ? 'primary' : 'secondary'}>
                {isHebrew ? 'שכחתי סיסמה' : 'Forgot Password'}
              </Button>
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-bold text-ink">{getEmailModeTitle(emailMode, isHebrew)}</p>
              <input
                autoComplete="email"
                className="min-h-11 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-blue-100"
                disabled={!isConfigured || isLoading}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={isHebrew ? 'אימייל' : 'Email'}
                type="email"
                value={email}
              />
              <input
                autoComplete="current-password"
                className="min-h-11 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-blue-100"
                disabled={!isConfigured || isLoading || emailMode === 'reset'}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isHebrew ? 'סיסמה' : 'Password'}
                type="password"
                value={password}
              />
              <Button
                disabled={!isConfigured || isLoading || !email || (emailMode !== 'reset' && !password)}
                onClick={() => void submitEmailAction()}
                type="button"
              >
                {getEmailModeAction(emailMode, isHebrew)}
              </Button>
              <p className="text-xs font-semibold leading-5 text-subtle">
                {getEmailModeHelp(emailMode, isHebrew)}
              </p>
            </div>
          </div>

          {!isConfigured && setupError ? (
            <StatusMessage tone="danger">
              <span>{isHebrew ? 'נדרשת הגדרת Firebase לפני התחברות.' : 'Firebase setup is required before login.'}</span>
              <span>{setupError}</span>
            </StatusMessage>
          ) : null}

          {error ? (
            <StatusMessage tone="danger">
              {error.split('\n').map((line) => (
                <span key={line}>{line}</span>
              ))}
            </StatusMessage>
          ) : null}
          {localMessage ? <StatusMessage tone="success">{localMessage}</StatusMessage> : null}

          <p className="text-xs font-semibold leading-5 text-subtle">
            {isHebrew
              ? 'אם חלון התחברות לא נפתח, אפשר חלונות קופצים לאתר ונסה שוב.'
              : 'If a login popup does not open, allow popups for this site and try again.'}
          </p>
        </section>
      </div>
    </main>
  );
}

function AuthDebugPanel({
  authLoading,
  currentUrl,
  lastAuthEvent,
  lastRedirectResultStatus,
  persistenceType,
  reasonLoginScreenShown,
  userEmail,
  userExists,
  userUid,
}: {
  authLoading: boolean;
  currentUrl: string;
  lastAuthEvent: string;
  lastRedirectResultStatus: string;
  persistenceType: string;
  reasonLoginScreenShown: string;
  userEmail: string | null;
  userExists: boolean;
  userUid: string | null;
}) {
  const rows = [
    ['authLoading', String(authLoading)],
    ['user exists', String(userExists)],
    ['user uid', userUid ?? '-'],
    ['user email', userEmail ?? '-'],
    ['current url', currentUrl],
    ['last auth event', lastAuthEvent],
    ['last redirect result', lastRedirectResultStatus],
    ['persistence type', persistenceType],
    ['login reason', reasonLoginScreenShown],
  ];

  return (
    <section className="grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-left text-xs text-amber-950" dir="ltr">
      <h2 className="text-sm font-bold">Mobile Auth Debug</h2>
      <dl className="grid gap-1">
        {rows.map(([label, value]) => (
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2" key={label}>
            <dt className="font-bold">{label}</dt>
            <dd className="break-words font-mono">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function StatusMessage({ children, tone }: { children: ReactNode; tone: 'danger' | 'success' }) {
  return (
    <p className={`grid gap-1 whitespace-pre-line rounded-md p-3 text-sm font-bold leading-6 ${tone === 'danger' ? 'bg-dangerSoft text-danger' : 'bg-successSoft text-success'}`}>
      {children}
    </p>
  );
}

function getEmailModeTitle(mode: 'login' | 'create' | 'reset', isHebrew: boolean) {
  if (mode === 'create') return isHebrew ? 'יצירת חשבון חדש' : 'Create New Account';
  if (mode === 'reset') return isHebrew ? 'שכחתי סיסמה' : 'Forgot Password';
  return isHebrew ? 'התחברות עם מייל וסיסמה' : 'Login with Email/Password';
}

function getEmailModeAction(mode: 'login' | 'create' | 'reset', isHebrew: boolean) {
  if (mode === 'create') return isHebrew ? 'יצירת חשבון חדש' : 'Create New Account';
  if (mode === 'reset') return isHebrew ? 'שלח איפוס סיסמה' : 'Send Password Reset';
  return isHebrew ? 'התחברות עם מייל וסיסמה' : 'Login with Email/Password';
}

function getEmailModeHelp(mode: 'login' | 'create' | 'reset', isHebrew: boolean) {
  if (mode === 'create') {
    return isHebrew ? 'חשבון חדש ייפתח עם יומנים נפרדים משל עצמו.' : 'A new account opens with its own separate journals.';
  }
  if (mode === 'reset') {
    return isHebrew ? 'נשלח מייל איפוס לכתובת אם היא קיימת ב-Firebase.' : 'A reset email is sent if this address exists in Firebase.';
  }
  return isHebrew ? 'אם החשבון קיים, תיכנס ותראה את היומנים הקיימים שלו.' : 'If the account exists, you will sign in and see its existing journals.';
}

function getProviderLabel(providerId: AuthProviderId, isHebrew: boolean, isActive: boolean) {
  if (isActive) return isHebrew ? 'מתחבר...' : 'Signing in...';

  const names: Record<AuthProviderId, string> = {
    google: 'Google',
    facebook: 'Facebook',
    apple: 'Apple',
  };

  return isHebrew ? `המשך עם ${names[providerId]}` : `Continue with ${names[providerId]}`;
}

function LoadingDot() {
  return <span aria-hidden="true" className="size-4 shrink-0 animate-pulse rounded-full bg-current opacity-80" />;
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="size-5 shrink-0" viewBox="0 0 24 24">
      <path d="M21.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.22h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.52Z" fill="#4285F4" />
      <path d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z" fill="#34A853" />
      <path d="M6.4 13.9a6 6 0 0 1 0-3.8V7.51H3.06a10 10 0 0 0 0 8.98L6.4 13.9Z" fill="#FBBC05" />
      <path d="M12 5.98c1.47 0 2.8.51 3.84 1.5l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.51L6.4 10.1C7.2 7.74 9.4 5.98 12 5.98Z" fill="#EA4335" />
    </svg>
  );
}
