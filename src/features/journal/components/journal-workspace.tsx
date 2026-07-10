'use client';

import Link from 'next/link';
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import type { User } from 'firebase/auth';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { LoginScreen } from '@/features/auth/login-screen';
import { useAuth } from '@/features/auth/auth-provider';
import { getTodayDateKey } from '@/lib/dates';
import { useLanguage } from '@/lib/i18n/language-provider';

import { AddEntryModal } from './add-entry-modal';
import { CalendarGrid } from './calendar-grid';
import { DayDetails } from './day-details';
import { DailyDashboard, OpenTradesPanel } from './daily-dashboard';
import { ExportPanel } from './export-panel';
import { HelpPanel } from './help-panel';
import { MonthlySummary } from './monthly-summary';
import { NotificationCenter } from './notification-center';
import { SettingsPanel } from './settings-panel';
import { SharingPanel } from './sharing-panel';
import { WeeklySummary } from './weekly-summary';
import { categories } from '../config/journal-options';
import { firebaseJournalRepository } from '../data/firebase-journal-repository';
import type { AccountValueMode, JournalSummary } from '../data/journal-repository';
import { useJournalStore } from '../store/journal-store';
import {
  formatAccountValue,
  formatSignedMoney,
  getAccountValueForDate,
  getCurrentAccountValue,
  getStartingAccountValue,
} from '../utils/account-value';
import type { Category, JournalType, SpotPosition, Task, Trade } from '@/models/journal';
import { filterTradesForJournalType, getAllowedTradeModes, getJournalTypeLabel, isSpotAllowed, isTradeModeAllowed } from '../utils/journal-scope';
import { getSpotLifecycleStatus, getSpotRemainingQuantity, isSpotOpen } from '../utils/spot-status';
import { isOnOrAfterDate, isSameDate, normalizeDateKey } from '../utils/trade-values';

const donationMethods = [
  {
    id: 'usdt_trc20',
    title: 'USDT TRC20',
    networkEn: 'Tron',
    networkHe: 'טרון',
    address: process.env.NEXT_PUBLIC_DONATION_USDT_TRC20 || 'TMCtvNo8Vp89R1wRmQES5sFq1WWBpLAsVD',
  },
  {
    id: 'btc',
    title: 'BTC',
    networkEn: 'Bitcoin',
    networkHe: 'ביטקוין',
    address: process.env.NEXT_PUBLIC_DONATION_BTC || '14DZLvtV9pjbXSGcNr1aagXJThPJygtqPW',
  },
  {
    id: 'eth',
    title: 'ETH ERC20',
    networkEn: 'Ethereum',
    networkHe: 'אתריום',
    address: process.env.NEXT_PUBLIC_DONATION_ETH || '0x7d7f1e9148960eacd3226d991526a41cf7760d37',
  },
  {
    id: 'sol',
    title: 'SOL',
    networkEn: 'Solana',
    networkHe: 'סולנה',
    address: process.env.NEXT_PUBLIC_DONATION_SOL || '89Zh4EqWFbh3wqkfPTzAJr7ndc4DP9pbLKSWEFaZ6rhB',
  },
];

const JOURNAL_OPEN_TIMEOUT_MS = 8_000;
const ENTRY_LOADING_TIMEOUT_MS = 10_000;

