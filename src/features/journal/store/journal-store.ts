'use client';

import { create } from 'zustand';

import type {
  Day,
  JournalEvent,
  JournalEventType,
  JournalNotification,
  JournalType,
  NotificationSeverity,
  NotificationType,
  RuleAdherence,
  SpotPosition,
  Task,
  Trade,
  TradeDirection,
  TradeMode,
  TradeResult,
  ScreenshotSlot,
  AssetType,
  TradeStatus,
} from '@/models/journal';

import {
  createDefaultJournalSnapshot,
  journalRepository,
  normalizeJournalSnapshot,
  type AccountValueMode,
  type AccountValueReset,
  type DisciplineScoreSettings,
  type JournalSummary,
  type JournalSnapshot,
} from '../data/journal-repository';
import { firebaseJournalRepository, type JournalShareRecord, type SharePermission } from '../data/firebase-journal-repository';
import { buildDayMetadata } from '../utils/day-metadata';
import { buildDisciplineSnapshot } from '../utils/discipline';
import { normalizeAssetName, normalizeAssetType, normalizeDateKey, normalizeTradeMode } from '../utils/trade-values';
import { normalizeJournalType } from '../utils/journal-scope';

const defaultWorkspaceId = process.env.NEXT_PUBLIC_FIREBASE_WORKSPACE_ID || 'personal-journal';

type AddTaskInput = {
  date: string;
  title: string;
  startTime?: string;
  endTime?: string;
  taskType?: string;
  categoryId?: string;
  notes?: string;
};

type AddTradeInput = {
  date: string;
  title?: string;
  status: TradeStatus;
  result: TradeResult;
  mode: TradeMode;
  entryDate: string;
  entryTime: string;
  exitDate?: string;
  exitTime?: string;
  stopPercentage?: number;
  riskDollars: number;
  pnlInput: number;
  pnl: number;
  rr: number;
  coin: string;
  assetType?: AssetType;
  strategyId?: string;
  direction: TradeDirection;
  adherence: RuleAdherence;
  emotionBefore: string;
  emotionAfter?: string;
  ruleViolations?: string[];
  categoryId?: string;
  notes?: string;
  improvements?: string;
  preservationPoints?: string;
  sharpeningNeeded?: string;
  screenshots: ScreenshotSlot[];
};

type AddSpotInput = {
  date: string;
  assetName: string;
  assetType: AssetType;
  buyDate: string;
  buyTime?: string;
  buyPrice: number;
  quantityBought: number;
  actualAmountPaid: number;
  currentPortfolioValue?: number;
  targetPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  reasonForEntry?: string;
  notes?: string;
  screenshots?: ScreenshotSlot[];
  sell?: AddSpotSellInput;
};

type AddSpotSellInput = {
  sellDate: string;
  sellTime?: string;
  sellPrice: number;
  quantitySold: number;
  actualAmountReceived: number;
  reasonForExit?: string;
  notes?: string;
  screenshots?: ScreenshotSlot[];
};

type JournalState = {
  days: Record<string, Day>;
  tasks: Record<string, Task>;
  trades: Record<string, Trade>;
  spots: Record<string, SpotPosition>;
  symbolOptions: string[];
  assetTypeBySymbol: JournalSnapshot['assetTypeBySymbol'];
  screenshotTimeframes: string[];
  customEmotionOptions: string[];
  customRuleViolationOptions: string[];
  customStrategyOptions: string[];
  categorySettings: JournalSnapshot['categorySettings'];
  disciplineScoreSettings: DisciplineScoreSettings;
  accountValueResets: AccountValueReset[];
  notifications: JournalNotification[];
  events: JournalEvent[];
  lastTradeAction?: JournalEvent;
  syncStatus: 'setup_required' | 'syncing' | 'cloud' | 'error';
  syncMessage: string;
  lastSyncedAt?: string;
  dataSource: 'localStorage' | 'Firebase' | 'fallback';
  firestorePath: string;
  workspaceId: string;
  journalName: string;
  journalType: JournalType;
  journals: JournalSummary[];
  exportEmail: string;
  accessMode: 'owner' | 'viewer';
  sharePermission?: SharePermission;
  sharedOwnerId?: string;
  shareCode?: string;
  isViewOnly: boolean;
  createShareLink: (permission: SharePermission) => Promise<JournalShareRecord>;
  updateJournalName: (name: string) => void;
  updateJournalType: (journalType: JournalType) => void;
  createNewJournal: (name: string, journalType?: JournalType) => void;
  switchJournal: (workspaceId: string) => void;
  deleteCurrentJournal: () => Promise<JournalSummary[]>;
  updateExportEmail: (email: string) => void;
  recordEvent: (type: JournalEventType, metadata?: JournalEvent['metadata'], tradeId?: string) => void;
  addNotification: (input: CreateNotificationInput) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  createEmptyTemplateSnapshot: () => Pick<
    JournalSnapshot,
    | 'symbolOptions'
    | 'assetTypeBySymbol'
    | 'screenshotTimeframes'
    | 'customEmotionOptions'
    | 'customRuleViolationOptions'
    | 'customStrategyOptions'
    | 'categorySettings'
    | 'disciplineScoreSettings'
    | 'journalType'
  >;
  initializeCloudSync: (userId?: string, journalId?: string, options?: { createIfMissing?: boolean }) => Promise<boolean>;
  initializeSharedJournal: (userId: string, shareCode: string) => Promise<boolean>;
  resetCloudJournalState: (userId?: string) => void;
  addTask: (input: AddTaskInput) => void;
  addTrade: (input: AddTradeInput) => void;
  updateTask: (id: string, input: AddTaskInput) => void;
  updateTrade: (id: string, input: AddTradeInput) => void;
  addSpot: (input: AddSpotInput) => void;
  updateSpot: (id: string, input: AddSpotInput) => void;
  addSpotSell: (id: string, input: AddSpotSellInput) => void;
  addSymbolOption: (symbol: string, assetType?: AssetType) => void;
  addScreenshotTimeframe: (timeframe: string) => void;
  addCustomEmotion: (value: string) => void;
  addCustomRuleViolation: (value: string) => void;
  addCustomStrategy: (value: string) => void;
  updateDisciplineScoreSettings: (settings: DisciplineScoreSettings) => void;
  addAccountValueChange: (input: Omit<AccountValueReset, 'id' | 'createdAt'>) => void;
  clearLocalJournalData: () => void;
  exportJournalJson: () => string;
  importJournalJson: (json: string) => void;
};

type CreateNotificationInput = {
  type: NotificationType;
  title: string;
  message: string;
  relatedTradeId?: string;
  relatedSpotId?: string;
  severity?: NotificationSeverity;
  actionTarget?: string;
  aiGenerated?: boolean;
  aiReason?: string;
  suggestedAction?: string;
  priorityScore?: number;
};

const createId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const getNow = () => new Date().toISOString();

const ensureDay = (days: Record<string, Day>, date: string, workspaceId: string): Day => {
  const existingDay = days[date];

  if (existingDay) {
    return existingDay;
  }

  const now = getNow();

  return {
    id: date,
    workspaceId,
    date,
    taskIds: [],
    tradeIds: [],
    spotIds: [],
    result: 'neutral',
    metadata: buildDayMetadata([], []),
    createdAt: now,
    updatedAt: now,
  };
};

const initialSnapshot = journalRepository.load();
let hasInitializedCloudSync = false;
let initializedCloudUserId: string | undefined;
let initializedCloudJournalId: string | undefined;
let isApplyingRemoteSnapshot = false;
let cloudUnsubscribe: (() => void) | undefined;
let activeCloudListenerKey: string | undefined;
let isWritingCloudSnapshot = false;
let pendingCloudSnapshot: JournalSnapshot | undefined;
const cloudSnapshotCache = new Map<string, JournalSnapshot>();
let activeCloudLoadRequestId = 0;