export function JournalWorkspace() {
  const { language, t } = useLanguage();
  const { isLoading: isAuthLoading, isReady: isAuthReady, signOutUser, user } = useAuth();
  const [hasSelectedCloudJournal, setHasSelectedCloudJournal] = useState(false);
  const [isOpeningRememberedJournal, setIsOpeningRememberedJournal] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [monthDate, setMonthDate] = useState(() => new Date(2026, 0, 1));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<string | null>(null);
  const [settingsInitialAccountMode, setSettingsInitialAccountMode] = useState<AccountValueMode | undefined>();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSharingOpen, setIsSharingOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [openSummary, setOpenSummary] = useState<'daily' | 'weekly' | 'monthly' | null>('daily');
  const [isEditingJournalName, setIsEditingJournalName] = useState(false);
  const [isClientReady, setIsClientReady] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | undefined>();
  const [tradeToEdit, setTradeToEdit] = useState<Trade | undefined>();
  const [spotToEdit, setSpotToEdit] = useState<SpotPosition | undefined>();
  const [initialEntryType, setInitialEntryType] = useState<'task' | 'trade' | 'spot'>('trade');
  const [closeExitDate, setCloseExitDate] = useState<string | undefined>();
  const [dayActionDate, setDayActionDate] = useState<string | null>(null);
  const [dayDetailsDate, setDayDetailsDate] = useState<string | null>(null);
  const [newJournalName, setNewJournalName] = useState('');
  const [areSummariesReady, setAreSummariesReady] = useState(false);
  const [isSlowJournalLoad, setIsSlowJournalLoad] = useState(false);
  const [hasEntryLoadingTimedOut, setHasEntryLoadingTimedOut] = useState(false);
  const [currentSearch, setCurrentSearch] = useState('');
  const hasAppliedUrlWorkspaceRef = useRef(false);
  const days = useJournalStore((state) => state.days);
  const tasks = useJournalStore((state) => state.tasks);
  const trades = useJournalStore((state) => state.trades);
  const spots = useJournalStore((state) => state.spots);
  const syncStatus = useJournalStore((state) => state.syncStatus);
  const syncMessage = useJournalStore((state) => state.syncMessage);
  const lastSyncedAt = useJournalStore((state) => state.lastSyncedAt);
  const events = useJournalStore((state) => state.events);
  const lastTradeAction = useJournalStore((state) => state.lastTradeAction);
  const dataSource = useJournalStore((state) => state.dataSource);
  const firestorePath = useJournalStore((state) => state.firestorePath);
  const workspaceId = useJournalStore((state) => state.workspaceId);
  const journalName = useJournalStore((state) => state.journalName);
  const journalType = useJournalStore((state) => state.journalType);
  const updateJournalType = useJournalStore((state) => state.updateJournalType);
  const updateJournalName = useJournalStore((state) => state.updateJournalName);
  const journals = useJournalStore((state) => state.journals);
  const switchJournal = useJournalStore((state) => state.switchJournal);
  const createNewJournal = useJournalStore((state) => state.createNewJournal);
  const accountValueResets = useJournalStore((state) => state.accountValueResets);
  const isViewOnly = useJournalStore((state) => state.isViewOnly);
  const accessMode = useJournalStore((state) => state.accessMode);
  const sharePermission = useJournalStore((state) => state.sharePermission);
  const shareCode = useJournalStore((state) => state.shareCode);
  const sharedOwnerId = useJournalStore((state) => state.sharedOwnerId);
  const initializeCloudSync = useJournalStore((state) => state.initializeCloudSync);
  const initializeSharedJournal = useJournalStore((state) => state.initializeSharedJournal);
  const resetCloudJournalState = useJournalStore((state) => state.resetCloudJournalState);
  const previousUserIdRef = useRef<string | undefined>(undefined);
  const urlParams = useMemo(() => new URLSearchParams(currentSearch), [currentSearch]);
  const urlShareCode = urlParams.get('shareCode');
  const hasSharedUrlParams = Boolean(urlShareCode);
  const isSharedJournal = accessMode === 'viewer' && Boolean(sharedOwnerId && sharePermission);

  useEffect(() => {
    const today = getTodayDateKey();
    setIsClientReady(true);
    setSelectedDate((current) => current || today);
    setMonthDate(new Date(`${today}T00:00:00`));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateSearch = () => setCurrentSearch(window.location.search);
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args);
      window.dispatchEvent(new Event('e-trading-n:url-change'));
      return result;
    };

    window.history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      window.dispatchEvent(new Event('e-trading-n:url-change'));
      return result;
    };

    updateSearch();
    scrubLegacyViewerModeStorage(window.localStorage);
    scrubLegacyViewerModeStorage(window.sessionStorage);
    window.addEventListener('popstate', updateSearch);
    window.addEventListener('e-trading-n:url-change', updateSearch);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', updateSearch);
      window.removeEventListener('e-trading-n:url-change', updateSearch);
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    const nextUserId = user?.uid;
    if (previousUserIdRef.current === nextUserId) return;

    previousUserIdRef.current = nextUserId;
    resetCloudJournalState(nextUserId);
    setHasSelectedCloudJournal(false);
    setIsOpeningRememberedJournal(false);
    setIsSettingsOpen(false);
    setSettingsInitialSection(null);
    hasAppliedUrlWorkspaceRef.current = false;
  }, [isAuthReady, resetCloudJournalState, user?.uid]);

  useEffect(() => {
    if (!isAuthReady || !user?.uid || hasSharedUrlParams) return;
    if (!shareCode && !isSharedJournal) return;

    resetCloudJournalState(user.uid);
    setHasSelectedCloudJournal(false);
    setIsOpeningRememberedJournal(false);
    setIsSettingsOpen(false);
    setSettingsInitialSection(null);
    hasAppliedUrlWorkspaceRef.current = false;
  }, [hasSharedUrlParams, isAuthReady, isSharedJournal, resetCloudJournalState, shareCode, user?.uid]);

  useEffect(() => {
    let isMounted = true;
    const rememberedJournalId = user?.uid ? getRememberedJournalSelection(user.uid) : null;

    if (!isAuthReady) {
      return;
    }

    if (user?.uid && urlShareCode) {
      setIsOpeningRememberedJournal(true);
      void withTimeout(
        initializeSharedJournal(user.uid, urlShareCode),
        JOURNAL_OPEN_TIMEOUT_MS,
        'shared journal open timed out',
      )
        .then((didOpen) => {
          if (!isMounted) return;
          setHasSelectedCloudJournal(didOpen);
        })
        .catch(() => {
          if (!isMounted) return;
          setHasSelectedCloudJournal(false);
        })
        .finally(() => {
          if (isMounted) setIsOpeningRememberedJournal(false);
        });

      return () => {
        isMounted = false;
      };
    }

    if (!user?.uid || !rememberedJournalId) {
      setHasSelectedCloudJournal(false);
      setIsOpeningRememberedJournal(false);
      return;
    }

    setIsOpeningRememberedJournal(true);
    void withTimeout(
      initializeCloudSync(user.uid, rememberedJournalId),
      JOURNAL_OPEN_TIMEOUT_MS,
      'remembered journal open timed out',
    )
      .then((didOpen) => {
        if (!isMounted) return;
        setHasSelectedCloudJournal(didOpen || true);
      })
      .catch(() => {
        if (!isMounted) return;
        setHasSelectedCloudJournal(true);
      })
      .finally(() => {
        if (isMounted) setIsOpeningRememberedJournal(false);
      });

    return () => {
      isMounted = false;
    };
  }, [initializeCloudSync, initializeSharedJournal, isAuthReady, urlShareCode, user?.uid]);

  useEffect(() => {
    if (isSharedJournal) return;

    if (user?.uid && hasSelectedCloudJournal && journals.some((journal) => journal.workspaceId === workspaceId)) {
      rememberJournalSelection(user.uid, workspaceId);
    }
    if (
      user?.uid &&
      hasSelectedCloudJournal &&
      syncStatus !== 'syncing' &&
      !journals.some((journal) => journal.workspaceId === workspaceId)
    ) {
      forgetRememberedJournalSelection(user.uid);
      setHasSelectedCloudJournal(false);
    }
  }, [hasSelectedCloudJournal, isSharedJournal, journals, syncStatus, user?.uid, workspaceId]);

  useEffect(() => {
    hasAppliedUrlWorkspaceRef.current = false;
  }, [currentSearch]);

  useEffect(() => {
    if (!isClientReady || hasAppliedUrlWorkspaceRef.current) return;

    if (hasSharedUrlParams) {
      hasAppliedUrlWorkspaceRef.current = true;
      return;
    }

    const requestedWorkspace = urlParams.get('workspace');
    if (!requestedWorkspace) {
      hasAppliedUrlWorkspaceRef.current = true;
      return;
    }

    if (
      requestedWorkspace !== workspaceId &&
      journals.some((journal) => journal.workspaceId === requestedWorkspace)
    ) {
      hasAppliedUrlWorkspaceRef.current = true;
      switchJournal(requestedWorkspace);
      return;
    }

    if (requestedWorkspace === workspaceId || journals.length) {
      hasAppliedUrlWorkspaceRef.current = true;
    }
  }, [hasSharedUrlParams, isClientReady, journals, switchJournal, urlParams, workspaceId]);

  const visibleDays = useMemo(() => (isClientReady ? days : {}), [days, isClientReady]);
  const visibleTasks = useMemo(() => (isClientReady ? tasks : {}), [isClientReady, tasks]);
  const visibleTrades = useMemo(() => (isClientReady ? trades : {}), [isClientReady, trades]);
  const visibleSpots = useMemo(() => (isClientReady ? spots : {}), [isClientReady, spots]);
  const allVisibleTrades = useMemo(() => filterTradesForJournalType(Object.values(visibleTrades), journalType), [journalType, visibleTrades]);
  const allVisibleSpots = useMemo(() => isSpotAllowed(journalType) ? Object.values(visibleSpots) : [], [journalType, visibleSpots]);
  const allowedTradeModes = useMemo(() => getAllowedTradeModes(journalType), [journalType]);
  const isLoadingEntries = syncStatus === 'syncing' && !hasEntryLoadingTimedOut;
  const tradesForSummaries = areSummariesReady ? allVisibleTrades : [];
  const spotsForSummaries = useMemo(() => (areSummariesReady ? allVisibleSpots : []), [allVisibleSpots, areSummariesReady]);
  const selectedDay = visibleDays[selectedDate];
  const selectedTasks = useMemo(
    () => selectedDay?.taskIds.map((taskId) => visibleTasks[taskId]).filter(Boolean) ?? [],
    [selectedDay, visibleTasks],
  );
  const selectedTrades = useMemo(
    () => getTradesOpenedOnDate(filterTradesForJournalType(selectedDay?.tradeIds.map((tradeId) => visibleTrades[tradeId]).filter(Boolean) ?? [], journalType), selectedDate),
    [journalType, selectedDate, selectedDay, visibleTrades],
  );
  const selectedSpots = useMemo(
    () => isSpotAllowed(journalType) && selectedDate
      ? getSpotsOpenedOrSoldOnDate(Object.values(visibleSpots), selectedDate)
      : [],
    [journalType, selectedDate, visibleSpots],
  );
  const getClosableOpenLiveTrades = useCallback(
    (dateKey: string) => getOpenTradesEligibleForCloseOnDate({
      dateKey,
      trades: allVisibleTrades,
      journalType,
    }),
    [allVisibleTrades, journalType],
  );
  const getClosableOpenSpots = useCallback(
    (dateKey: string) => getOpenSpotsEligibleForCloseOnDate({
      dateKey,
      spots: allVisibleSpots,
      journalType,
    }),
    [allVisibleSpots, journalType],
  );
  const actionOpenLiveTrades = useMemo(() => dayActionDate ? getClosableOpenLiveTrades(dayActionDate) : [], [dayActionDate, getClosableOpenLiveTrades]);
  const actionOpenSpots = useMemo(() => dayActionDate ? getClosableOpenSpots(dayActionDate) : [], [dayActionDate, getClosableOpenSpots]);

  useEffect(() => {
    setAreSummariesReady(false);
    const timer = window.setTimeout(() => {
      setAreSummariesReady(true);
    }, isLoadingEntries ? 450 : 80);

    return () => window.clearTimeout(timer);
  }, [allVisibleTrades.length, isLoadingEntries, workspaceId]);

  useEffect(() => {
    if (syncStatus !== 'syncing') {
      setHasEntryLoadingTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => {
      console.warn('[journal-open]', 'Entry loading timed out; rendering cached journal fallback', {
        workspaceId,
        tasks: Object.keys(visibleTasks).length,
        trades: Object.keys(visibleTrades).length,
        spots: Object.keys(visibleSpots).length,
      });
      setHasEntryLoadingTimedOut(true);
      setAreSummariesReady(true);
      setIsSlowJournalLoad(false);
    }, ENTRY_LOADING_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [syncStatus, visibleSpots, visibleTasks, visibleTrades, workspaceId]);

  useEffect(() => {
    if (!isLoadingEntries && areSummariesReady) {
      setIsSlowJournalLoad(false);
      return;
    }

    const timer = window.setTimeout(() => setIsSlowJournalLoad(true), 8000);
    return () => window.clearTimeout(timer);
  }, [areSummariesReady, isLoadingEntries, workspaceId]);

  if (!isAuthReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4">
        <p className="text-sm font-bold text-subtle">{isAuthLoading ? (language === 'he' ? 'מתחבר...' : 'Signing in...') : language === 'he' ? 'טוען...' : 'Loading...'}</p>
      </main>
    );
  }

  if (isAuthLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4">
        <p className="text-sm font-bold text-subtle">{language === 'he' ? 'מתחבר...' : 'Signing in...'}</p>
      </main>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (isOpeningRememberedJournal) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4">
        <p className="text-sm font-bold text-subtle">{language === 'he' ? 'פותח יומן...' : 'Opening journal...'}</p>
      </main>
    );
  }

  if (!hasSelectedCloudJournal) {
    return (
      <PostLoginJournalGate
        onCreateJournal={async (name, nextJournalType) => {
          const journalId = `journal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          const didOpen = await withTimeout(
            initializeCloudSync(user.uid, journalId, { createIfMissing: true }),
            JOURNAL_OPEN_TIMEOUT_MS,
            'new journal open timed out',
          );
          if (!didOpen) throw new Error(language === 'he' ? 'לא ניתן ליצור את היומן כרגע. בדוק חיבור ונסה שוב.' : 'Could not create the journal right now. Check the connection and try again.');
          if (name.trim()) updateJournalName(name);
          updateJournalType(nextJournalType);
          rememberJournalSelection(user.uid, journalId);
          setHasSelectedCloudJournal((current) => current || true);
        }}
        onOpenJournal={async (journalId) => {
          const didOpen = await withTimeout(
            initializeCloudSync(user.uid, journalId),
            JOURNAL_OPEN_TIMEOUT_MS,
            'journal open timed out',
          );
          if (!didOpen) throw new Error(language === 'he' ? 'לא ניתן לפתוח את היומן הזה. הרשימה נשארה פתוחה כדי לבחור יומן אחר.' : 'Could not open this journal. The list stayed open so you can choose another journal.');
          rememberJournalSelection(user.uid, journalId);
          setHasSelectedCloudJournal((current) => current || true);
        }}
        onSignOut={() => void signOutUser()}
        user={user}
      />
    );
  }

  return (
    <JournalWorkspaceErrorBoundary
      language={language}
      onBack={() => {
        setHasSelectedCloudJournal(false);
        setIsModalOpen(false);
        setIsSettingsOpen(false);
      }}
    >
    <main className="min-h-screen w-full bg-background">
      <div className="mx-auto grid w-full max-w-[1400px] min-w-0 gap-4 px-3 py-4 sm:gap-5 sm:px-5 sm:py-6">
        <header className="grid min-w-0 gap-3 md:flex md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-subtle">{t('webFoundation')}</p>
            <div className="flex flex-wrap items-center gap-2">
              {isEditingJournalName && !isSharedJournal ? (
                <input
                  autoFocus
                  className="min-h-10 max-w-full rounded-md border border-border bg-surface px-3 py-1 text-2xl font-bold leading-tight text-ink outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 sm:text-3xl"
                  onBlur={(event) => {
                    updateJournalName(event.target.value);
                    setIsEditingJournalName(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      updateJournalName(event.currentTarget.value);
                      setIsEditingJournalName(false);
                    }
                    if (event.key === 'Escape') setIsEditingJournalName(false);
                  }}
                  defaultValue={journalName}
                />
              ) : (
                <button className="break-words text-start text-2xl font-bold leading-tight text-ink sm:text-3xl" disabled={isSharedJournal} onClick={() => setIsEditingJournalName(true)} type="button">
                  {journalName || t('appTitle')}
                </button>
              )}
              {isSharedJournal ? (
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold uppercase text-subtle">
                  {sharePermission === 'edit'
                    ? language === 'he' ? 'שיתוף: עריכה' : 'Shared Edit'
                    : language === 'he' ? 'צפייה בלבד' : 'View Only'}
                </span>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap md:items-center">
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-muted px-4 py-2 text-sm font-semibold text-ink transition hover:bg-border"
              href={isSharedJournal && shareCode
                ? `/statistics?shareCode=${encodeURIComponent(shareCode)}`
                : `/statistics?workspace=${encodeURIComponent(workspaceId)}`}
            >
              {t('customStatistics')}
            </Link>
            <NotificationCenter
              spots={Object.values(visibleSpots)}
              trades={allVisibleTrades}
              onOpenSpot={(spot) => {
                setSpotToEdit(spot);
                setTradeToEdit(undefined);
                setTaskToEdit(undefined);
                setIsModalOpen(true);
              }}
              onOpenTrade={(trade) => {
                setTradeToEdit(trade);
                setSpotToEdit(undefined);
                setTaskToEdit(undefined);
                setIsModalOpen(true);
              }}
            />
            <button
              aria-label={language === 'he' ? 'תמיכה בפיתוח' : 'Support Development'}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-muted px-3 py-2 text-sm font-bold text-subtle transition hover:bg-border hover:text-ink"
              onClick={() => setIsSupportOpen(true)}
              title={language === 'he' ? 'תמיכה בפיתוח' : 'Support Development'}
              type="button"
            >
              <span aria-hidden="true" className="text-base">♡</span>
              <span>{language === 'he' ? 'תמיכה' : 'Support'}</span>
            </button>
            <Button
              disabled={false}
              onClick={() => {
                setSettingsInitialAccountMode(undefined);
                setIsSettingsOpen(true);
              }}
              type="button"
              variant="secondary"
            >
              {t('settings')}
            </Button>
            <Button onClick={() => void signOutUser()} type="button" variant="secondary">
              {language === 'he' ? 'התנתקות' : 'Sign out'}
            </Button>
            <Button
              disabled={isViewOnly}
              onClick={() => {
                setTaskToEdit(undefined);
                setTradeToEdit(undefined);
                setInitialEntryType('trade');
                setCloseExitDate(undefined);
                setIsModalOpen(true);
              }}
            >
              {t('addEntry')}
            </Button>
          </div>
        </header>

        <section className="hidden">
          <div className="grid gap-2">
            <p className="text-xs font-bold uppercase text-subtle">
              {language === 'he' ? 'יומנים בענן' : 'Cloud journals'}
            </p>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="grid gap-1 text-sm font-semibold text-ink">
                {language === 'he' ? 'שם יומן חדש' : 'New journal name'}
                <input
                  className="min-h-10 rounded-md border border-border bg-white px-3 py-2 text-sm font-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-blue-100"
                  onChange={(event) => setNewJournalName(event.target.value)}
                  placeholder={language === 'he' ? 'יומן מסחר חדש' : 'New trading journal'}
                  value={newJournalName}
                />
              </label>
              <Button
                disabled={isViewOnly}
                onClick={() => {
                  createNewJournal(newJournalName);
                  setNewJournalName('');
                }}
                type="button"
                variant="secondary"
              >
                {language === 'he' ? 'צור יומן' : 'Create Journal'}
              </Button>
            </div>
            <p className="text-xs font-semibold text-subtle">
              {language === 'he'
                ? 'כניסה מאותו חשבון במכשיר אחר תציג כאן את אותם יומנים.'
                : 'Signing in with this account on another device will recover the same journals here.'}
            </p>
          </div>
          <div className="grid gap-2">
            <p className="text-xs font-bold uppercase text-subtle">{language === 'he' ? 'רשימת יומנים' : 'Existing journals'}</p>
            <div className="grid max-h-40 gap-2 overflow-y-auto">
              {journals.map((journal) => (
                <button
                  className={`rounded-md border px-3 py-2 text-start text-sm font-bold transition ${
                    journal.workspaceId === workspaceId
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted text-ink hover:bg-border'
                  }`}
                  key={journal.workspaceId}
                  onClick={() => switchJournal(journal.workspaceId)}
                  type="button"
                >
                  <span className="block break-words">{journal.name}</span>
                  <span className="block break-all text-xs font-semibold text-subtle">{journal.workspaceId}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {(isLoadingEntries || !areSummariesReady) ? (
          <section className="grid gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm font-bold text-primary shadow-soft">
            <p>
              {isLoadingEntries
                ? language === 'he'
                  ? 'טוען עסקאות...'
                  : 'Loading trades...'
                : language === 'he'
                  ? 'מחשב סיכומים...'
                  : 'Calculating summaries...'}
            </p>
            <div className="h-2 overflow-hidden rounded bg-white">
              <div className="h-full w-2/3 animate-pulse rounded bg-primary" />
            </div>
            {isSlowJournalLoad ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background p-3 text-ink">
                <p className="text-sm font-semibold">
                  {language === 'he'
                    ? 'הטעינה מתארכת, אפשר לחזור לרשימת היומנים'
                    : 'Loading is taking longer than usual. You can return to the journal list.'}
                </p>
                <Button onClick={() => setHasSelectedCloudJournal(false)} type="button" variant="secondary">
                  {language === 'he' ? 'חזרה לרשימת היומנים' : 'Back to journal list'}
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {journals.length && !isSharedJournal ? (
          <section className="grid gap-2 rounded-lg border border-border bg-surface p-3 shadow-soft sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="grid gap-1 text-sm font-semibold text-ink">
              {language === 'he' ? 'בחירת יומן' : 'Journal switcher'}
              <select
                className="min-h-10 rounded-md border border-border bg-white px-3 py-2 text-sm font-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-blue-100"
                onChange={(event) => switchJournal(event.target.value)}
                value={journals.some((journal) => journal.workspaceId === workspaceId) ? workspaceId : journals[0]?.workspaceId ?? ''}
              >
                {journals.map((journal) => (
                  <option key={journal.workspaceId} value={journal.workspaceId}>
                    {journal.name}
                  </option>
                ))}
              </select>
            </label>
          </section>
        ) : !isSharedJournal ? (
          <section className="grid gap-2 rounded-lg border border-border bg-surface p-3 shadow-soft">
            <p className="text-sm font-bold text-ink">{language === 'he' ? 'אין יומנים קיימים' : 'No journals yet'}</p>
            <Button onClick={() => setHasSelectedCloudJournal(false)} type="button" variant="secondary">
              {language === 'he' ? 'צור יומן חדש' : 'Create New Journal'}
            </Button>
          </section>
        ) : null}

        <AccountValueModePanel accountValueResets={accountValueResets} date={selectedDate} journalType={journalType} language={language} spots={spotsForSummaries} trades={tradesForSummaries} />

        <div className="grid min-w-0 grid-cols-1 gap-4 md:gap-5">
          <div className="grid min-w-0 max-w-full gap-5 overflow-hidden">
            <DailyDashboard
              accountValueResets={accountValueResets}
              allTrades={tradesForSummaries}
              date={selectedDate}
              journalType={journalType}
              onOpenTrade={(trade) => {
                setTradeToEdit(trade);
                setTaskToEdit(undefined);
                setSpotToEdit(undefined);
                setIsModalOpen(true);
              }}
              onOpenSpot={(spot) => {
                setSpotToEdit(spot);
                setTradeToEdit(undefined);
                setTaskToEdit(undefined);
                setIsModalOpen(true);
              }}
              showOpenTrades={false}
              spots={spotsForSummaries}
              trades={areSummariesReady ? selectedTrades : []}
              isOpen={openSummary === 'daily'}
              onToggle={() => setOpenSummary((current) => (current === 'daily' ? null : 'daily'))}
            />
            <WeeklySummary accountValueResets={accountValueResets} date={selectedDate} journalType={journalType} spots={spotsForSummaries} trades={tradesForSummaries} isOpen={openSummary === 'weekly'} onToggle={() => setOpenSummary((current) => (current === 'weekly' ? null : 'weekly'))} />
            <MonthlySummary accountValueResets={accountValueResets} journalType={journalType} monthDate={monthDate} spots={spotsForSummaries} trades={tradesForSummaries} isOpen={openSummary === 'monthly'} onToggle={() => setOpenSummary((current) => (current === 'monthly' ? null : 'monthly'))} />
            {isTradeModeAllowed(journalType, 'live') || isSpotAllowed(journalType) ? <OpenTradesPanel
              allTrades={allVisibleTrades}
              journalType={journalType}
              spots={allVisibleSpots}
              onOpenTrade={(trade) => {
                setTradeToEdit(trade);
                setTaskToEdit(undefined);
                setSpotToEdit(undefined);
                setIsModalOpen(true);
              }}
              onOpenSpot={(spot) => {
                setSpotToEdit(spot);
                setTradeToEdit(undefined);
                setTaskToEdit(undefined);
                setIsModalOpen(true);
              }}
            /> : null}
            <WorkspacePanel
              categories={categories}
              dataSource={dataSource}
              eventsLength={events.length}
              firestorePath={firestorePath}
              isDebugOpen={isDebugOpen}
              isOpen={isWorkspaceOpen}
              lastSyncedAt={lastSyncedAt}
              lastTradeActionType={lastTradeAction?.type}
              onDebugToggle={() => setIsDebugOpen((current) => !current)}
              onToggle={() => setIsWorkspaceOpen((current) => !current)}
              syncMessage={syncMessage}
              syncStatus={syncStatus}
              t={t}
              workspaceId={workspaceId}
            />
            <CalendarGrid
              days={visibleDays}
              monthDate={monthDate}
              onMonthChange={setMonthDate}
              onOpenEntry={(dateKey) => {
                if (isViewOnly) return;
                setSelectedDate(dateKey);
                setTaskToEdit(undefined);
                setTradeToEdit(undefined);
                setSpotToEdit(undefined);
                setCloseExitDate(undefined);
                setInitialEntryType(journalType === 'spotOnly' ? 'spot' : 'trade');
                setDayActionDate(dateKey);
              }}
              onOpenDayDetails={(dateKey) => {
                setSelectedDate(dateKey);
                setDayDetailsDate(dateKey);
              }}
              onSelectDate={setSelectedDate}
              selectedDate={selectedDate}
              spots={visibleSpots}
              trades={visibleTrades}
              allowedModes={allowedTradeModes}
            />
            <DayDetails
              date={selectedDate}
              day={selectedDay}
              isViewOnly={isViewOnly}
              onEditTask={(task) => {
                if (isViewOnly) return;
                setTaskToEdit(task);
                setTradeToEdit(undefined);
                setSpotToEdit(undefined);
                setIsModalOpen(true);
              }}
              onEditTrade={(trade) => {
                if (isViewOnly) return;
                setTradeToEdit(trade);
                setTaskToEdit(undefined);
                setSpotToEdit(undefined);
                setIsModalOpen(true);
              }}
              onEditSpot={(spot) => {
                if (isViewOnly) return;
                setSpotToEdit(spot);
                setTradeToEdit(undefined);
                setTaskToEdit(undefined);
                setIsModalOpen(true);
              }}
              spots={selectedSpots}
              tasks={selectedTasks}
              trades={selectedTrades}
            />
          </div>
        </div>
      </div>

      <AddEntryModal
        closeExitDate={closeExitDate}
        date={selectedDate}
        initialEntryType={initialEntryType}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setTaskToEdit(undefined);
          setTradeToEdit(undefined);
          setSpotToEdit(undefined);
          setCloseExitDate(undefined);
          setInitialEntryType('trade');
        }}
        onOpenAccountSettings={(mode) => {
          setSettingsInitialSection('account');
          setSettingsInitialAccountMode(mode);
          setIsSettingsOpen(true);
        }}
        taskToEdit={taskToEdit}
        tradeToEdit={tradeToEdit}
        spotToEdit={spotToEdit}
      />
      <DayActionModal
        date={dayActionDate ?? selectedDate}
        isOpen={Boolean(dayActionDate)}
        language={language}
        onAddTask={() => {
          if (!dayActionDate) return;
          setSelectedDate(dayActionDate);
          setTaskToEdit(undefined);
          setTradeToEdit(undefined);
          setCloseExitDate(undefined);
          setInitialEntryType('task');
          setDayActionDate(null);
          setIsModalOpen(true);
        }}
        onAddTrade={() => {
          if (!dayActionDate) return;
          setSelectedDate(dayActionDate);
          setTaskToEdit(undefined);
          setTradeToEdit(undefined);
          setCloseExitDate(undefined);
          setInitialEntryType('trade');
          setDayActionDate(null);
          setIsModalOpen(true);
        }}
        onClose={() => setDayActionDate(null)}
        onCloseTrade={(trade) => {
          if (!dayActionDate) return;
          setSelectedDate(dayActionDate);
          setTaskToEdit(undefined);
          setTradeToEdit(trade);
          setCloseExitDate(dayActionDate);
          setInitialEntryType('trade');
          setDayActionDate(null);
          setIsModalOpen(true);
        }}
        onCloseSpot={(spot) => {
          if (!dayActionDate) return;
          setSelectedDate(dayActionDate);
          setTaskToEdit(undefined);
          setTradeToEdit(undefined);
          setSpotToEdit(spot);
          setCloseExitDate(dayActionDate);
          setInitialEntryType('spot');
          setDayActionDate(null);
          setIsModalOpen(true);
        }}
        openLiveTrades={actionOpenLiveTrades}
        openSpotPositions={actionOpenSpots}
      />
      <CalendarDayDetailsModal
        date={dayDetailsDate ?? selectedDate}
        isOpen={Boolean(dayDetailsDate)}
        isViewOnly={isViewOnly}
        language={language}
        onClose={() => setDayDetailsDate(null)}
        onEditSpot={(spot) => {
          if (isViewOnly) return;
          setSpotToEdit(spot);
          setTradeToEdit(undefined);
          setTaskToEdit(undefined);
          setDayDetailsDate(null);
          setIsModalOpen(true);
        }}
        onEditTask={(task) => {
          if (isViewOnly) return;
          setTaskToEdit(task);
          setTradeToEdit(undefined);
          setSpotToEdit(undefined);
          setDayDetailsDate(null);
          setIsModalOpen(true);
        }}
        onEditTrade={(trade) => {
          if (isViewOnly) return;
          setTradeToEdit(trade);
          setTaskToEdit(undefined);
          setSpotToEdit(undefined);
          setDayDetailsDate(null);
          setIsModalOpen(true);
        }}
        spots={Object.values(visibleSpots)}
        tasks={dayDetailsDate ? visibleDays[dayDetailsDate]?.taskIds.map((taskId) => visibleTasks[taskId]).filter(Boolean) ?? [] : []}
        trades={dayDetailsDate ? filterTradesForJournalType(visibleDays[dayDetailsDate]?.tradeIds.map((tradeId) => visibleTrades[tradeId]).filter(Boolean) ?? [], journalType) : []}
      />
      <SettingsPanel
        initialAccountMode={settingsInitialAccountMode}
        initialSection={settingsInitialSection}
        isOpen={isSettingsOpen}
        isReadOnly={isSharedJournal || isViewOnly}
        onClose={() => {
          setIsSettingsOpen(false);
          setSettingsInitialSection(null);
          setSettingsInitialAccountMode(undefined);
        }}
        onDeletedCurrentJournal={() => {
          if (user?.uid) forgetRememberedJournalSelection(user.uid);
          setHasSelectedCloudJournal(false);
          setIsSettingsOpen(false);
          setSettingsInitialSection(null);
          setSettingsInitialAccountMode(undefined);
        }}
        onOpenExport={() => {
          setIsSettingsOpen(false);
          setIsExportOpen(true);
        }}
        onOpenHelp={() => {
          setIsSettingsOpen(false);
          setIsHelpOpen(true);
        }}
        onOpenSharing={() => {
          setIsSettingsOpen(false);
          setIsSharingOpen(true);
        }}
      />
      <ExportPanel isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
      <HelpPanel isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <SharingPanel isOpen={isSharingOpen} onClose={() => setIsSharingOpen(false)} />
      <SupportDevelopmentModal isOpen={isSupportOpen} language={language} onClose={() => setIsSupportOpen(false)} />
    </main>
    </JournalWorkspaceErrorBoundary>
  );
}

function CalendarDayDetailsModal({
  date,
  isOpen,
  isViewOnly,
  language,
  onClose,
  onEditSpot,
  onEditTask,
  onEditTrade,
  spots,
  tasks,
  trades,
}: {
  date: string;
  isOpen: boolean;
  isViewOnly: boolean;
  language: string;
  onClose: () => void;
  onEditSpot: (spot: SpotPosition) => void;
  onEditTask: (task: Task) => void;
  onEditTrade: (trade: Trade) => void;
  spots: SpotPosition[];
  tasks: Task[];
  trades: Trade[];
}) {
  const isHebrew = language === 'he';
  const spotBuyEvents = spots.filter((spot) => isSameDate(spot.buyDate, date));
  const spotSellEvents = spots.flatMap((spot) => spot.sells.filter((sell) => isSameDate(sell.sellDate, date)).map((sell) => ({ spot, sell })));
  const openSpotsOpenedOnDate = spotBuyEvents.filter(isSpotOpen);
  const hasItems = tasks.length || trades.length || spotBuyEvents.length || spotSellEvents.length;

  return (
    <Modal closeLabel={isHebrew ? 'סגור' : 'Close'} isOpen={isOpen} onClose={onClose} title={`${isHebrew ? 'פרטי יום' : 'Day Details'} · ${date}`}>
      <div className="grid max-h-[70dvh] gap-4 overflow-y-auto pr-1">
        <CalendarDaySection title={isHebrew ? 'משימות' : 'Tasks'}>
          {tasks.map((task) => (
            <CalendarDayItem
              key={task.id}
              meta={[task.startTime, task.endTime].filter(Boolean).join(' - ') || date}
              onClick={() => onEditTask(task)}
              title={task.title}
              value={task.notes}
              disabled={isViewOnly}
            />
          ))}
        </CalendarDaySection>

        <CalendarDaySection title={isHebrew ? 'טריידים' : 'Trades'}>
          {trades.map((trade) => (
            <CalendarDayItem
              key={trade.id}
              meta={`${trade.status === 'open' ? (isHebrew ? 'פתוח' : 'Open') : (isHebrew ? 'סגור' : 'Closed')} · ${trade.entryDate} ${trade.entryTime}`}
              onClick={() => onEditTrade(trade)}
              title={trade.title || `${trade.mode} · ${trade.coin}`}
              value={`${isHebrew ? 'רווח/הפסד' : 'P/L'}: ${formatSignedMoney(trade.pnl)}`}
              disabled={isViewOnly}
            />
          ))}
        </CalendarDaySection>

        <CalendarDaySection title={isHebrew ? 'קניות ספוט' : 'Spot Buy Events'}>
          {spotBuyEvents.map((spot) => (
            <CalendarDayItem
              key={`buy-${spot.id}`}
              markerClass="bg-blue-600"
              meta={`${isHebrew ? 'קנייה' : 'Buy'} · ${spot.buyDate} ${spot.buyTime ?? ''}`}
              onClick={() => onEditSpot(spot)}
              title={spot.assetName}
              value={`${isHebrew ? 'כמות' : 'Qty'}: ${spot.quantityBought} · ${isHebrew ? 'עלות' : 'Cost'}: ${formatAccountValue(spot.expectedBuyCost)}`}
              disabled={isViewOnly}
            />
          ))}
        </CalendarDaySection>

        <CalendarDaySection title={isHebrew ? 'מכירות ספוט' : 'Spot Sell Events'}>
          {spotSellEvents.map(({ sell, spot }) => (
            <CalendarDayItem
              key={`sell-${spot.id}-${sell.id}`}
              markerClass="bg-emerald-600"
              meta={`${isHebrew ? 'מכירה / סגירה' : 'Sell / Close'} · ${sell.sellDate} ${sell.sellTime ?? ''}`}
              onClick={() => onEditSpot(spot)}
              title={spot.assetName}
              value={`${isHebrew ? 'כמות' : 'Qty'}: ${sell.quantitySold} · ${isHebrew ? 'רווח/הפסד' : 'P/L'}: ${formatSignedMoney(sell.netPnl)}`}
              disabled={isViewOnly}
            />
          ))}
        </CalendarDaySection>

        <CalendarDaySection title={isHebrew ? 'פוזיציות ספוט שנפתחו' : 'Spot Positions Opened'}>
          {openSpotsOpenedOnDate.map((spot) => {
            const remainingQuantity = getSpotRemainingQuantity(spot);

            return (
              <CalendarDayItem
                key={`open-${spot.id}`}
                markerClass="bg-yellow-500"
                meta={getSpotLifecycleStatus(spot) === 'partially_sold' ? (isHebrew ? 'נמכר חלקית' : 'Partially sold') : (isHebrew ? 'פתוח' : 'Open')}
                onClick={() => onEditSpot(spot)}
                title={spot.assetName}
                value={`${isHebrew ? 'נותר' : 'Remaining'}: ${remainingQuantity} · ${isHebrew ? 'בסיס פתוח' : 'Open cost'}: ${formatAccountValue(spot.quantityBought > 0 ? (remainingQuantity / spot.quantityBought) * spot.expectedBuyCost : 0)}`}
                disabled={isViewOnly}
              />
            );
          })}
        </CalendarDaySection>

        {!hasItems ? (
          <p className="rounded-md bg-muted p-3 text-sm font-semibold text-subtle">{isHebrew ? 'אין פריטים ביום הזה' : 'No items for this date'}</p>
        ) : null}
      </div>
    </Modal>
  );
}

function CalendarDaySection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-bold uppercase text-subtle">{title}</h3>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function CalendarDayItem({
  disabled,
  markerClass = 'bg-subtle',
  meta,
  onClick,
  title,
  value,
}: {
  disabled: boolean;
  markerClass?: string;
  meta: string;
  onClick: () => void;
  title: string;
  value?: string;
}) {
  return (
    <button
      className="grid gap-1 rounded-md border border-border bg-surface p-3 text-start transition hover:bg-muted disabled:cursor-default disabled:hover:bg-surface"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${markerClass}`} />
        <span className="truncate text-xs font-bold uppercase text-subtle">{meta}</span>
      </span>
      <span className="break-words text-sm font-bold text-ink">{title}</span>
      {value ? <span className="break-words text-xs font-semibold text-subtle">{value}</span> : null}
    </button>
  );
}

class JournalWorkspaceErrorBoundary extends Component<
  { children: ReactNode; language: string; onBack: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[journal-open-boundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const isHebrew = this.props.language === 'he';

    return (
      <main className="grid min-h-screen place-items-center bg-background px-4 py-6">
        <section className="grid max-w-lg gap-4 rounded-lg border border-border bg-surface p-5 shadow-soft">
          <div>
            <p className="text-xs font-bold uppercase text-subtle">{isHebrew ? 'שגיאת טעינת יומן' : 'Journal Load Error'}</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">
              {isHebrew ? 'לא ניתן לפתוח את היומן הזה כרגע' : 'This journal could not be opened'}
            </h1>
            <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-danger">
              {this.state.error.message}
            </p>
          </div>
          <Button
            onClick={() => {
              this.setState({ error: null });
              this.props.onBack();
            }}
            type="button"
          >
            {isHebrew ? 'חזרה לרשימת היומנים' : 'Back to journal list'}
          </Button>
        </section>
      </main>
    );
  }
}

function PostLoginJournalGate({
  onCreateJournal,
  onOpenJournal,
  onSignOut,
  user,
}: {
  onCreateJournal: (name: string, journalType: JournalType) => Promise<void>;
  onOpenJournal: (journalId: string) => Promise<void>;
  onSignOut: () => void;
  user: User;
}) {
  const { language, setLanguage, t } = useLanguage();
  const isHebrew = language === 'he';
  const [journals, setJournals] = useState<JournalSummary[]>([]);
  const [journalName, setJournalName] = useState('');
  const [journalType, setJournalType] = useState<JournalType | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSlowOpen, setIsSlowOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadJournals() {
      setIsLoading(true);
      setError(null);

      try {
        firebaseJournalRepository.setUser(user.uid);
        const userJournals = await firebaseJournalRepository.listJournals();
        if (isMounted) setJournals(userJournals);
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load journals.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadJournals();

    return () => {
      isMounted = false;
    };
  }, [user.uid]);

  async function submitCreate() {
    setIsSubmitting(true);
    setError(null);

    try {
      if (!journalType) {
        setError(isHebrew ? 'בחר סוג יומן לפני יצירה.' : 'Choose a journal type before creating.');
        return;
      }
      await onCreateJournal(journalName.trim() || (isHebrew ? 'יומן מסחר חדש' : 'New Trading Journal'), journalType);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create journal.');
      setIsSubmitting(false);
    }
  }

  async function submitOpen(journalId: string) {
    if (!journals.some((journal) => journal.workspaceId === journalId)) {
      setError(isHebrew ? 'היומן שנבחר לא נמצא ברשימת היומנים של החשבון הזה.' : 'The selected journal was not found in this account journal list.');
      return;
    }

    if (!isValidJournalId(journalId)) {
      setError(isHebrew ? 'מזהה היומן אינו תקין.' : 'The selected journal id is invalid.');
      return;
    }

    setIsSubmitting(true);
    setIsSlowOpen(false);
    setError(null);
    const slowTimer = window.setTimeout(() => setIsSlowOpen(true), 8000);

    try {
      await onOpenJournal(journalId);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Failed to open journal.');
      setIsSubmitting(false);
    } finally {
      window.clearTimeout(slowTimer);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-3xl place-items-center">
        <section className="grid w-full gap-5 rounded-lg border border-border bg-surface p-5 shadow-soft sm:p-6" dir={isHebrew ? 'rtl' : 'ltr'}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-2">
              <p className="text-xs font-bold uppercase text-subtle">{t('webFoundation')}</p>
              <h1 className="text-2xl font-bold leading-tight text-ink">{isHebrew ? 'בחר יומן' : 'Choose a Journal'}</h1>
              <p className="max-w-2xl text-sm font-semibold leading-6 text-subtle">
                {isHebrew
                  ? 'התחברות משחזרת יומנים מכל מכשיר. לכל חשבון יש יומנים נפרדים. יומן חדש מתחיל ריק, ופתיחת יומן קיים טוענת את העבודה הקודמת שלך.'
                  : 'Login restores journals from any device. Each account has separate journals. Creating a new journal starts empty, and opening an existing journal loads previous work.'}
              </p>
              <p className="text-xs font-bold text-subtle">{user.email ?? user.displayName ?? user.uid}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setLanguage(language === 'he' ? 'en' : 'he')} type="button" variant="secondary">
                {language === 'he' ? 'English' : 'עברית'}
              </Button>
              <Button onClick={onSignOut} type="button" variant="secondary">
                {isHebrew ? 'התנתקות' : 'Sign out'}
              </Button>
            </div>
          </div>

          {isLoading && !journals.length ? (
            <p className="rounded-md bg-muted p-3 text-sm font-bold text-subtle">{isHebrew ? 'טוען יומנים...' : 'Loading journals...'}</p>
          ) : journals.length ? (
            <div className="grid gap-3">
              <h2 className="text-lg font-bold text-ink">{isHebrew ? 'פתח יומן קיים' : 'Open Existing Journal'}</h2>
              {isLoading ? (
                <p className="rounded-md bg-muted p-3 text-xs font-bold text-subtle">
                  {isHebrew ? 'Refreshing journal list...' : 'Refreshing journal list...'}
                </p>
              ) : null}
                  {isSubmitting ? (
                <section className="grid gap-2 rounded-md border border-primary/30 bg-primary/10 p-3">
                  <p className="text-sm font-bold text-primary">{isHebrew ? 'פותח יומן...' : 'Opening journal...'}</p>
                  <div className="h-2 overflow-hidden rounded bg-white">
                    <div className="h-full w-2/3 animate-pulse rounded bg-primary" />
                  </div>
                  {isSlowOpen ? (
                    <div className="grid gap-2">
                      <p className="text-sm font-semibold text-ink">
                        {isHebrew
                          ? 'הטעינה מתארכת, אפשר לחזור לרשימת היומנים'
                          : 'Opening is taking longer than usual. Cloud loading is still running, and you can return to the list.'}
                      </p>
                      <Button onClick={() => setIsSubmitting(false)} type="button" variant="secondary">
                        {isHebrew ? 'חזרה לרשימת היומנים' : 'Back to journal list'}
                      </Button>
                    </div>
                  ) : null}
                </section>
              ) : null}
              <div className="grid gap-2">
                {journals.map((journal) => (
                  <button
                    className="grid gap-1 rounded-md border border-border bg-muted p-3 text-start transition hover:bg-border disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSubmitting}
                    key={journal.workspaceId}
                    onClick={() => void submitOpen(journal.workspaceId)}
                    type="button"
                  >
                    <span className="font-bold text-ink">{journal.name}</span>
                    <span className="break-all text-xs font-semibold text-subtle">{journal.workspaceId}</span>
                    <span className="text-xs font-semibold text-subtle">{journal.savedAt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-md bg-muted p-3 text-sm font-bold text-subtle">
              {isHebrew ? 'לא נמצאו יומנים לחשבון הזה. צור יומן חדש כדי להתחיל.' : 'No journals were found for this account. Create a new journal to begin.'}
            </p>
          )}

          <div className="grid gap-3 rounded-md border border-border bg-background p-3">
            <h2 className="text-lg font-bold text-ink">{journals.length ? (isHebrew ? 'צור יומן חדש' : 'Create New Journal') : isHebrew ? 'צור יומן' : 'Create Journal'}</h2>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] sm:items-end">
              <label className="grid gap-1 text-sm font-bold text-ink">
                {isHebrew ? 'שם היומן' : 'Journal name'}
                <input
                  className="min-h-11 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-blue-100"
                  disabled={isSubmitting}
                  onChange={(event) => setJournalName(event.target.value)}
                  placeholder={isHebrew ? 'יומן מסחר חדש' : 'New Trading Journal'}
                  value={journalName}
                />
              </label>
              <label className="grid gap-1 text-sm font-bold text-ink">
                {isHebrew ? 'סוג יומן' : 'Journal type'}
                <select
                  className="min-h-11 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-blue-100"
                  disabled={isSubmitting}
                  onChange={(event) => setJournalType(event.target.value as JournalType)}
                  required
                  value={journalType}
                >
                  <option value="">{isHebrew ? 'בחר סוג יומן' : 'Choose journal type'}</option>
                  <option value="liveOnly">{getJournalTypeLabel('liveOnly', isHebrew)}</option>
                  <option value="backtestingOnly">{getJournalTypeLabel('backtestingOnly', isHebrew)}</option>
                  <option value="spotOnly">{getJournalTypeLabel('spotOnly', isHebrew)}</option>
                  <option value="combined">{getJournalTypeLabel('combined', isHebrew)}</option>
                </select>
              </label>
              <Button disabled={isSubmitting || !journalType} onClick={() => void submitCreate()} type="button">
                {isSubmitting ? (isHebrew ? 'פותח...' : 'Opening...') : journals.length ? (isHebrew ? 'צור יומן חדש' : 'Create New Journal') : isHebrew ? 'צור יומן' : 'Create Journal'}
              </Button>
            </div>
          </div>

          {error ? <p className="rounded-md bg-dangerSoft p-3 text-sm font-bold leading-6 text-danger">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}

function isValidJournalId(value: string) {
  return Boolean(value && !value.includes('/') && value !== '.' && value !== '..');
}

function scrubLegacyViewerModeStorage(storage: Storage) {
  const legacyKeys = [
    'e_trading_n:v1:access-mode',
    'e_trading_n:v1:viewer-mode',
    'e_trading_n:v1:share',
    'e_trading_n:v1:shared-journal',
  ];

  legacyKeys.forEach((key) => storage.removeItem(key));

  const journalKey = 'e_trading_n:v1:journal';
  const rawJournal = storage.getItem(journalKey);
  if (!rawJournal) return;

  try {
    const parsed = JSON.parse(rawJournal) as Record<string, unknown>;
    if (!('accessMode' in parsed) && !('isViewOnly' in parsed) && !('shareCode' in parsed) && !('sharedOwnerId' in parsed)) return;

    delete parsed.accessMode;
    delete parsed.isViewOnly;
    delete parsed.shareCode;
    delete parsed.sharedOwnerId;
    delete parsed.sharePermission;
    storage.setItem(journalKey, JSON.stringify(parsed));
  } catch {
    // Preserve the journal cache if it is not JSON; the repository fallback handles it.
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer));
  });
}

function getRememberedJournalSelection(userId: string) {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(getRememberedJournalSelectionKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { userId?: unknown; workspaceId?: unknown };
    if (parsed.userId === userId && typeof parsed.workspaceId === 'string') {
      return parsed.workspaceId;
    }
    return null;
  } catch {
    return raw;
  }
}

function rememberJournalSelection(userId: string, workspaceId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getRememberedJournalSelectionKey(userId), JSON.stringify({ userId, workspaceId }));
}

function forgetRememberedJournalSelection(userId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(getRememberedJournalSelectionKey(userId));
}

function getRememberedJournalSelectionKey(userId: string) {
  return `e_trading_n:v1:selected-journal:${userId}`;
}

function AccountValueModePanel({
  accountValueResets,
  date,
  journalType,
  language,
  spots,
  trades,
}: {
  accountValueResets: ReturnType<typeof useJournalStore.getState>['accountValueResets'];
  date: string;
  journalType: JournalType;
  language: string;
  spots: SpotPosition[];
  trades: Trade[];
}) {
  const isHebrew = language === 'he';
  const [isOpen, setIsOpen] = useState(false);
  const modes = getAccountValuePanelModes(journalType);
  const [openMode, setOpenMode] = useState<AccountValueMode | null>(modes[0] ?? 'live');

  return (
    <section className="rounded-lg border border-border bg-surface p-3 shadow-soft">
      <button className="flex w-full items-center justify-between gap-3 text-start" onClick={() => setIsOpen((current) => !current)} type="button">
        <h2 className="text-sm font-bold uppercase text-subtle">{isHebrew ? 'שווי תיק' : 'Account value'}</h2>
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-lg font-bold text-ink">{isOpen ? '-' : '+'}</span>
      </button>
      {isOpen ? (
        <div className="mt-3 grid gap-2">
          {modes.map((mode) => {
            const entries = mode === 'spot' ? spots : trades;
            const starting = getStartingAccountValue(accountValueResets, mode);
            const current = getCurrentAccountValue(accountValueResets, entries, mode);
            const selected = getAccountValueForDate(accountValueResets, entries, date, mode);
            const isModeOpen = openMode === mode;

            return (
              <section className="rounded-md border border-border bg-background p-3" key={mode}>
                <button className="flex w-full items-center justify-between gap-3 text-start" onClick={() => setOpenMode(isModeOpen ? null : mode)} type="button">
                  <span className="font-bold text-ink">{getModeCapitalLabel(mode, isHebrew)}</span>
                  <span className="rounded bg-muted px-2 py-1 text-sm font-bold">{isModeOpen ? '-' : '+'}</span>
                </button>
                {isModeOpen ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <AccountMetric label={isHebrew ? 'שווי התחלתי' : 'Starting capital'} value={formatAccountValue(starting?.value)} />
                    <AccountMetric label={isHebrew ? 'שווי נוכחי' : 'Current capital'} value={`${formatAccountValue(current?.value)}${current?.livePnl ? ` (${formatSignedMoney(current.livePnl)})` : ''}`} />
                    <AccountMetric label={isHebrew ? 'שווי ליום הנבחר' : 'Selected day capital'} value={`${formatAccountValue(selected?.value)}${date ? ` (${date})` : ''}`} />
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function getAccountValuePanelModes(journalType: JournalType): AccountValueMode[] {
  const modes: AccountValueMode[] = [...getAllowedTradeModes(journalType)];
  if (journalType === 'spotOnly' || journalType === 'combined') modes.push('spot');
  return modes;
}

function getModeCapitalLabel(mode: AccountValueMode, isHebrew: boolean) {
  if (mode === 'spot') return isHebrew ? 'ספוט' : 'Spot';
  if (mode === 'backtesting') return isHebrew ? 'בק-טסטינג' : 'Backtesting';
  return isHebrew ? 'פיוצרס' : 'Futures';
}

function getTradesOpenedOnDate(trades: Trade[], dateKey: string) {
  return trades.filter((trade) => isSameDate(getOpenTradeDateKey(trade), dateKey));
}

function getSpotsOpenedOrSoldOnDate(spots: SpotPosition[], dateKey: string) {
  return spots.filter((spot) =>
    isSameDate(spot.buyDate, dateKey) ||
    spot.sells.some((sell) => isSameDate(sell.sellDate, dateKey)),
  );
}

function getOpenTradesEligibleForCloseOnDate({
  dateKey,
  journalType,
  trades,
}: {
  dateKey: string;
  journalType: JournalType;
  trades: Trade[];
}) {
  if (!isTradeModeAllowed(journalType, 'live')) return [];
  return getAllOpenFuturesPositions(trades).filter((trade) => isOnOrAfterDate(dateKey, getOpenTradeDateKey(trade)));
}

function getOpenSpotsEligibleForCloseOnDate({
  dateKey,
  journalType,
  spots,
}: {
  dateKey: string;
  journalType: JournalType;
  spots: SpotPosition[];
}) {
  if (!isSpotAllowed(journalType)) return [];
  return getAllOpenSpotPositions(spots).filter((spot) => isOnOrAfterDate(dateKey, spot.buyDate));
}

function getAllOpenFuturesPositions(trades: Trade[]) {
  return trades.filter((trade) => trade.mode === 'live' && trade.status === 'open');
}

function getAllOpenSpotPositions(spots: SpotPosition[]) {
  return spots.filter(isSpotOpen);
}

function getOpenTradeDateKey(trade: Trade) {
  return normalizeDateKey(trade.entryDate) ?? normalizeDateKey(trade.openedAt) ?? normalizeDateKey(trade.createdAt);
}

function DayActionModal({
  date,
  isOpen,
  language,
  onAddTask,
  onAddTrade,
  onClose,
  onCloseSpot,
  onCloseTrade,
  openLiveTrades,
  openSpotPositions,
}: {
  date: string;
  isOpen: boolean;
  language: string;
  onAddTask: () => void;
  onAddTrade: () => void;
  onClose: () => void;
  onCloseSpot: (spot: SpotPosition) => void;
  onCloseTrade: (trade: Trade) => void;
  openLiveTrades: Trade[];
  openSpotPositions: SpotPosition[];
}) {
  const isHebrew = language === 'he';

  return (
    <Modal closeLabel={isHebrew ? 'סגירה' : 'Close'} isOpen={isOpen} onClose={onClose} title={isHebrew ? 'הוספה ליום' : 'Add to day'}>
      <div className="grid gap-4" dir={isHebrew ? 'rtl' : 'ltr'}>
        <p className="text-sm font-semibold text-subtle">
          {isHebrew ? `תאריך נבחר: ${date}` : `Selected date: ${date}`}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={onAddTask} type="button" variant="secondary">
            {isHebrew ? 'הוסף משימה' : 'Add Task'}
          </Button>
          <Button onClick={onAddTrade} type="button" variant="secondary">
            {isHebrew ? 'הוסף טרייד' : 'Add Trade'}
          </Button>
        </div>
        {openLiveTrades.length ? <section className="grid gap-2 rounded-md border border-border bg-muted p-3">
          <h3 className="text-sm font-bold text-ink">{isHebrew ? 'סגירת פיוצרס פתוח' : 'Close Open Futures'}</h3>
          <div className="grid gap-2">
            {openLiveTrades.map((trade) => (
              <button
                className="grid gap-1 rounded-md border border-border bg-background p-3 text-start transition hover:border-primary hover:bg-surface"
                key={trade.id}
                onClick={() => onCloseTrade(trade)}
                type="button"
              >
                <span className="font-bold text-ink">{trade.coin} · {trade.direction.toUpperCase()}</span>
                <span className="text-xs font-semibold text-subtle">
                  {isHebrew ? 'נפתח' : 'Opened'}: {trade.entryDate} {trade.entryTime || ''}
                  {trade.title ? ` · ${trade.title}` : ''}
                </span>
              </button>
            ))}
          </div>
        </section> : null}
        {openSpotPositions.length ? <section className="grid gap-2 rounded-md border border-border bg-muted p-3">
          <h3 className="text-sm font-bold text-ink">{isHebrew ? 'סגירת ספוט פתוח' : 'Close Open Spot'}</h3>
          <div className="grid gap-2">
            {openSpotPositions.map((spot) => (
              <button
                className="grid gap-1 rounded-md border border-border bg-background p-3 text-start transition hover:border-primary hover:bg-surface"
                key={spot.id}
                onClick={() => onCloseSpot(spot)}
                type="button"
              >
                <span className="font-bold text-ink">Spot · {spot.assetName}</span>
                <span className="text-xs font-semibold text-subtle">
                  {isHebrew ? 'נפתח' : 'Opened'}: {spot.buyDate} {spot.buyTime || ''}
                </span>
              </button>
            ))}
          </div>
        </section> : null}
      </div>
    </Modal>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AccountValueStrip({
  accountValueResets,
  date,
  language,
  trades,
}: {
  accountValueResets: ReturnType<typeof useJournalStore.getState>['accountValueResets'];
  date: string;
  language: string;
  trades: Trade[];
}) {
  const isHebrew = language === 'he';
  const starting = getStartingAccountValue(accountValueResets, 'live');
  const current = getCurrentAccountValue(accountValueResets, trades, 'live');
  const selected = getAccountValueForDate(accountValueResets, trades, date, 'live');

  return (
    <section className="grid gap-2 rounded-lg border border-border bg-surface p-3 shadow-soft sm:grid-cols-3">
      <AccountMetric label={isHebrew ? 'שווי תיק התחלתי' : 'Starting journal account value'} value={formatAccountValue(starting?.value)} />
      <AccountMetric
        label={isHebrew ? 'שווי תיק נוכחי' : 'Current account value'}
        value={`${formatAccountValue(current?.value)}${current?.livePnl ? ` (${formatSignedMoney(current.livePnl)})` : ''}`}
      />
      <AccountMetric
        label={isHebrew ? 'שווי תיק ליום הנבחר' : 'Account value for selected day'}
        value={`${formatAccountValue(selected?.value)}${date ? ` (${date})` : ''}`}
      />
    </section>
  );
}

function AccountMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <p className="text-xs font-bold uppercase text-subtle">{label}</p>
      <p className="mt-1 break-words text-lg font-bold text-ink">{value}</p>
    </div>
  );
}

function SupportDevelopmentModal({
  isOpen,
  language,
  onClose,
}: {
  isOpen: boolean;
  language: string;
  onClose: () => void;
}) {
  const isHebrew = language === 'he';
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyAddress = async (id: string, address?: string) => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1800);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <Modal
      closeLabel={isHebrew ? 'סגירה' : 'Close'}
      isOpen={isOpen}
      onClose={onClose}
      title={isHebrew ? 'תמיכה בפיתוח' : 'Support Development'}
    >
      <div className="grid gap-4" dir={isHebrew ? 'rtl' : 'ltr'}>
        <p className="rounded-md bg-muted p-3 text-sm font-semibold leading-6 text-ink">
          {isHebrew
            ? 'אם היומן עוזר לכם, אפשר לתמוך בפיתוח ולעזור להמשיך לשפר את המערכת ❤️'
            : 'If this journal helps you, you can support future development ❤️'}
        </p>
        <p className="rounded-md bg-dangerSoft p-3 text-sm font-bold leading-6 text-danger">
          {isHebrew
            ? 'יש לשלוח רק ברשת שמופיעה ליד הכתובת. שליחה ברשת שגויה עלולה לגרום לאובדן כספים.'
            : 'Send only on the network shown. Sending on the wrong network may result in lost funds.'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {donationMethods.map((method) => {
            const qrUrl = method.address
              ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(method.address)}`
              : '';

            return (
              <section className="grid gap-3 rounded-md border border-border bg-surface p-3" key={method.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-ink">{method.title}</h3>
                    <p className="text-xs font-bold uppercase text-subtle">{isHebrew ? method.networkHe : method.networkEn}</p>
                  </div>
                  <Button
                    disabled={!method.address}
                    onClick={() => void copyAddress(method.id, method.address)}
                    type="button"
                    variant="secondary"
                  >
                    {copiedId === method.id ? (isHebrew ? 'הכתובת הועתקה' : 'Address copied') : isHebrew ? 'העתקה' : 'Copy'}
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[132px_minmax(0,1fr)] sm:items-center">
                  <div className="grid aspect-square w-32 place-items-center rounded-md border border-border bg-white p-2">
                    {method.address ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={isHebrew ? `קוד QR עבור ${method.title}` : `${method.title} QR code`}
                        className="h-full w-full object-contain"
                        src={qrUrl}
                      />
                    ) : (
                      <span className="text-center text-xs font-bold text-subtle">
                        {isHebrew ? 'לא הוגדר' : 'Not configured'}
                      </span>
                    )}
                  </div>
                  <p className="min-w-0 break-all rounded bg-muted p-2 text-xs font-semibold leading-5 text-ink">
                    {method.address || (isHebrew ? 'כתובת לא הוגדרה' : 'Address not configured')}
                  </p>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

function WorkspacePanel({
  categories,
  dataSource,
  eventsLength,
  firestorePath,
  isDebugOpen,
  isOpen,
  lastSyncedAt,
  lastTradeActionType,
  onDebugToggle,
  onToggle,
  syncMessage,
  syncStatus,
  t,
  workspaceId,
}: {
  categories: Category[];
  dataSource: string;
  eventsLength: number;
  firestorePath: string;
  isDebugOpen: boolean;
  isOpen: boolean;
  lastSyncedAt?: string;
  lastTradeActionType?: string;
  onDebugToggle: () => void;
  onToggle: () => void;
  syncMessage: string;
  syncStatus: 'setup_required' | 'syncing' | 'cloud' | 'error';
  t: ReturnType<typeof useLanguage>['t'];
  workspaceId: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-3 shadow-soft">
      <button
        className="flex w-full items-center justify-between gap-3 text-start"
        onClick={onToggle}
        type="button"
      >
        <h2 className="text-sm font-bold uppercase text-subtle">{t('workspace')}</h2>
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-lg font-bold text-ink">
          {isOpen ? '-' : '+'}
        </span>
      </button>
      {isOpen ? (
        <div className="mt-4 grid gap-3 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="font-semibold text-ink">{t('personalJournal')}</p>
            <p className="text-subtle">{t('localState')}</p>
          </div>
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs font-bold uppercase text-subtle">{t('firebase')}</p>
            <p className={`mt-1 font-semibold ${syncStatus === 'setup_required' || syncStatus === 'error' ? 'text-danger' : 'text-ink'}`}>
              {syncStatus === 'cloud'
                ? t('cloudSyncActive')
                : syncStatus === 'syncing'
                  ? t('syncing')
                  : syncStatus === 'setup_required'
                    ? t('firebaseSetupRequired')
                    : t('cloudSyncError')}
            </p>
            <div className="mt-2 grid gap-1 break-words text-xs text-subtle">
              <p>workspace: {workspaceId}</p>
              <p>path: {firestorePath}</p>
              <p>source: {dataSource}</p>
              <p>
                sync: {syncMessage}
                {lastSyncedAt ? ` | ${new Date(lastSyncedAt).toLocaleTimeString()}` : ''}
              </p>
            </div>
            {syncStatus === 'setup_required' ? (
              <p className="mt-2 rounded bg-dangerSoft p-2 text-xs font-semibold text-danger">
                {t('firebaseSetupWarning')}
              </p>
            ) : null}
            <button
              className="mt-2 rounded bg-background px-2 py-1 text-xs font-bold text-subtle hover:bg-border"
              onClick={onDebugToggle}
              type="button"
            >
              Debug
            </button>
            {isDebugOpen ? (
              <div className="mt-2 grid gap-1 rounded border border-border bg-background p-2 text-xs text-subtle">
                <p>events: {eventsLength}</p>
                <p>last sync: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : '-'}</p>
                <p>last trade action: {lastTradeActionType ?? '-'}</p>
                <p>workspace: {workspaceId}</p>
              </div>
            ) : null}
          </div>
          <div className="grid gap-2 pt-2 text-subtle">
            <LegendItem color="#16A34A" label={t('winningTradeDot')} />
            <LegendItem color="#DC2626" label={t('losingTradeDot')} />
          </div>
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-bold uppercase text-subtle">{t('category')}</p>
            <div className="grid gap-2 text-subtle">
              {categories.map((category) => (
                <LegendItem color={category.color} key={category.id} label={t(category.labelKey)} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 rounded" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}