export const useJournalStore = create<JournalState>((set, get) => ({
  days: initialSnapshot.days,
  tasks: initialSnapshot.tasks,
  trades: initialSnapshot.trades,
  spots: initialSnapshot.spots,
  symbolOptions: initialSnapshot.symbolOptions,
  assetTypeBySymbol: initialSnapshot.assetTypeBySymbol,
  screenshotTimeframes: initialSnapshot.screenshotTimeframes,
  customEmotionOptions: initialSnapshot.customEmotionOptions,
  customRuleViolationOptions: initialSnapshot.customRuleViolationOptions,
  customStrategyOptions: initialSnapshot.customStrategyOptions,
  categorySettings: initialSnapshot.categorySettings,
  disciplineScoreSettings: initialSnapshot.disciplineScoreSettings,
  accountValueResets: initialSnapshot.accountValueResets,
  notifications: initialSnapshot.notifications,
  events: [],
  lastTradeAction: undefined,
  syncStatus: firebaseJournalRepository.isConfigured ? 'syncing' : 'setup_required',
  syncMessage: firebaseJournalRepository.isConfigured ? 'Loaded cache; checking Firestore' : 'Firebase setup required; using localStorage',
  lastSyncedAt: undefined,
  dataSource: firebaseJournalRepository.isConfigured ? 'localStorage' : 'fallback',
  firestorePath: firebaseJournalRepository.paths.entries,
  workspaceId: initialSnapshot.workspaceId || firebaseJournalRepository.workspaceId,
  journalName: initialSnapshot.journalName,
  journalType: initialSnapshot.journalType,
  journals: initialSnapshot.journals,
  exportEmail: initialSnapshot.exportEmail ?? '',
  accessMode: 'owner',
  sharePermission: undefined,
  sharedOwnerId: undefined,
  shareCode: undefined,
  isViewOnly: false,

  createShareLink: (permission) => firebaseJournalRepository.createShare(permission, get().workspaceId),

  updateJournalName: (name) => {
    if (get().accessMode !== 'owner') return;
    const nextName = name.trim() || 'E_trading_N Journal';
    if (get().journalName === nextName) return;
    set((state) => ({
      journalName: nextName,
      journals: upsertJournalSummary(state.journals, { workspaceId: state.workspaceId, journalName: nextName, journalType: state.journalType }),
      events: [createJournalEvent('settings_changed', { setting: 'journal_name', value: nextName }), ...state.events].slice(0, 100),
    }));
  },

  updateJournalType: (journalType) => {
    if (get().accessMode !== 'owner') return;
    const nextJournalType = normalizeJournalType(journalType);
    if (get().journalType === nextJournalType) return;
    set((state) => ({
      journalType: nextJournalType,
      journals: upsertJournalSummary(state.journals, { workspaceId: state.workspaceId, journalName: state.journalName, journalType: nextJournalType }),
      events: [createJournalEvent('settings_changed', { setting: 'journal_type', value: nextJournalType }), ...state.events].slice(0, 100),
    }));
  },

  createNewJournal: (name, journalType = 'combined') => {
    if (get().accessMode !== 'owner') return;
    const currentSnapshot = storeStateToSnapshot(get());
    saveJournalWorkspaceSnapshot(currentSnapshot);
    const nextWorkspaceId = `journal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const nextJournalName = name.trim() || 'New Journal';
    const nextJournalType = normalizeJournalType(journalType);
    const nextJournals = upsertJournalSummary(currentSnapshot.journals, currentSnapshot);
    const snapshot = {
      ...createDefaultJournalSnapshot(),
      journalName: nextJournalName,
      journalType: nextJournalType,
      workspaceId: nextWorkspaceId,
      symbolOptions: get().symbolOptions,
      assetTypeBySymbol: get().assetTypeBySymbol,
      screenshotTimeframes: get().screenshotTimeframes,
      customEmotionOptions: get().customEmotionOptions,
      customRuleViolationOptions: get().customRuleViolationOptions,
      customStrategyOptions: get().customStrategyOptions,
      categorySettings: get().categorySettings,
      disciplineScoreSettings: get().disciplineScoreSettings,
      journals: upsertJournalSummary(nextJournals, { workspaceId: nextWorkspaceId, journalName: nextJournalName, journalType: nextJournalType }),
    };
    saveJournalWorkspaceSnapshot(snapshot);
    const event = createJournalEvent('settings_changed', { setting: 'new_journal', workspaceId: nextWorkspaceId });
    if (get().syncStatus === 'cloud' && firebaseJournalRepository.userId) {
      firebaseJournalRepository.setActiveJournal(nextWorkspaceId);
    }
    set({
      ...snapshotToStoreState(snapshot),
      workspaceId: nextWorkspaceId,
      journalName: snapshot.journalName,
      journals: snapshot.journals,
      firestorePath: firebaseJournalRepository.paths.entries,
      events: [event],
      notifications: [],
    });
    if (get().syncStatus === 'cloud' && firebaseJournalRepository.userId) {
      requestCloudWrite(snapshot);
      replaceCloudSubscription(
        (remoteSnapshot) => {
          isApplyingRemoteSnapshot = true;
          try {
            useJournalStore.setState({
              ...snapshotToStoreState({
                ...remoteSnapshot,
                journals: mergeJournalSummaries(useJournalStore.getState().journals, remoteSnapshot.journals),
              }),
              syncStatus: 'cloud',
              syncMessage: `Realtime update ${formatSyncTime()}`,
              lastSyncedAt: new Date().toISOString(),
              dataSource: 'Firebase',
              firestorePath: firebaseJournalRepository.paths.entries,
            });
          } finally {
            isApplyingRemoteSnapshot = false;
          }
        },
        (error) => {
          console.error('[journal-store-sync]', 'Firestore realtime listener error', error);
        },
      );
    }
  },

  switchJournal: (nextWorkspaceId) => {
    const state = get();
    if (state.accessMode !== 'owner') return;
    if (nextWorkspaceId === state.workspaceId) return;

    const currentSnapshot = storeStateToSnapshot(state);
    saveJournalWorkspaceSnapshot(currentSnapshot);
    const target = state.journals.find((journal) => journal.workspaceId === nextWorkspaceId);
    if (!target) return;

    if ((state.syncStatus === 'cloud' || state.syncStatus === 'syncing' || state.dataSource === 'Firebase') && firebaseJournalRepository.userId) {
      void switchCloudJournal(nextWorkspaceId, target.name, currentSnapshot);
      return;
    }

    const targetSnapshot = loadJournalWorkspaceSnapshot(target.workspaceId, target.name);
    const nextJournals = upsertJournalSummary(
      mergeJournalSummaries(state.journals, targetSnapshot.journals),
      currentSnapshot,
    );

    set({
      ...snapshotToStoreState(targetSnapshot),
      workspaceId: target.workspaceId,
      journalName: targetSnapshot.journalName || target.name,
      journals: upsertJournalSummary(nextJournals, targetSnapshot),
      firestorePath: firebaseJournalRepository.paths.entries,
      events: [createJournalEvent('settings_changed', { setting: 'switch_journal', workspaceId: target.workspaceId })],
      notifications: [],
    });
  },

  deleteCurrentJournal: async () => {
    const state = get();
    if (state.accessMode !== 'owner') return state.journals;
    const deletedWorkspaceId = state.workspaceId;
    const remainingLocalJournals = withoutJournal(state.journals, deletedWorkspaceId);

    stopCloudSubscription();
    pendingCloudSnapshot = undefined;
    activeCloudLoadRequestId += 1;

    let remainingJournals = remainingLocalJournals;
    if (state.syncStatus === 'cloud' && firebaseJournalRepository.userId) {
      remainingJournals = await firebaseJournalRepository.deleteJournal(deletedWorkspaceId);
    } else if (typeof window !== 'undefined') {
      window.localStorage.removeItem(getJournalWorkspaceStorageKey(deletedWorkspaceId));
    }
    evictDeletedJournalCache(deletedWorkspaceId);
    firebaseJournalRepository.setActiveJournal(remainingJournals[0]?.workspaceId ?? defaultWorkspaceId);

    const fallbackSnapshot = {
      ...createDefaultJournalSnapshot(),
      journals: remainingJournals,
      workspaceId: remainingJournals[0]?.workspaceId ?? defaultWorkspaceId,
      journalName: remainingJournals[0]?.name ?? 'E_trading_N Journal',
    };

    isApplyingRemoteSnapshot = true;
    try {
      set({
        ...snapshotToStoreState(fallbackSnapshot),
        syncStatus: state.syncStatus === 'cloud' ? 'cloud' : state.syncStatus,
        syncMessage: remainingJournals.length
          ? 'Journal deleted. Choose another journal.'
          : 'Journal deleted. Create a new journal.',
        lastSyncedAt: new Date().toISOString(),
        dataSource: state.dataSource,
        firestorePath: firebaseJournalRepository.paths.entries,
        events: [createJournalEvent('settings_changed', { setting: 'delete_journal', workspaceId: deletedWorkspaceId })],
        notifications: [],
      });
    } finally {
      isApplyingRemoteSnapshot = false;
    }

    return remainingJournals;
  },

  updateExportEmail: (email) => {
    if (get().accessMode !== 'owner') return;
    set((state) => ({
      exportEmail: email,
      events: [createJournalEvent('settings_changed', { setting: 'export_email' }), ...state.events].slice(0, 100),
    }));
  },

  recordEvent: (type, metadata, tradeId) => {
    const event = createJournalEvent(type, metadata, tradeId);
    const notification = buildNotificationForEvent(type, metadata, tradeId);

    set((state) => ({
      events: [event, ...state.events].slice(0, 100),
      lastTradeAction: type.startsWith('trade_') ? event : state.lastTradeAction,
      notifications: notification ? [notification, ...state.notifications].slice(0, 100) : state.notifications,
    }));
  },

  addNotification: (input) => {
    set((state) => ({
      notifications: [createNotification(input), ...state.notifications].slice(0, 100),
    }));
  },

  markNotificationRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification,
      ),
    }));
  },

  markAllNotificationsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((notification) => ({ ...notification, read: true })),
    }));
  },

  createEmptyTemplateSnapshot: () => {
    const state = get();

    return {
      symbolOptions: state.symbolOptions,
      assetTypeBySymbol: state.assetTypeBySymbol,
      screenshotTimeframes: state.screenshotTimeframes,
      customEmotionOptions: state.customEmotionOptions,
      customRuleViolationOptions: state.customRuleViolationOptions,
      customStrategyOptions: state.customStrategyOptions,
      categorySettings: state.categorySettings,
      disciplineScoreSettings: state.disciplineScoreSettings,
      journalType: state.journalType,
    };
  },

  initializeCloudSync: async (userId, requestedJournalId, options = {}) => {
    console.info('[journal-store-sync]', 'initialize requested', {
      userId,
      workspaceId: requestedJournalId ?? firebaseJournalRepository.workspaceId,
      isConfigured: firebaseJournalRepository.isConfigured,
    });

    if (!firebaseJournalRepository.isConfigured || !userId) {
      console.info('[journal-store-sync]', 'fallback usage: Firebase is not configured; localStorage is the only source');
      set({ syncStatus: 'setup_required', syncMessage: userId ? 'Firebase setup required; using localStorage' : 'Sign in required for cloud journals', dataSource: 'fallback' });
      return false;
    }

    if (userId) {
      firebaseJournalRepository.setUser(userId);
      firebaseJournalRepository.clearSharedJournal();
    } else {
      firebaseJournalRepository.clearUser();
    }

    if (requestedJournalId) {
      if (!isValidJournalId(requestedJournalId)) {
        set({ syncStatus: 'error', syncMessage: `Invalid journal id: ${requestedJournalId}`, dataSource: 'fallback' });
        return false;
      }

      firebaseJournalRepository.setActiveJournal(requestedJournalId);
    }

    if (
      hasInitializedCloudSync &&
      initializedCloudUserId === userId &&
      initializedCloudJournalId === firebaseJournalRepository.workspaceId &&
      cloudUnsubscribe
    ) {
      return true;
    }

    hasInitializedCloudSync = true;
    initializedCloudUserId = userId;
    initializedCloudJournalId = firebaseJournalRepository.workspaceId;
    set({ syncStatus: 'syncing', syncMessage: 'Loaded cache; checking Firestore', dataSource: 'localStorage', accessMode: 'owner', isViewOnly: false, sharePermission: undefined, sharedOwnerId: undefined, shareCode: undefined });

    try {
      const localSnapshot = storeStateToSnapshot(get());
      const requestedWorkspaceId = requestedJournalId;
      let verifiedCloudJournals: JournalSummary[] | undefined;

      if (requestedWorkspaceId && !options.createIfMissing) {
        verifiedCloudJournals = await firebaseJournalRepository.listJournals();
        if (!verifiedCloudJournals.some((journal) => journal.workspaceId === requestedWorkspaceId)) {
          set((state) => ({
            syncStatus: 'error',
            syncMessage: 'Selected journal no longer exists. Choose another journal.',
            dataSource: 'fallback',
            journals: verifiedCloudJournals ?? [],
            notifications: [createSyncErrorNotification('Selected journal no longer exists.'), ...state.notifications].slice(0, 100),
          }));
          return false;
        }
      }

      const requestedSummary = requestedWorkspaceId
        ? (verifiedCloudJournals ?? get().journals).find((journal) => journal.workspaceId === requestedWorkspaceId)
        : undefined;
      const cachedRequestedSnapshot = requestedWorkspaceId
        ? getCachedJournalWorkspaceSnapshot(requestedWorkspaceId, requestedSummary?.name ?? 'E_trading_N Journal')
        : null;

      if (requestedWorkspaceId && requestedSummary) {
        const authoritativeJournals = verifiedCloudJournals ?? get().journals;
        const immediateSnapshot = {
          ...(cachedRequestedSnapshot ?? createJournalShellSnapshot(requestedWorkspaceId, requestedSummary.name, authoritativeJournals)),
          journals: authoritativeJournals,
        };
        firebaseJournalRepository.setActiveJournal(requestedWorkspaceId);
        initializedCloudJournalId = requestedWorkspaceId;
        stopCloudSubscription();
        console.info('[journal-store-sync]', 'opening journal immediately; Firestore refresh will continue in background', {
          workspaceId: requestedWorkspaceId,
          source: cachedRequestedSnapshot ? 'cache' : 'shell',
          tasks: Object.keys(immediateSnapshot.tasks).length,
          trades: Object.keys(immediateSnapshot.trades).length,
        });
        isApplyingRemoteSnapshot = true;
        try {
          set({
            ...snapshotToStoreState(immediateSnapshot),
            syncStatus: 'syncing',
            syncMessage: cachedRequestedSnapshot ? 'Opened cache; loading entries' : 'Opening journal; loading entries',
            dataSource: 'Firebase',
            firestorePath: firebaseJournalRepository.paths.entries,
          });
        } finally {
          isApplyingRemoteSnapshot = false;
        }
        const loadRequestId = ++activeCloudLoadRequestId;
        void refreshActiveCloudJournal(requestedWorkspaceId, immediateSnapshot.journalName, {
          createIfMissing: options.createIfMissing,
          loadRequestId,
        });
        return true;
      }

      const cloudJournals = verifiedCloudJournals ?? await firebaseJournalRepository.listJournals();
      if (
        requestedJournalId &&
        !options.createIfMissing &&
        !cloudJournals.some((journal) => journal.workspaceId === requestedJournalId)
      ) {
        set((state) => ({
          syncStatus: 'error',
          syncMessage: 'Selected journal no longer exists. Choose another journal.',
          dataSource: 'fallback',
          journals: cloudJournals,
          notifications: [createSyncErrorNotification('Selected journal no longer exists.'), ...state.notifications].slice(0, 100),
        }));
        return false;
      }
      const startingJournalId = requestedJournalId ?? localSnapshot.workspaceId ?? cloudJournals[0]?.workspaceId ?? firebaseJournalRepository.workspaceId;
      firebaseJournalRepository.setActiveJournal(startingJournalId);
      initializedCloudJournalId = startingJournalId;
      let cloudSnapshot = await firebaseJournalRepository.load(startingJournalId);

      if (cloudSnapshot) {
        cloudSnapshot = {
          ...cloudSnapshot,
          journals: cloudJournals,
        };
        cacheJournalWorkspaceSnapshot(cloudSnapshot);
        console.info('[journal-store-sync]', 'applying Firestore snapshot during initialization', {
          workspaceId: firebaseJournalRepository.workspaceId,
          tasks: Object.keys(cloudSnapshot.tasks).length,
          trades: Object.keys(cloudSnapshot.trades).length,
          days: Object.keys(cloudSnapshot.days).length,
          savedAt: cloudSnapshot.savedAt,
        });
        isApplyingRemoteSnapshot = true;
        try {
          set({
            ...snapshotToStoreState(cloudSnapshot),
            syncStatus: 'cloud',
            syncMessage: `Read from Firestore ${formatSyncTime()}`,
            lastSyncedAt: new Date().toISOString(),
            dataSource: 'Firebase',
            firestorePath: firebaseJournalRepository.paths.entries,
          });
        } finally {
          isApplyingRemoteSnapshot = false;
        }
      } else {
        console.info('[journal-store-sync]', 'no Firestore workspace found; creating empty user-owned journal', {
          workspaceId: firebaseJournalRepository.workspaceId,
        });
        const snapshotToSeed = {
          ...createDefaultJournalSnapshot(),
          workspaceId: startingJournalId,
          journalName: localSnapshot.journalName && requestedJournalId === localSnapshot.workspaceId ? localSnapshot.journalName : 'E_trading_N Journal',
          journalType: requestedJournalId === localSnapshot.workspaceId ? localSnapshot.journalType : 'combined',
          journals: upsertJournalSummary(cloudJournals, {
            workspaceId: startingJournalId,
            journalName: localSnapshot.journalName && requestedJournalId === localSnapshot.workspaceId ? localSnapshot.journalName : 'E_trading_N Journal',
            journalType: requestedJournalId === localSnapshot.workspaceId ? localSnapshot.journalType : 'combined',
          }),
        } satisfies JournalSnapshot;
        await firebaseJournalRepository.save(snapshotToSeed);
        cacheJournalWorkspaceSnapshot(snapshotToSeed);
        set({
          ...snapshotToStoreState(snapshotToSeed),
          syncStatus: 'cloud',
          syncMessage: `Wrote to Firestore ${formatSyncTime()}`,
          lastSyncedAt: new Date().toISOString(),
          dataSource: 'Firebase',
          firestorePath: firebaseJournalRepository.paths.entries,
        });
      }

      replaceCloudSubscription(
        (snapshot) => {
          if (useJournalStore.getState().workspaceId !== firebaseJournalRepository.workspaceId) {
            console.info('[journal-store-sync]', 'realtime default workspace ignored while a secondary local journal is active');
            return;
          }

          console.info('[journal-store-sync]', 'applying realtime Firestore snapshot to app state', {
            workspaceId: firebaseJournalRepository.workspaceId,
            tasks: Object.keys(snapshot.tasks).length,
            trades: Object.keys(snapshot.trades).length,
            days: Object.keys(snapshot.days).length,
            savedAt: snapshot.savedAt,
          });
          isApplyingRemoteSnapshot = true;
          try {
            cacheJournalWorkspaceSnapshot(snapshot);
            set({
              ...snapshotToStoreState(snapshot),
              journals: useJournalStore.getState().journals,
              syncStatus: 'cloud',
              syncMessage: `Realtime update ${formatSyncTime()}`,
              lastSyncedAt: new Date().toISOString(),
              dataSource: 'Firebase',
              firestorePath: firebaseJournalRepository.paths.entries,
            });
          } finally {
            isApplyingRemoteSnapshot = false;
          }
        },
        (error) => {
          console.error('[journal-store-sync]', 'Firestore realtime listener error', error);
          console.info('[journal-store-sync]', 'fallback usage: realtime listener failed; keeping local cache usable');
          set((state) => ({
            syncStatus: 'error',
            syncMessage: 'Cloud sync error. Local fallback active.',
            dataSource: 'fallback',
            notifications: [createSyncErrorNotification('Realtime sync failed.'), ...state.notifications].slice(0, 100),
          }));
        },
      );

      return true;
    } catch (error) {
      console.error('[journal-store-sync]', 'Cloud sync initialization error', error);
      console.info('[journal-store-sync]', 'fallback usage: Firestore initial read failed; keeping localStorage state visible');
      hasInitializedCloudSync = false;
      initializedCloudUserId = undefined;
      initializedCloudJournalId = undefined;
      set((state) => ({
        syncStatus: 'error',
        syncMessage: 'Cloud sync error. Local fallback active.',
        dataSource: 'fallback',
        notifications: [createSyncErrorNotification('Cloud initialization failed.'), ...state.notifications].slice(0, 100),
      }));
      return false;
    }
  },

  initializeSharedJournal: async (userId, shareCode) => {
    console.info('[journal-store-sync]', 'shared initialize requested', {
      userId,
      shareCode,
      isConfigured: firebaseJournalRepository.isConfigured,
    });

    if (!firebaseJournalRepository.isConfigured || !userId) {
      set({ syncStatus: 'setup_required', syncMessage: 'Sign in required for shared journals', dataSource: 'fallback' });
      return false;
    }

    const normalizedShareCode = shareCode.trim().toUpperCase();
    if (!isValidShareCode(normalizedShareCode)) {
      set({ syncStatus: 'error', syncMessage: 'Invalid share link.', dataSource: 'fallback', accessMode: 'owner', isViewOnly: false, sharePermission: undefined, sharedOwnerId: undefined, shareCode: undefined });
      return false;
    }

    firebaseJournalRepository.setUser(userId);
    set({ syncStatus: 'syncing', syncMessage: 'Opening shared journal', dataSource: 'Firebase', accessMode: 'owner', isViewOnly: false, sharePermission: undefined, sharedOwnerId: undefined, shareCode: undefined });

    try {
      const share = await firebaseJournalRepository.resolveShare(normalizedShareCode);
      if (!share) {
        set({ syncStatus: 'error', syncMessage: 'Shared journal link was not found.', dataSource: 'fallback', accessMode: 'owner', isViewOnly: false, sharePermission: undefined, sharedOwnerId: undefined, shareCode: undefined });
        return false;
      }

      if (share.ownerId === userId) {
        firebaseJournalRepository.clearSharedJournal();
        return get().initializeCloudSync(userId, share.journalId);
      }

      await firebaseJournalRepository.claimShare(share);
      firebaseJournalRepository.setSharedJournal(share);
      stopCloudSubscription();
      hasInitializedCloudSync = true;
      initializedCloudUserId = userId;
      initializedCloudJournalId = share.journalId;
      activeCloudLoadRequestId += 1;

      const sharedSnapshot = await firebaseJournalRepository.load(share.journalId);
      if (!sharedSnapshot) {
        set({ syncStatus: 'error', syncMessage: 'Shared journal could not be opened.', dataSource: 'fallback', accessMode: 'owner', isViewOnly: false, sharePermission: undefined, sharedOwnerId: undefined, shareCode: undefined });
        return false;
      }

      const snapshotWithSingleJournal = {
        ...sharedSnapshot,
        journals: [{
          workspaceId: share.journalId,
          name: sharedSnapshot.journalName,
          savedAt: sharedSnapshot.savedAt,
          journalType: sharedSnapshot.journalType,
        }],
      };
      const canEdit = share.permission === 'edit';

      isApplyingRemoteSnapshot = true;
      try {
        set({
          ...snapshotToStoreState(snapshotWithSingleJournal),
          syncStatus: 'cloud',
          syncMessage: canEdit ? `Shared edit access ${formatSyncTime()}` : `Shared view-only access ${formatSyncTime()}`,
          lastSyncedAt: new Date().toISOString(),
          dataSource: 'Firebase',
          firestorePath: firebaseJournalRepository.paths.entries,
          accessMode: 'viewer',
          isViewOnly: !canEdit,
          sharePermission: share.permission,
          sharedOwnerId: share.ownerId,
          shareCode: share.shareCode,
          events: [],
        });
      } finally {
        isApplyingRemoteSnapshot = false;
      }

      replaceCloudSubscription(
        (snapshot) => {
          isApplyingRemoteSnapshot = true;
          try {
            useJournalStore.setState({
              ...snapshotToStoreState({
                ...snapshot,
                journals: useJournalStore.getState().journals,
              }),
              syncStatus: 'cloud',
              syncMessage: `Shared realtime update ${formatSyncTime()}`,
              lastSyncedAt: new Date().toISOString(),
              dataSource: 'Firebase',
              firestorePath: firebaseJournalRepository.paths.entries,
              accessMode: 'viewer',
              isViewOnly: share.permission !== 'edit',
              sharePermission: share.permission,
              sharedOwnerId: share.ownerId,
              shareCode: share.shareCode,
            });
          } finally {
            isApplyingRemoteSnapshot = false;
          }
        },
        (error) => {
          console.error('[journal-store-sync]', 'Shared Firestore realtime listener error', error);
          useJournalStore.setState((state) => ({
            syncStatus: 'error',
            syncMessage: 'Shared journal sync error.',
            dataSource: 'fallback',
            notifications: [createSyncErrorNotification('Shared journal sync failed.'), ...state.notifications].slice(0, 100),
          }));
        },
      );

      return true;
    } catch (error) {
      console.error('[journal-store-sync]', 'Shared journal initialization error', error);
      set((state) => ({
        syncStatus: 'error',
        syncMessage: 'Shared journal could not be opened.',
        dataSource: 'fallback',
        accessMode: 'owner',
        isViewOnly: false,
        sharePermission: undefined,
        sharedOwnerId: undefined,
        shareCode: undefined,
        notifications: [createSyncErrorNotification('Shared journal could not be opened.'), ...state.notifications].slice(0, 100),
      }));
      return false;
    }
  },

  resetCloudJournalState: (userId) => {
    stopCloudSubscription();
    hasInitializedCloudSync = false;
    initializedCloudUserId = undefined;
    initializedCloudJournalId = undefined;
    pendingCloudSnapshot = undefined;
    activeCloudLoadRequestId += 1;
    cloudSnapshotCache.clear();
    if (userId) {
      firebaseJournalRepository.setUser(userId);
      firebaseJournalRepository.clearSharedJournal();
    } else {
      firebaseJournalRepository.clearUser();
    }
    firebaseJournalRepository.setActiveJournal(defaultWorkspaceId);

    const emptySelectionSnapshot = {
      ...createDefaultJournalSnapshot(),
      workspaceId: defaultWorkspaceId,
      journalName: 'E_trading_N Journal',
      journals: [],
    };

    isApplyingRemoteSnapshot = true;
    try {
      set({
        ...snapshotToStoreState(emptySelectionSnapshot),
        syncStatus: firebaseJournalRepository.isConfigured ? 'syncing' : 'setup_required',
        syncMessage: firebaseJournalRepository.isConfigured ? 'Choose or create a journal.' : 'Firebase setup required; using localStorage',
        lastSyncedAt: undefined,
        dataSource: firebaseJournalRepository.isConfigured ? 'Firebase' : 'fallback',
        firestorePath: firebaseJournalRepository.paths.entries,
        events: [],
        notifications: [],
        accessMode: 'owner',
        isViewOnly: false,
        sharePermission: undefined,
        sharedOwnerId: undefined,
        shareCode: undefined,
      });
    } finally {
      isApplyingRemoteSnapshot = false;
    }
  },

  addTask: (input) => {
    if (get().isViewOnly) return;
    const now = getNow();
    const id = createId('task');

    set((state) => {
      const day = ensureDay(state.days, input.date, state.workspaceId);
      const task: Task = {
        id,
        workspaceId: state.workspaceId,
        dayId: day.id,
        title: input.title.trim(),
        startTime: input.startTime,
        endTime: input.endTime,
        taskType: input.taskType,
        categoryId: input.categoryId,
        notes: input.notes?.trim(),
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
      };
      const nextTasks = [...day.taskIds.map((taskId) => state.tasks[taskId]), task].filter(
        Boolean,
      ) as Task[];
      const dayTrades = day.tradeIds.map((tradeId) => state.trades[tradeId]).filter(Boolean) as Trade[];
      const daySpots = day.spotIds.map((spotId) => state.spots[spotId]).filter(Boolean) as SpotPosition[];
      const metadata = buildDayMetadata(nextTasks, dayTrades, daySpots);
      const event = createJournalEvent('task_created', { taskId: id, date: input.date });

      return {
        events: [event, ...state.events].slice(0, 100),
        tasks: { ...state.tasks, [id]: task },
        days: {
          ...state.days,
          [input.date]: {
            ...day,
            taskIds: [...day.taskIds, id],
            result: metadata.result,
            metadata,
            updatedAt: now,
          },
        },
      };
    });
  },

  updateTask: (id, input) => {
    if (get().isViewOnly) return;
    const now = getNow();

    set((state) => {
      const existingTask = state.tasks[id];

      if (!existingTask) {
        return state;
      }

      const updatedTask: Task = {
        ...existingTask,
        title: input.title.trim(),
        startTime: input.startTime,
        endTime: input.endTime,
        taskType: input.taskType,
        categoryId: input.categoryId,
        notes: input.notes?.trim(),
        updatedAt: now,
      };
      const day = ensureDay(state.days, input.date, state.workspaceId);
      const dayTasks = day.taskIds
        .map((taskId) => (taskId === id ? updatedTask : state.tasks[taskId]))
        .filter(Boolean) as Task[];
      const dayTrades = day.tradeIds.map((tradeId) => state.trades[tradeId]).filter(Boolean) as Trade[];
      const daySpots = day.spotIds.map((spotId) => state.spots[spotId]).filter(Boolean) as SpotPosition[];
      const metadata = buildDayMetadata(dayTasks, dayTrades, daySpots);

      return {
        tasks: { ...state.tasks, [id]: updatedTask },
        days: {
          ...state.days,
          [input.date]: {
            ...day,
            result: metadata.result,
            metadata,
            updatedAt: now,
          },
        },
      };
    });
  },

  addTrade: (input) => {
    if (get().isViewOnly) return;
    const now = getNow();
    const id = createId('trade');

    set((state) => {
      const day = ensureDay(state.days, input.date, state.workspaceId);
      const discipline = buildDisciplineSnapshot({
        adherence: input.adherence,
        emotionBefore: input.emotionBefore,
        emotionAfter: input.emotionAfter,
        ruleViolations: input.ruleViolations ?? [],
        settings: state.disciplineScoreSettings,
      });
      const assetName = normalizeAssetName(input.coin);
      const closeDate = input.status === 'closed' ? normalizeDateKey(input.exitDate) : undefined;
      const numericPnl = Number.isFinite(input.pnl) ? input.pnl : 0;
      const mode = normalizeTradeMode(input.mode);
      const trade: Trade = {
        id,
        workspaceId: state.workspaceId,
        dayId: day.id,
        title: input.title?.trim(),
        status: input.status,
        result: input.result,
        mode,
        entryDate: normalizeDateKey(input.entryDate) ?? input.entryDate,
        entryTime: input.entryTime,
        exitDate: closeDate,
        closeDate,
        exitTime: input.exitTime,
        stopPercentage: input.stopPercentage,
        riskDollars: input.riskDollars,
        pnl: numericPnl,
        numericPnl,
        pnlInput: input.pnlInput,
        rr: input.rr,
        coin: assetName,
        assetName,
        assetType: normalizeAssetType(input.assetType, assetName),
        strategyId: input.strategyId,
        direction: input.direction,
        adherence: input.adherence,
        emotion_before: input.emotionBefore,
        emotion_after: input.emotionAfter,
        ruleViolations: input.ruleViolations ?? [],
        categoryId: input.categoryId,
        notes: input.notes?.trim(),
        improvements: input.improvements?.trim(),
        preservationPoints: input.preservationPoints?.trim(),
        sharpeningNeeded: input.sharpeningNeeded?.trim(),
        screenshots: normalizeScreenshots(input.screenshots, id),
        disciplineScore: discipline.score,
        openedAt: now,
        closedAt: input.status === 'closed' ? now : undefined,
        lastEditedAt: now,
        editCount: 0,
        totalOpenDuration: input.status === 'closed' ? 0 : undefined,
        disciplineScoreHistory: [{ timestamp: now, score: discipline.score, reason: 'created' }],
        emotionalFlags: discipline.emotionalFlags,
        editableUntil:
          input.status === 'closed' && mode === 'live'
            ? new Date(new Date(now).getTime() + 2 * 60 * 60 * 1000).toISOString()
            : undefined,
        createdAt: now,
        updatedAt: now,
      };
      const nextTrades = [...day.tradeIds.map((tradeId) => state.trades[tradeId]), trade].filter(
        Boolean,
      ) as Trade[];
      const dayTasks = day.taskIds.map((taskId) => state.tasks[taskId]).filter(Boolean) as Task[];
      const daySpots = day.spotIds.map((spotId) => state.spots[spotId]).filter(Boolean) as SpotPosition[];
      const metadata = buildDayMetadata(dayTasks, nextTrades, daySpots);
      const eventType: JournalEventType = input.status === 'open' ? 'trade_opened' : 'trade_created';
      const event = createJournalEvent(eventType, { status: input.status, coin: trade.coin, mode: trade.mode }, id);
      const notifications = buildNotificationsForTrade(trade, input.ruleViolations ?? [], eventType);

      return {
        events: [event, ...state.events].slice(0, 100),
        lastTradeAction: event,
        notifications: mergeNewNotifications(notifications, state.notifications),
        trades: { ...state.trades, [id]: trade },
        days: {
          ...state.days,
          [input.date]: {
            ...day,
            tradeIds: [...day.tradeIds, id],
            result: metadata.result,
            metadata,
            updatedAt: now,
          },
        },
      };
    });
  },

  updateTrade: (id, input) => {
    if (get().isViewOnly) return;
    const now = getNow();

    set((state) => {
      const existingTrade = state.trades[id];

      if (!existingTrade) {
        return state;
      }

      const isLockedLiveTrade =
        existingTrade.status === 'closed' &&
        existingTrade.mode === 'live' &&
        getClosedTradeEditableUntil(existingTrade) !== undefined &&
        new Date(getClosedTradeEditableUntil(existingTrade) as string).getTime() < Date.now();

      if (isLockedLiveTrade) {
        return state;
      }

      const discipline = buildDisciplineSnapshot({
        adherence: input.adherence,
        emotionBefore: input.emotionBefore,
        emotionAfter: input.emotionAfter,
        ruleViolations: input.ruleViolations ?? [],
        settings: state.disciplineScoreSettings,
      });
      const closedAt = input.status === 'closed' ? existingTrade.closedAt ?? now : undefined;
      const openedAt = existingTrade.openedAt ?? existingTrade.createdAt;
      const assetName = normalizeAssetName(input.coin);
      const closeDate = input.status === 'closed' ? normalizeDateKey(input.exitDate) : undefined;
      const numericPnl = Number.isFinite(input.pnl) ? input.pnl : 0;
      const mode = normalizeTradeMode(input.mode);
      const updatedTrade: Trade = {
        ...existingTrade,
        title: input.title?.trim(),
        status: input.status,
        result: input.result,
        mode,
        entryDate: normalizeDateKey(input.entryDate) ?? input.entryDate,
        entryTime: input.entryTime,
        exitDate: closeDate,
        closeDate,
        exitTime: input.exitTime,
        stopPercentage: input.stopPercentage,
        riskDollars: input.riskDollars,
        pnl: numericPnl,
        numericPnl,
        pnlInput: input.pnlInput,
        rr: input.rr,
        coin: assetName,
        assetName,
        assetType: normalizeAssetType(input.assetType, assetName),
        strategyId: input.strategyId,
        direction: input.direction,
        adherence: input.adherence,
        emotion_before: input.emotionBefore,
        emotion_after: input.emotionAfter,
        ruleViolations: input.ruleViolations ?? [],
        categoryId: input.categoryId,
        notes: input.notes?.trim(),
        improvements: input.improvements?.trim(),
        preservationPoints: input.preservationPoints?.trim(),
        sharpeningNeeded: input.sharpeningNeeded?.trim(),
        screenshots: normalizeScreenshots(input.screenshots, id),
        disciplineScore: discipline.score,
        openedAt,
        closedAt,
        lastEditedAt: now,
        editCount: (existingTrade.editCount ?? 0) + 1,
        totalOpenDuration:
          input.status === 'closed' && closedAt
            ? Math.max(0, new Date(closedAt).getTime() - new Date(openedAt).getTime())
            : existingTrade.totalOpenDuration,
        disciplineScoreHistory: [
          ...(existingTrade.disciplineScoreHistory ?? []),
          { timestamp: now, score: discipline.score, reason: 'edited' as const },
        ].slice(-25),
        emotionalFlags: discipline.emotionalFlags,
        editableUntil:
          input.status === 'closed' && mode === 'live'
            ? existingTrade.editableUntil ?? (existingTrade.closedAt ? new Date(new Date(existingTrade.closedAt).getTime() + 2 * 60 * 60 * 1000).toISOString() : new Date(new Date(now).getTime() + 2 * 60 * 60 * 1000).toISOString())
            : undefined,
        updatedAt: now,
      };
      const day = ensureDay(state.days, input.date, state.workspaceId);
      const dayTrades = day.tradeIds
        .map((tradeId) => (tradeId === id ? updatedTrade : state.trades[tradeId]))
        .filter(Boolean) as Trade[];
      const dayTasks = day.taskIds.map((taskId) => state.tasks[taskId]).filter(Boolean) as Task[];
      const daySpots = day.spotIds.map((spotId) => state.spots[spotId]).filter(Boolean) as SpotPosition[];
      const metadata = buildDayMetadata(dayTasks, dayTrades, daySpots);
      const eventType: JournalEventType =
        existingTrade.status === 'open' && input.status === 'closed' ? 'trade_closed' : 'trade_edited';
      const event = createJournalEvent(eventType, { status: input.status, coin: updatedTrade.coin, editCount: updatedTrade.editCount }, id);
      const newlyAddedViolations = (input.ruleViolations ?? []).filter(
        (violation) => !existingTrade.ruleViolations.includes(violation),
      );
      const notifications = buildNotificationsForTrade(updatedTrade, newlyAddedViolations, eventType);

      return {
        events: [event, ...state.events].slice(0, 100),
        lastTradeAction: event,
        notifications: mergeNewNotifications(notifications, state.notifications),
        trades: { ...state.trades, [id]: updatedTrade },
        days: {
          ...state.days,
          [input.date]: {
            ...day,
            result: metadata.result,
            metadata,
            updatedAt: now,
          },
        },
      };
    });
  },

  addSpot: (input) => {
    if (get().isViewOnly) return;
    const now = getNow();
    const id = createId('spot');

    set((state) => {
      const day = ensureDay(state.days, input.date, state.workspaceId);
      const assetName = normalizeAssetName(input.assetName);
      const expectedBuyCost = input.buyPrice * input.quantityBought;
      const initialQuantitySold = input.sell?.quantitySold && input.sell.quantitySold > 0
        ? Math.min(input.sell.quantitySold, input.quantityBought)
        : 0;
      const initialExpectedSellValue = input.sell ? input.sell.sellPrice * initialQuantitySold : 0;
      const initialActualAmountReceived = input.sell
        ? Number.isFinite(input.sell.actualAmountReceived)
          ? input.sell.actualAmountReceived
          : initialExpectedSellValue
        : 0;
      const initialCostBasisSold = input.buyPrice * initialQuantitySold;
      const initialSell = input.sell && initialQuantitySold > 0
        ? [{
            id: createId('spot_sell'),
            sellDate: normalizeDateKey(input.sell.sellDate) ?? input.sell.sellDate,
            sellTime: input.sell.sellTime || undefined,
            sellPrice: input.sell.sellPrice,
            quantitySold: initialQuantitySold,
            actualAmountReceived: initialActualAmountReceived,
            reasonForExit: input.sell.reasonForExit?.trim(),
            notes: input.sell.notes?.trim(),
            screenshots: normalizeScreenshots(input.sell.screenshots ?? [], `${id}_sell`),
            expectedSellValue: initialExpectedSellValue,
            sellFeesSlippage: initialExpectedSellValue - initialActualAmountReceived,
            costBasisSold: initialCostBasisSold,
            netPnl: initialActualAmountReceived - initialCostBasisSold,
            holdingDurationMs: getHoldingDurationMs(input.buyDate, input.buyTime, input.sell.sellDate, input.sell.sellTime),
            createdAt: now,
            updatedAt: now,
          }]
        : [];
      const initialRemainingQuantity = Math.max(0, input.quantityBought - initialQuantitySold);
      const spot: SpotPosition = {
        id,
        workspaceId: state.workspaceId,
        dayId: day.id,
        status: initialQuantitySold <= 0 ? 'open' : initialRemainingQuantity <= 0 ? 'closed' : 'partially_sold',
        assetName,
        assetType: normalizeAssetType(input.assetType, assetName),
        buyDate: normalizeDateKey(input.buyDate) ?? input.buyDate,
        buyTime: input.buyTime || undefined,
        buyPrice: input.buyPrice,
        quantityBought: input.quantityBought,
        actualAmountPaid: expectedBuyCost,
        currentPortfolioValue: input.currentPortfolioValue,
        targetPrice: input.targetPrice,
        stopLoss: input.stopLoss,
        takeProfit: input.takeProfit,
        reasonForEntry: input.reasonForEntry?.trim(),
        notes: input.notes?.trim(),
        screenshots: normalizeScreenshots(input.screenshots ?? [], id),
        sells: initialSell,
        expectedBuyCost,
        buyFeesSlippage: 0,
        realizedPnl: initialSell.reduce((sum, sell) => sum + sell.netPnl, 0),
        quantitySold: initialQuantitySold,
        remainingQuantity: initialRemainingQuantity,
        createdAt: now,
        updatedAt: now,
      };
      const dayTasks = day.taskIds.map((taskId) => state.tasks[taskId]).filter(Boolean) as Task[];
      const dayTrades = day.tradeIds.map((tradeId) => state.trades[tradeId]).filter(Boolean) as Trade[];
      const nextSpots = [...day.spotIds.map((spotId) => state.spots[spotId]), spot].filter(Boolean) as SpotPosition[];
      const metadata = buildDayMetadata(dayTasks, dayTrades, nextSpots);
      const notifications = initialQuantitySold > 0
        ? [...buildNotificationsForSpot(spot, 'open'), ...buildNotificationsForSpot(spot, spot.status)]
        : buildNotificationsForSpot(spot, 'open');
      const accountValueAfterBuy = input.currentPortfolioValue === undefined
        ? state.accountValueResets
        : upsertAccountValueRecord(state.accountValueResets, {
          date: spot.buyDate,
          mode: 'spot',
          value: input.currentPortfolioValue,
          note: `Spot ${assetName}`,
        });
      const initialSellPnl = initialSell.reduce((sum, sell) => sum + sell.netPnl, 0);
      const previousSpotValue = input.sell?.sellDate
        ? getLatestAccountValueBeforeOrOnDate(accountValueAfterBuy, 'spot', normalizeDateKey(input.sell.sellDate) ?? input.sell.sellDate)
        : undefined;
      const accountValueResets = initialSell.length && previousSpotValue !== undefined && Number.isFinite(initialSellPnl)
        ? upsertAccountValueRecord(accountValueAfterBuy, {
          date: initialSell[0].sellDate,
          mode: 'spot',
          value: previousSpotValue + initialSellPnl,
          note: `Spot ${assetName} realized P/L ${initialSellPnl.toFixed(2)}`,
        })
        : accountValueAfterBuy;

      return {
        accountValueResets,
        notifications: [...notifications, ...state.notifications].slice(0, 100),
        spots: { ...state.spots, [id]: spot },
        days: {
          ...state.days,
          [input.date]: {
            ...day,
            spotIds: [...day.spotIds, id],
            result: metadata.result,
            metadata,
            updatedAt: now,
          },
        },
      };
    });
  },

  updateSpot: (id, input) => {
    if (get().isViewOnly) return;
    const now = getNow();

    set((state) => {
      const existingSpot = state.spots[id];
      if (!existingSpot) return state;

      const assetName = normalizeAssetName(input.assetName);
      const expectedBuyCost = input.buyPrice * input.quantityBought;
      const sells = existingSpot.sells.map((sell) => {
        const expectedSellValue = sell.sellPrice * sell.quantitySold;
        const actualAmountReceived = Number.isFinite(sell.actualAmountReceived) ? sell.actualAmountReceived : expectedSellValue;
        const costBasisSold = input.quantityBought > 0 ? (sell.quantitySold / input.quantityBought) * expectedBuyCost : 0;

        return {
          ...sell,
          actualAmountReceived,
          expectedSellValue,
          sellFeesSlippage: expectedSellValue - actualAmountReceived,
          costBasisSold,
          netPnl: actualAmountReceived - costBasisSold,
          updatedAt: now,
        };
      });
      const quantitySold = sells.reduce((sum, sell) => sum + sell.quantitySold, 0);
      const remainingQuantity = Math.max(0, input.quantityBought - quantitySold);
      const updatedSpot: SpotPosition = {
        ...existingSpot,
        assetName,
        assetType: normalizeAssetType(input.assetType, assetName),
        buyDate: normalizeDateKey(input.buyDate) ?? input.buyDate,
        buyTime: input.buyTime || undefined,
        buyPrice: input.buyPrice,
        quantityBought: input.quantityBought,
        actualAmountPaid: expectedBuyCost,
        currentPortfolioValue: input.currentPortfolioValue,
        targetPrice: input.targetPrice,
        stopLoss: input.stopLoss,
        takeProfit: input.takeProfit,
        reasonForEntry: input.reasonForEntry?.trim(),
        notes: input.notes?.trim(),
        screenshots: normalizeScreenshots(input.screenshots ?? [], id),
        sells,
        expectedBuyCost,
        buyFeesSlippage: 0,
        realizedPnl: sells.reduce((sum, sell) => sum + sell.netPnl, 0),
        quantitySold,
        remainingQuantity,
        status: remainingQuantity <= 0 && input.quantityBought > 0 ? 'closed' : quantitySold > 0 ? 'partially_sold' : 'open',
        updatedAt: now,
      };
      const day = ensureDay(state.days, updatedSpot.dayId || input.date, state.workspaceId);
      const dayTasks = day.taskIds.map((taskId) => state.tasks[taskId]).filter(Boolean) as Task[];
      const dayTrades = day.tradeIds.map((tradeId) => state.trades[tradeId]).filter(Boolean) as Trade[];
      const daySpots = day.spotIds.map((spotId) => (spotId === id ? updatedSpot : state.spots[spotId])).filter(Boolean) as SpotPosition[];
      const metadata = buildDayMetadata(dayTasks, dayTrades, daySpots);
      const accountValueResets = input.currentPortfolioValue === undefined
        ? state.accountValueResets
        : upsertAccountValueRecord(state.accountValueResets, {
          date: updatedSpot.buyDate,
          mode: 'spot',
          value: input.currentPortfolioValue,
          note: `Spot ${assetName}`,
        });

      return {
        accountValueResets,
        spots: { ...state.spots, [id]: updatedSpot },
        days: {
          ...state.days,
          [day.id]: { ...day, result: metadata.result, metadata, updatedAt: now },
        },
      };
    });
  },

  addSpotSell: (id, input) => {
    if (get().isViewOnly) return;
    const now = getNow();

    set((state) => {
      const existingSpot = state.spots[id];
      if (!existingSpot) return state;

      const quantitySoldBefore = existingSpot.sells.reduce((sum, sell) => sum + sell.quantitySold, 0);
      const quantitySold = Math.min(input.quantitySold, Math.max(0, existingSpot.quantityBought - quantitySoldBefore));
      if (quantitySold <= 0) return state;

      const expectedSellValue = input.sellPrice * quantitySold;
      const sellFeesSlippage = expectedSellValue - input.actualAmountReceived;
      const costBasisSold = existingSpot.quantityBought > 0 ? (quantitySold / existingSpot.quantityBought) * existingSpot.expectedBuyCost : 0;
      const netPnl = input.actualAmountReceived - costBasisSold;
      const sell = {
        id: createId('spot_sell'),
        sellDate: normalizeDateKey(input.sellDate) ?? input.sellDate,
        sellTime: input.sellTime || undefined,
        sellPrice: input.sellPrice,
        quantitySold,
        actualAmountReceived: input.actualAmountReceived,
        reasonForExit: input.reasonForExit?.trim(),
        notes: input.notes?.trim(),
        screenshots: normalizeScreenshots(input.screenshots ?? [], `${id}_sell`),
        expectedSellValue,
        sellFeesSlippage,
        costBasisSold,
        netPnl,
        holdingDurationMs: getHoldingDurationMs(existingSpot.buyDate, existingSpot.buyTime, input.sellDate, input.sellTime),
        createdAt: now,
        updatedAt: now,
      };
      const sells = [...existingSpot.sells, sell];
      const nextQuantitySold = sells.reduce((sum, item) => sum + item.quantitySold, 0);
      const remainingQuantity = Math.max(0, existingSpot.quantityBought - nextQuantitySold);
      const updatedSpot: SpotPosition = {
        ...existingSpot,
        sells,
        quantitySold: nextQuantitySold,
        remainingQuantity,
        realizedPnl: sells.reduce((sum, item) => sum + item.netPnl, 0),
        status: remainingQuantity <= 0 ? 'closed' : 'partially_sold',
        updatedAt: now,
      };
      const day = ensureDay(state.days, updatedSpot.dayId, state.workspaceId);
      const dayTasks = day.taskIds.map((taskId) => state.tasks[taskId]).filter(Boolean) as Task[];
      const dayTrades = day.tradeIds.map((tradeId) => state.trades[tradeId]).filter(Boolean) as Trade[];
      const daySpots = day.spotIds.map((spotId) => (spotId === id ? updatedSpot : state.spots[spotId])).filter(Boolean) as SpotPosition[];
      const metadata = buildDayMetadata(dayTasks, dayTrades, daySpots);
      const notifications = buildNotificationsForSpot(updatedSpot, updatedSpot.status);
      const previousSpotValue = getLatestAccountValueBeforeOrOnDate(state.accountValueResets, 'spot', sell.sellDate);
      const accountValueResets = previousSpotValue === undefined || !Number.isFinite(netPnl)
        ? state.accountValueResets
        : upsertAccountValueRecord(state.accountValueResets, {
          date: sell.sellDate,
          mode: 'spot',
          value: previousSpotValue + netPnl,
          note: `Spot ${existingSpot.assetName} realized P/L ${netPnl.toFixed(2)}`,
        });

      return {
        accountValueResets,
        notifications: [...notifications, ...state.notifications].slice(0, 100),
        spots: { ...state.spots, [id]: updatedSpot },
        days: {
          ...state.days,
          [day.id]: { ...day, result: metadata.result, metadata, updatedAt: now },
        },
      };
    });
  },

  addSymbolOption: (symbol, assetType = 'crypto') => {
    if (get().accessMode !== 'owner') return;
    const normalizedSymbol = normalizeAssetName(symbol).replace(/[^A-Z0-9]/g, '');
    const normalizedAssetType = normalizeAssetType(assetType, normalizedSymbol);

    if (!normalizedSymbol) {
      return;
    }

    set((state) => ({
      events: [createJournalEvent('preset_added', { presetType: 'symbol', value: normalizedSymbol, assetType: normalizedAssetType }), ...state.events].slice(0, 100),
      assetTypeBySymbol: { ...state.assetTypeBySymbol, [normalizedSymbol]: normalizedAssetType },
      symbolOptions: state.symbolOptions.includes(normalizedSymbol)
        ? state.symbolOptions
        : [...state.symbolOptions, normalizedSymbol],
    }));
  },

  addScreenshotTimeframe: (timeframe) => {
    if (get().accessMode !== 'owner') return;
    const normalizedTimeframe = timeframe.trim();

    if (!normalizedTimeframe) {
      return;
    }

    set((state) => {
      const nextTimeframes = state.screenshotTimeframes.includes(normalizedTimeframe)
        ? state.screenshotTimeframes
        : [...state.screenshotTimeframes, normalizedTimeframe];

      return {
        events: [createJournalEvent('preset_added', { presetType: 'timeframe', value: normalizedTimeframe }), ...state.events].slice(0, 100),
        screenshotTimeframes: nextTimeframes.sort(compareTimeframes),
      };
    });
  },
  addCustomEmotion: (value) => {
    if (get().accessMode !== 'owner') return;
    const normalized = normalizePreset(value);
    if (!normalized) return;
    set((state) => ({
      events: [createJournalEvent('preset_added', { presetType: 'emotion', value: normalized }), ...state.events].slice(0, 100),
      customEmotionOptions: state.customEmotionOptions.includes(normalized)
        ? state.customEmotionOptions
        : [...state.customEmotionOptions, normalized],
    }));
  },
  addCustomRuleViolation: (value) => {
    if (get().accessMode !== 'owner') return;
    const normalized = normalizePreset(value);
    if (!normalized) return;
    set((state) => ({
      events: [createJournalEvent('preset_added', { presetType: 'rule_violation', value: normalized }), ...state.events].slice(0, 100),
      customRuleViolationOptions: state.customRuleViolationOptions.includes(normalized)
        ? state.customRuleViolationOptions
        : [...state.customRuleViolationOptions, normalized],
    }));
  },
  addCustomStrategy: (value) => {
    if (get().accessMode !== 'owner') return;
    const normalized = normalizePreset(value);
    if (!normalized) return;
    set((state) => ({
      events: [createJournalEvent('preset_added', { presetType: 'strategy', value: normalized }), ...state.events].slice(0, 100),
      customStrategyOptions: state.customStrategyOptions.includes(normalized)
        ? state.customStrategyOptions
        : [...state.customStrategyOptions, normalized],
    }));
  },
  updateDisciplineScoreSettings: (settings) => {
    if (get().accessMode !== 'owner') return;
    set((state) => ({
      events: [createJournalEvent('settings_changed', { setting: 'discipline_score' }), ...state.events].slice(0, 100),
      disciplineScoreSettings: settings,
    }));
  },
  addAccountValueChange: (input) => {
    if (get().accessMode !== 'owner') return;
    if (!Number.isFinite(input.value)) return;

    const change: AccountValueReset = {
      id: createId('account_value'),
      date: input.date,
      value: input.value,
      mode: input.mode ?? 'live',
      note: input.note?.trim(),
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      accountValueResets: [change, ...state.accountValueResets].slice(0, 100),
      events: [createJournalEvent('settings_changed', { setting: 'account_value', value: change.value }), ...state.events].slice(0, 100),
    }));
  },
  clearLocalJournalData: () => {
    if (get().accessMode !== 'owner') return;
    const state = get();
    const resetSnapshot = createResetJournalSnapshot(state);
    journalRepository.save(resetSnapshot);
    cacheJournalWorkspaceSnapshot(resetSnapshot);
    set({
      ...snapshotToStoreState(resetSnapshot),
      syncMessage: state.syncStatus === 'cloud' ? 'Journal data reset; syncing empty journal' : state.syncMessage,
      events: [createJournalEvent('settings_changed', { setting: 'reset_journal_data', workspaceId: state.workspaceId })],
      notifications: [],
    });
  },
  exportJournalJson: () => journalRepository.exportJson(storeStateToSnapshot(get())),
  importJournalJson: (json) => {
    if (get().accessMode !== 'owner') return;
    const snapshot = journalRepository.importJson(json);
    const event = createJournalEvent('settings_changed', { source: 'json_import' });
    set((state) => ({ ...snapshotToStoreState(snapshot), events: [event, ...state.events].slice(0, 100) }));
  },
}));

function upsertAccountValueRecord(
  history: AccountValueReset[],
  input: Omit<AccountValueReset, 'id' | 'createdAt'>,
) {
  const existing = history.find((item) => item.mode === input.mode && item.date === input.date);
  if (!existing) {
    return [{
      id: createId('account_value'),
      date: input.date,
      value: input.value,
      mode: input.mode,
      note: input.note?.trim(),
      createdAt: new Date().toISOString(),
    }, ...history].slice(0, 100);
  }

  return history.map((item) =>
    item.id === existing.id
      ? {
        ...item,
        value: input.value,
        note: input.note?.trim() || item.note,
      }
      : item,
  );
}

function getLatestAccountValueBeforeOrOnDate(history: AccountValueReset[], mode: AccountValueMode, date: string) {
  return history
    .filter((item) => item.mode === mode && Number.isFinite(item.value) && (!item.date || item.date <= date))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id))
    .at(-1)?.value;
}

function getJournalWorkspaceStorageKey(workspaceId: string) {
  const userId = firebaseJournalRepository.userId ?? 'anonymous';
  return `e_trading_n:v1:journal:${userId}:${workspaceId}`;
}

function saveJournalWorkspaceSnapshot(snapshot: JournalSnapshot) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getJournalWorkspaceStorageKey(snapshot.workspaceId), JSON.stringify(snapshot));
}

function cacheJournalWorkspaceSnapshot(snapshot: JournalSnapshot) {
  cloudSnapshotCache.set(getJournalCacheKey(snapshot.workspaceId), snapshot);
  saveJournalWorkspaceSnapshot(snapshot);
}

function evictDeletedJournalCache(workspaceId: string) {
  cloudSnapshotCache.delete(getJournalCacheKey(workspaceId));

  if (typeof window === 'undefined') return;

  window.localStorage.removeItem(getJournalWorkspaceStorageKey(workspaceId));
  removeStorageEntriesForDeletedJournal(window.localStorage, workspaceId);
  removeStorageEntriesForDeletedJournal(window.sessionStorage, workspaceId);
}

function removeStorageEntriesForDeletedJournal(storage: Storage, workspaceId: string) {
  const keysToRemove: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;

    const value = storage.getItem(key);
    if (
      key.includes(workspaceId) ||
      (key.startsWith('e_trading_n:v1:selected-journal:') && value?.includes(workspaceId))
    ) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => storage.removeItem(key));
}

function getCachedJournalWorkspaceSnapshot(workspaceId: string, name: string) {
  const memorySnapshot = cloudSnapshotCache.get(getJournalCacheKey(workspaceId));
  if (memorySnapshot) return memorySnapshot;
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(getJournalWorkspaceStorageKey(workspaceId));
  if (!raw) return null;

  try {
    const snapshot = { ...createDefaultJournalSnapshot(), ...JSON.parse(raw), workspaceId } as JournalSnapshot;
    cloudSnapshotCache.set(getJournalCacheKey(workspaceId), snapshot);
    return snapshot;
  } catch {
    return { ...createDefaultJournalSnapshot(), workspaceId, journalName: name };
  }
}

function getJournalCacheKey(workspaceId: string) {
  return `${firebaseJournalRepository.userId ?? 'anonymous'}:${workspaceId}`;
}

function createJournalShellSnapshot(workspaceId: string, name: string, journals: JournalSummary[]): JournalSnapshot {
  const snapshot = {
    ...createDefaultJournalSnapshot(),
    workspaceId,
    journalName: name,
    journalType: 'combined' as const,
    journals: upsertJournalSummary(journals, { workspaceId, journalName: name, journalType: 'combined' }),
  };

  return snapshot;
}

function createResetJournalSnapshot(state: JournalState): JournalSnapshot {
  const defaults = createDefaultJournalSnapshot();
  const journals = upsertJournalSummary(state.journals, state);

  return {
    ...defaults,
    savedAt: new Date().toISOString(),
    workspaceId: state.workspaceId,
    journalName: state.journalName,
    journalType: state.journalType,
    days: {},
    tasks: {},
    trades: {},
    symbolOptions: defaults.symbolOptions,
    assetTypeBySymbol: defaults.assetTypeBySymbol,
    screenshotTimeframes: defaults.screenshotTimeframes,
    customEmotionOptions: [],
    customRuleViolationOptions: [],
    customStrategyOptions: [],
    categorySettings: defaults.categorySettings,
    disciplineScoreSettings: defaults.disciplineScoreSettings,
    accountValueResets: [],
    notifications: [],
    journals,
    exportEmail: '',
  };
}

function loadJournalWorkspaceSnapshot(workspaceId: string, name: string) {
  if (typeof window === 'undefined') {
    return { ...createDefaultJournalSnapshot(), workspaceId, journalName: name };
  }

  const raw = window.localStorage.getItem(getJournalWorkspaceStorageKey(workspaceId));
  if (!raw) return { ...createDefaultJournalSnapshot(), workspaceId, journalName: name };

  try {
    return normalizeJournalSnapshot({ ...createDefaultJournalSnapshot(), ...JSON.parse(raw), workspaceId });
  } catch {
    return { ...createDefaultJournalSnapshot(), workspaceId, journalName: name };
  }
}

async function switchCloudJournal(nextWorkspaceId: string, fallbackName: string, currentSnapshot: JournalSnapshot) {
  cacheJournalWorkspaceSnapshot(currentSnapshot);
  firebaseJournalRepository.setActiveJournal(nextWorkspaceId);
  initializedCloudJournalId = nextWorkspaceId;
  const loadRequestId = ++activeCloudLoadRequestId;
  stopCloudSubscription();
  const cachedTargetSnapshot = getCachedJournalWorkspaceSnapshot(nextWorkspaceId, fallbackName);

  if (cachedTargetSnapshot) {
    isApplyingRemoteSnapshot = true;
    try {
      useJournalStore.setState({
        ...snapshotToStoreState({
          ...cachedTargetSnapshot,
          journals: useJournalStore.getState().journals,
        }),
        syncStatus: 'syncing',
        syncMessage: 'Opened cache; refreshing Firestore',
        dataSource: 'Firebase',
        firestorePath: firebaseJournalRepository.paths.entries,
        events: [createJournalEvent('settings_changed', { setting: 'switch_journal', workspaceId: nextWorkspaceId })],
      });
    } finally {
      isApplyingRemoteSnapshot = false;
    }
  } else {
    const shellSnapshot = createJournalShellSnapshot(nextWorkspaceId, fallbackName, useJournalStore.getState().journals);
    isApplyingRemoteSnapshot = true;
    try {
      useJournalStore.setState({
        ...snapshotToStoreState(shellSnapshot),
        syncStatus: 'syncing',
        syncMessage: 'Opening journal; loading entries',
        dataSource: 'Firebase',
        firestorePath: firebaseJournalRepository.paths.entries,
        events: [createJournalEvent('settings_changed', { setting: 'switch_journal', workspaceId: nextWorkspaceId })],
      });
    } finally {
      isApplyingRemoteSnapshot = false;
    }
    useJournalStore.setState({
      syncStatus: 'syncing',
      syncMessage: 'Opening journal; loading entries',
      firestorePath: firebaseJournalRepository.paths.entries,
    });
  }

  void firebaseJournalRepository.save(currentSnapshot).catch((error) => {
    console.error('[journal-store-sync]', 'background save before journal switch failed', error);
  });
  await refreshActiveCloudJournal(nextWorkspaceId, fallbackName, { loadRequestId });
}

async function refreshActiveCloudJournal(
  nextWorkspaceId: string,
  fallbackName: string,
  options: { createIfMissing?: boolean; loadRequestId?: number } = {},
) {
  const loadRequestId = options.loadRequestId ?? ++activeCloudLoadRequestId;
  firebaseJournalRepository.setActiveJournal(nextWorkspaceId);
  stopCloudSubscription();
  useJournalStore.setState({
    syncStatus: 'syncing',
    syncMessage: 'Loading entries from Firestore',
    firestorePath: firebaseJournalRepository.paths.entries,
  });

  try {
    const cloudJournals = await firebaseJournalRepository.listJournals();
    if (isStaleCloudLoad(loadRequestId, nextWorkspaceId)) return;

    const loadedSnapshot = await firebaseJournalRepository.load(nextWorkspaceId);
    if (isStaleCloudLoad(loadRequestId, nextWorkspaceId)) return;

    if (!loadedSnapshot && !options.createIfMissing) {
      useJournalStore.setState((state) => ({
        syncStatus: 'error',
        syncMessage: 'Selected journal no longer exists. Choose another journal.',
        dataSource: 'fallback',
        journals: cloudJournals,
        notifications: [createSyncErrorNotification('Selected journal no longer exists.'), ...state.notifications].slice(0, 100),
      }));
      return;
    }

    const targetSnapshot =
      loadedSnapshot ??
      ({ ...createDefaultJournalSnapshot(), workspaceId: nextWorkspaceId, journalName: fallbackName } satisfies JournalSnapshot);
    const snapshotWithJournals = {
      ...targetSnapshot,
      journals: cloudJournals,
    };
    cacheJournalWorkspaceSnapshot(snapshotWithJournals);

    isApplyingRemoteSnapshot = true;
    try {
      useJournalStore.setState({
        ...snapshotToStoreState(snapshotWithJournals),
        syncStatus: 'cloud',
        syncMessage: `Read from Firestore ${formatSyncTime()}`,
        lastSyncedAt: new Date().toISOString(),
        dataSource: 'Firebase',
        firestorePath: firebaseJournalRepository.paths.entries,
        events: [createJournalEvent('settings_changed', { setting: 'switch_journal', workspaceId: nextWorkspaceId })],
      });
    } finally {
      isApplyingRemoteSnapshot = false;
    }

    replaceCloudSubscription(
      (snapshot) => {
        if (snapshot.workspaceId !== firebaseJournalRepository.workspaceId || isStaleCloudLoad(loadRequestId, nextWorkspaceId)) {
          console.info('[journal-store-sync]', 'stale realtime snapshot ignored', {
            snapshotWorkspaceId: snapshot.workspaceId,
            activeWorkspaceId: firebaseJournalRepository.workspaceId,
          });
          return;
        }
        cacheJournalWorkspaceSnapshot(snapshot);
        isApplyingRemoteSnapshot = true;
        try {
          useJournalStore.setState({
            ...snapshotToStoreState({
              ...snapshot,
              journals: useJournalStore.getState().journals,
            }),
            syncStatus: 'cloud',
            syncMessage: `Realtime update ${formatSyncTime()}`,
            lastSyncedAt: new Date().toISOString(),
            dataSource: 'Firebase',
            firestorePath: firebaseJournalRepository.paths.entries,
          });
        } finally {
          isApplyingRemoteSnapshot = false;
        }
      },
      (error) => {
        console.error('[journal-store-sync]', 'Firestore realtime listener error', error);
        useJournalStore.setState((state) => ({
          syncStatus: 'error',
          syncMessage: 'Cloud sync error. Local fallback active.',
          dataSource: 'fallback',
          notifications: [createSyncErrorNotification('Realtime sync failed.'), ...state.notifications].slice(0, 100),
        }));
      },
    );
  } catch (error) {
    console.error('[journal-store-sync]', 'Cloud journal refresh failed', error);
    useJournalStore.setState((state) => ({
      syncStatus: 'error',
      syncMessage: 'Cloud journal refresh failed. Cached journal remains open.',
      dataSource: 'fallback',
      notifications: [createSyncErrorNotification('Cloud journal refresh failed.'), ...state.notifications].slice(0, 100),
    }));
  }
}

function isStaleCloudLoad(loadRequestId: number, workspaceId: string) {
  return loadRequestId !== activeCloudLoadRequestId || firebaseJournalRepository.workspaceId !== workspaceId;
}

function getActiveCloudListenerKey() {
  return `${firebaseJournalRepository.userId ?? 'anonymous'}:${firebaseJournalRepository.workspaceId}`;
}

function stopCloudSubscription() {
  cloudUnsubscribe?.();
  cloudUnsubscribe = undefined;
  activeCloudListenerKey = undefined;
}

function replaceCloudSubscription(
  onChange: (snapshot: JournalSnapshot) => void,
  onError?: (error: Error) => void,
) {
  const listenerKey = getActiveCloudListenerKey();
  if (cloudUnsubscribe && activeCloudListenerKey === listenerKey) {
    console.info('[journal-store-sync]', 'Firestore realtime listener already active; duplicate subscribe skipped', {
      listenerKey,
    });
    return;
  }

  stopCloudSubscription();
  activeCloudListenerKey = listenerKey;
  cloudUnsubscribe = firebaseJournalRepository.subscribe(onChange, onError);
}

useJournalStore.subscribe((state, previousState) => {
  const snapshot = storeStateToSnapshot(state);
  const previousSnapshot = storeStateToSnapshot(previousState);
  const isSharedSession = Boolean(state.sharedOwnerId && state.sharePermission);

  if (snapshotFingerprint(snapshot) === snapshotFingerprint(previousSnapshot)) {
    return;
  }

  if (!isSharedSession) {
    journalRepository.save(snapshot);
  }

  if (state.syncStatus !== 'cloud' || isApplyingRemoteSnapshot) {
    if (isApplyingRemoteSnapshot) {
      console.info('[journal-store-sync]', isSharedSession
        ? 'shared snapshot applied without touching personal localStorage cache'
        : 'localStorage cache updated from Firebase snapshot');
    }
    return;
  }

  if (isSharedSession && state.sharePermission !== 'edit') {
    console.info('[journal-store-sync]', 'cloud write skipped for shared view-only session', {
      sharedOwnerId: state.sharedOwnerId,
      workspaceId: snapshot.workspaceId,
      shareCode: state.shareCode,
    });
    return;
  }

  if (snapshot.workspaceId !== firebaseJournalRepository.workspaceId) {
    console.info('[journal-store-sync]', 'cloud write skipped for local secondary journal workspace', {
      activeWorkspaceId: snapshot.workspaceId,
      firebaseWorkspaceId: firebaseJournalRepository.workspaceId,
    });
    return;
  }

  requestCloudWrite(snapshot);
});

function requestCloudWrite(snapshot: JournalSnapshot) {
  pendingCloudSnapshot = snapshot;
  console.info('[journal-store-sync]', 'cloud write requested', {
    workspaceId: firebaseJournalRepository.workspaceId,
    firestorePath: firebaseJournalRepository.paths.entries,
    tasks: Object.keys(snapshot.tasks).length,
    trades: Object.keys(snapshot.trades).length,
    days: Object.keys(snapshot.days).length,
  });

  if (!isWritingCloudSnapshot) {
    void drainCloudWriteQueue();
  }
}

async function drainCloudWriteQueue() {
  isWritingCloudSnapshot = true;

  try {
    while (pendingCloudSnapshot) {
      const snapshotToWrite = pendingCloudSnapshot;
      pendingCloudSnapshot = undefined;

      await firebaseJournalRepository.save(snapshotToWrite);
      const cloudSnapshot = await firebaseJournalRepository.load();

      if (!cloudSnapshot) {
        useJournalStore.setState({
          syncStatus: 'cloud',
          syncMessage: `Wrote to Firestore ${formatSyncTime()}`,
          lastSyncedAt: new Date().toISOString(),
          dataSource: 'Firebase',
        });
        continue;
      }

      console.info('[journal-store-sync]', 'forcing state refresh from Firestore after save', {
        workspaceId: firebaseJournalRepository.workspaceId,
        firestorePath: firebaseJournalRepository.paths.entries,
        tasks: Object.keys(cloudSnapshot.tasks).length,
        trades: Object.keys(cloudSnapshot.trades).length,
        days: Object.keys(cloudSnapshot.days).length,
        savedAt: cloudSnapshot.savedAt,
      });

      isApplyingRemoteSnapshot = true;
      try {
        useJournalStore.setState({
          ...snapshotToStoreState({
            ...cloudSnapshot,
            journals: useJournalStore.getState().journals,
          }),
          syncStatus: 'cloud',
          syncMessage: `Saved and verified ${formatSyncTime()}`,
          lastSyncedAt: new Date().toISOString(),
          dataSource: 'Firebase',
        });
      } finally {
        isApplyingRemoteSnapshot = false;
      }
    }
  } catch (error) {
    console.error('[journal-store-sync]', 'Cloud save or read-back error', error);
    console.info('[journal-store-sync]', 'fallback usage: save failed; preserving localStorage cache');
    useJournalStore.setState((state) => ({
      syncStatus: 'error',
      syncMessage: 'Cloud save error. Local fallback active.',
      dataSource: 'fallback',
      notifications: [createSyncErrorNotification('Cloud save failed.'), ...state.notifications].slice(0, 100),
    }));
  } finally {
    isWritingCloudSnapshot = false;

    if (pendingCloudSnapshot) {
      void drainCloudWriteQueue();
    }
  }
}

function storeStateToSnapshot(state: JournalState): JournalSnapshot {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    journalName: state.journalName,
    journalType: state.journalType,
    workspaceId: state.workspaceId,
    days: state.days,
    tasks: state.tasks,
    trades: state.trades,
    spots: state.spots,
    symbolOptions: state.symbolOptions,
    assetTypeBySymbol: state.assetTypeBySymbol,
    screenshotTimeframes: state.screenshotTimeframes,
    customEmotionOptions: state.customEmotionOptions,
    customRuleViolationOptions: state.customRuleViolationOptions,
    customStrategyOptions: state.customStrategyOptions,
    categorySettings: state.categorySettings,
    disciplineScoreSettings: state.disciplineScoreSettings,
    accountValueResets: state.accountValueResets,
    notifications: state.notifications,
    journals: state.journals.length ? upsertJournalSummary(state.journals, state) : [],
    exportEmail: state.exportEmail,
  };
}

function snapshotToStoreState(snapshot: JournalSnapshot) {
  return {
    journalName: snapshot.journalName,
    journalType: snapshot.journalType,
    workspaceId: snapshot.workspaceId,
    journals: snapshot.journals,
    exportEmail: snapshot.exportEmail ?? '',
    days: snapshot.days,
    tasks: snapshot.tasks,
    trades: snapshot.trades,
    spots: snapshot.spots,
    symbolOptions: snapshot.symbolOptions,
    assetTypeBySymbol: snapshot.assetTypeBySymbol,
    screenshotTimeframes: snapshot.screenshotTimeframes,
    customEmotionOptions: snapshot.customEmotionOptions,
    customRuleViolationOptions: snapshot.customRuleViolationOptions,
    customStrategyOptions: snapshot.customStrategyOptions,
    categorySettings: snapshot.categorySettings,
    disciplineScoreSettings: snapshot.disciplineScoreSettings,
    accountValueResets: snapshot.accountValueResets,
    notifications: snapshot.notifications,
  };
}

function upsertJournalSummary(journals: JournalSummary[], state: Pick<JournalState, 'workspaceId' | 'journalName' | 'journalType'> | JournalSnapshot) {
  const workspaceId = 'workspaceId' in state ? state.workspaceId : 'personal-journal';
  const name = 'journalName' in state ? state.journalName : 'E_trading_N Journal';
  const journalType = 'journalType' in state ? normalizeJournalType(state.journalType) : 'combined';
  const savedAt = new Date().toISOString();
  const next = journals.filter((journal) => journal.workspaceId !== workspaceId);
  return [...next, { workspaceId, name, savedAt, journalType }];
}

function mergeJournalSummaries(...journalLists: JournalSummary[][]) {
  const merged = new Map<string, JournalSummary>();

  journalLists.flat().forEach((journal) => {
    const existing = merged.get(journal.workspaceId);
    if (!existing || journal.savedAt > existing.savedAt) {
      merged.set(journal.workspaceId, journal);
    }
  });

  return Array.from(merged.values());
}

function withoutJournal(journals: JournalSummary[], workspaceId: string) {
  return journals.filter((journal) => journal.workspaceId !== workspaceId);
}

function isValidJournalId(value: string) {
  return Boolean(value && !value.includes('/') && value !== '.' && value !== '..');
}

function isValidShareCode(value: string) {
  return /^TRD-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value);
}

function normalizePreset(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeScreenshots(screenshots: ScreenshotSlot[], tradeId: string): ScreenshotSlot[] {
  return screenshots.map((screenshot, index) => ({
    ...screenshot,
    id: screenshot.id || `${tradeId}_${screenshot.slotType ?? screenshot.id}_${index}`,
    tradeId,
    slotType: screenshot.slotType ?? (screenshot.id as ScreenshotSlot['slotType']),
    order: screenshot.order ?? index,
    uploadPlaceholder: screenshot.uploadPlaceholder ?? 'pending',
    aiAnalysisStatus: screenshot.aiAnalysisStatus ?? 'not_started',
  }));
}

function getHoldingDurationMs(buyDate: string, buyTime: string | undefined, sellDate: string, sellTime?: string) {
  if (!buyDate || !sellDate) return undefined;
  const start = new Date(`${buyDate}T${buyTime || '00:00'}:00`);
  const end = new Date(`${sellDate}T${sellTime || '23:59'}:00`);
  const diffMs = end.getTime() - start.getTime();
  return Number.isFinite(diffMs) && diffMs >= 0 ? diffMs : undefined;
}

function getClosedTradeEditableUntil(trade: Trade) {
  if (trade.editableUntil) return trade.editableUntil;
  if (trade.closedAt) return new Date(new Date(trade.closedAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
  if (trade.status === 'closed' && trade.mode === 'live') {
    return new Date(new Date(trade.updatedAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
  }
  return undefined;
}

function createJournalEvent(type: JournalEventType, metadata?: JournalEvent['metadata'], tradeId?: string): JournalEvent {
  return {
    id: createId('event'),
    timestamp: new Date().toISOString(),
    workspaceId: defaultWorkspaceId,
    type,
    tradeId,
    metadata,
  };
}

function createNotification(input: CreateNotificationInput): JournalNotification {
  return {
    id: createId('notification'),
    type: input.type,
    title: input.title,
    message: input.message,
    createdAt: new Date().toISOString(),
    read: false,
    relatedTradeId: input.relatedTradeId,
    relatedSpotId: input.relatedSpotId,
    severity: input.severity ?? 'info',
    actionTarget: input.actionTarget,
    aiGenerated: input.aiGenerated ?? false,
    aiReason: input.aiReason,
    suggestedAction: input.suggestedAction,
    priorityScore: input.priorityScore ?? 0,
  };
}

function buildNotificationForEvent(type: JournalEventType, metadata?: JournalEvent['metadata'], tradeId?: string) {
  if (type !== 'export_created') return undefined;

  return createNotification({
    type: 'export_created',
    title: 'Export created',
    message: `Journal export created${metadata?.format ? ` (${metadata.format})` : ''}.`,
    severity: 'info',
    actionTarget: 'export',
    relatedTradeId: tradeId,
    suggestedAction: 'Save or share the export as needed.',
    priorityScore: 20,
  });
}

function buildNotificationsForTrade(
  trade: Trade,
  newlyAddedViolations: string[],
  eventType: JournalEventType,
) {
  const notifications: JournalNotification[] = [];

  if (eventType === 'trade_opened') {
    return [createNotification({
      type: 'trade_opened',
      title: 'Trade opened',
      message: `${trade.coin} opened at ${trade.entryDate} ${trade.entryTime}.`,
      relatedTradeId: trade.id,
      severity: 'info',
      actionTarget: `trade:${trade.id}`,
      suggestedAction: 'Track exit details and screenshots when closing.',
      priorityScore: 40,
    })];
  }

  if (eventType === 'trade_closed') {
    return [createNotification({
      type: 'trade_closed',
      title: 'Trade closed',
      message: `${trade.coin} closed with P/L ${trade.pnl.toFixed(2)}.`,
      relatedTradeId: trade.id,
      severity: 'info',
      actionTarget: `trade:${trade.id}`,
      suggestedAction: 'Review discipline and screenshots.',
      priorityScore: 45,
    })];
  }

  if (eventType === 'trade_created' && trade.disciplineScore < 70) {
    notifications.push(createNotification({
      type: 'discipline_warning',
      title: 'Low discipline score',
      message: `${trade.coin} discipline score is ${trade.disciplineScore}%.`,
      relatedTradeId: trade.id,
      severity: trade.disciplineScore < 50 ? 'critical' : 'warning',
      actionTarget: `trade:${trade.id}`,
      suggestedAction: 'Review adherence, emotion, and rule violations.',
      priorityScore: trade.disciplineScore < 50 ? 90 : 70,
    }));
  }

  newlyAddedViolations.forEach((violation) => {
    notifications.push(createNotification({
      type: 'rule_violation',
      title: 'Rule violation added',
      message: `${trade.coin}: ${violation.replace(/_/g, ' ')}`,
      relatedTradeId: trade.id,
      severity: 'warning',
      actionTarget: `trade:${trade.id}`,
      suggestedAction: 'Review the trade rules section.',
      priorityScore: 75,
    }));
  });

  return notifications;
}

function buildNotificationsForSpot(spot: SpotPosition, action: SpotPosition['status']) {
  const notificationType: NotificationType =
    action === 'closed' ? 'spot_closed' : action === 'partially_sold' ? 'spot_partially_sold' : 'spot_opened';
  const title =
    action === 'closed' ? 'Spot position closed' : action === 'partially_sold' ? 'Spot position partially sold' : 'Spot position opened';
  const message =
    action === 'closed'
      ? `${spot.assetName} Spot position closed.`
      : action === 'partially_sold'
        ? `${spot.assetName} Spot position partially sold. Remaining quantity: ${spot.remainingQuantity}.`
        : `${spot.assetName} Spot position opened at ${spot.buyDate} ${spot.buyTime ?? ''}.`;

  return [createNotification({
    type: notificationType,
    title,
    message,
    relatedSpotId: spot.id,
    severity: action === 'open' ? 'info' : 'warning',
    actionTarget: `spot:${spot.id}:${notificationType}`,
    suggestedAction: action === 'open' ? 'Track sell or close details when ready.' : 'Review remaining quantity and exit notes.',
    priorityScore: action === 'closed' ? 55 : action === 'partially_sold' ? 50 : 40,
  })];
}

function mergeNewNotifications(incoming: JournalNotification[], existing: JournalNotification[]) {
  const existingKeys = new Set(existing.map(getNotificationDedupeKey));
  const uniqueIncoming = incoming.filter((notification) => {
    const key = getNotificationDedupeKey(notification);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });

  return [...uniqueIncoming, ...existing].slice(0, 100);
}

function getNotificationDedupeKey(notification: JournalNotification) {
  return [
    notification.type,
    notification.relatedTradeId ?? '',
    notification.relatedSpotId ?? '',
    notification.actionTarget ?? '',
  ].join('|');
}

function createSyncErrorNotification(message: string) {
  return createNotification({
    type: 'sync_error',
    title: 'Cloud sync error',
    message: `${message} Local fallback remains active.`,
    severity: 'critical',
    actionTarget: 'settings:sync',
    suggestedAction: 'Check Firebase settings and connection.',
    priorityScore: 95,
  });
}

function formatSyncTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function snapshotFingerprint(snapshot: JournalSnapshot) {
  return JSON.stringify({
    journalName: snapshot.journalName,
    journalType: snapshot.journalType,
    workspaceId: snapshot.workspaceId,
    days: snapshot.days,
    tasks: snapshot.tasks,
    trades: snapshot.trades,
    spots: snapshot.spots,
    symbolOptions: snapshot.symbolOptions,
    assetTypeBySymbol: snapshot.assetTypeBySymbol,
    screenshotTimeframes: snapshot.screenshotTimeframes,
    customEmotionOptions: snapshot.customEmotionOptions,
    customRuleViolationOptions: snapshot.customRuleViolationOptions,
    customStrategyOptions: snapshot.customStrategyOptions,
    categorySettings: snapshot.categorySettings,
    disciplineScoreSettings: snapshot.disciplineScoreSettings,
    accountValueResets: snapshot.accountValueResets,
    notifications: snapshot.notifications,
    journals: snapshot.journals,
    exportEmail: snapshot.exportEmail,
  });
}

function compareTimeframes(a: string, b: string) {
  return timeframeToMinutes(a) - timeframeToMinutes(b);
}

function timeframeToMinutes(value: string) {
  const match = value.match(/^(\d+)([mMhHdD])$/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === 'm') return amount;
  if (unit === 'h') return amount * 60;
  return amount * 60 * 24;
}
