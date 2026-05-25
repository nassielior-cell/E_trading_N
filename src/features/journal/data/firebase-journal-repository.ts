import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '@/lib/firebase';
import type { Day, SpotPosition, Task, Trade } from '@/models/journal';

import {
  createDefaultJournalSnapshot,
  normalizeJournalSnapshot,
  type JournalSnapshot,
  type JournalSummary,
} from './journal-repository';
import { normalizeJournalType } from '../utils/journal-scope';

const defaultJournalId = 'personal-journal';
const logPrefix = '[firebase-journal-sync]';

type EntryDocument =
  | {
      entryType: 'task';
      data: Task;
      updatedAt?: string;
    }
  | {
      entryType: 'trade';
      data: Trade;
      updatedAt?: string;
    }
  | {
      entryType: 'spot';
      data: SpotPosition;
      updatedAt?: string;
    };

type ActiveContext = {
  userId?: string;
  journalId: string;
};

export type FirebaseJournalRepository = {
  isConfigured: boolean;
  workspaceId: string;
  userId?: string;
  paths: {
    workspace: string;
    entries: string;
    journalSettings: string;
    appSettings: string;
    presets: string;
    accountValueResets: string;
    notifications: string;
  };
  setUser: (userId: string) => void;
  clearUser: () => void;
  setActiveJournal: (journalId: string) => void;
  listJournals: () => Promise<JournalSummary[]>;
  deleteJournal: (journalId?: string) => Promise<JournalSummary[]>;
  load: (journalId?: string) => Promise<JournalSnapshot | null>;
  save: (snapshot: JournalSnapshot) => Promise<void>;
  subscribe: (onChange: (snapshot: JournalSnapshot) => void, onError?: (error: Error) => void) => Unsubscribe;
};

const context: ActiveContext = {
  journalId: defaultJournalId,
};

export const firebaseJournalRepository: FirebaseJournalRepository = {
  isConfigured: isFirebaseConfigured,
  workspaceId: defaultJournalId,
  userId: undefined,
  paths: buildPaths(undefined, defaultJournalId),
  setUser: (userId) => {
    context.userId = userId;
    firebaseJournalRepository.userId = userId;
    firebaseJournalRepository.paths = buildPaths(userId, context.journalId);
  },
  clearUser: () => {
    context.userId = undefined;
    firebaseJournalRepository.userId = undefined;
    firebaseJournalRepository.paths = buildPaths(undefined, context.journalId);
  },
  setActiveJournal: (journalId) => {
    context.journalId = journalId || defaultJournalId;
    firebaseJournalRepository.workspaceId = context.journalId;
    firebaseJournalRepository.paths = buildPaths(context.userId, context.journalId);
  },
  listJournals,
  deleteJournal: deleteFirebaseJournal,
  load: loadFirebaseSnapshot,
  save: saveFirebaseSnapshot,
  subscribe: subscribeFirebaseSnapshot,
};

async function listJournals() {
  if (!firestore || !context.userId) return [];

  const journalsRef = collection(firestore, 'users', context.userId, 'journals');
  const snapshot = await getDocs(journalsRef);

  return snapshot.docs
    .filter((journalDoc) => {
      const data = journalDoc.data();
      return data.isDeleted !== true && !data.deletedAt;
    })
    .map((journalDoc) => {
      const data = journalDoc.data();
      return {
        workspaceId: journalDoc.id,
        name: typeof data.name === 'string' && data.name.trim() ? data.name : 'E_trading_N Journal',
        savedAt:
          typeof data.updatedAt === 'string'
            ? data.updatedAt
            : typeof data.savedAt === 'string'
              ? data.savedAt
            : new Date(0).toISOString(),
        journalType: normalizeJournalType(data.journalType ?? (isRecord(data.settings) ? data.settings.journalType : undefined)),
      };
    })
    .filter((journal) => isValidJournalId(journal.workspaceId))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

async function loadFirebaseSnapshot(journalId = context.journalId) {
  if (!firestore || !context.userId) {
    console.info(logPrefix, 'load skipped: Firestore/Auth is not configured');
    return null;
  }

  if (!isValidJournalId(journalId)) {
    throw new Error(`Invalid journal id: ${journalId}`);
  }

  const journalRef = getJournalRef(context.userId, journalId);
  console.info(logPrefix, 'load start', {
    userId: context.userId,
    journalId,
    journalPath: journalRef.path,
  });
  const journalDoc = await getDoc(journalRef);

  if (!journalDoc.exists()) {
    console.info(logPrefix, 'load success: journal document does not exist', {
      userId: context.userId,
      journalId,
      journalPath: journalRef.path,
    });
    return null;
  }

  const journalData = journalDoc.data();
  if (journalData.isDeleted === true || journalData.deletedAt) {
    console.info(logPrefix, 'load success: journal document is deleted', {
      userId: context.userId,
      journalId,
      journalPath: journalRef.path,
    });
    return null;
  }

  const entriesRef = collection(journalRef, 'entries');
  const entriesSnapshot = await getDocs(entriesRef);
  const snapshot = buildSnapshotFromFirebase(
    journalId,
    journalData,
    entriesSnapshot.docs.map((entryDoc) => entryDoc.data()).filter(isEntryDocument),
  );

  console.info(logPrefix, 'load success', {
    userId: context.userId,
    journalId,
    journalPath: journalRef.path,
    entriesPath: entriesRef.path,
    tasks: Object.keys(snapshot.tasks).length,
    trades: Object.keys(snapshot.trades).length,
    spots: Object.keys(snapshot.spots).length,
    days: Object.keys(snapshot.days).length,
  });

  return snapshot;
}

async function saveFirebaseSnapshot(snapshot: JournalSnapshot) {
  if (!firestore || !context.userId) {
    console.info(logPrefix, 'write skipped: Firestore/Auth is not configured');
    return;
  }

  const journalId = snapshot.workspaceId || context.journalId || defaultJournalId;
  const journalRef = getJournalRef(context.userId, journalId);
  const entriesRef = collection(journalRef, 'entries');
  const existingEntries = await getDocs(entriesRef);
  const batch = writeBatch(firestore);
  const savedAt = new Date().toISOString();

  console.info(logPrefix, 'write start', {
    userId: context.userId,
    journalId,
    journalPath: journalRef.path,
    entriesPath: entriesRef.path,
    tasks: Object.keys(snapshot.tasks).length,
    trades: Object.keys(snapshot.trades).length,
    spots: Object.keys(snapshot.spots).length,
    days: Object.keys(snapshot.days).length,
  });

  batch.set(doc(firestore, 'users', context.userId), removeUndefined({
    id: context.userId,
    updatedAt: savedAt,
  }), { merge: true });

  batch.set(journalRef, removeUndefined({
    id: journalId,
    name: snapshot.journalName,
    journalType: snapshot.journalType,
    ownerId: context.userId,
    createdAt: snapshot.savedAt,
    updatedAt: savedAt,
    savedAt,
    settings: {
      version: snapshot.version,
      journalType: snapshot.journalType,
      days: snapshot.days,
      categorySettings: snapshot.categorySettings,
      disciplineScoreSettings: snapshot.disciplineScoreSettings,
      exportEmail: snapshot.exportEmail ?? '',
    },
    presets: {
      symbolOptions: snapshot.symbolOptions,
      assetTypeBySymbol: snapshot.assetTypeBySymbol,
      screenshotTimeframes: snapshot.screenshotTimeframes,
      customEmotionOptions: snapshot.customEmotionOptions,
      customRuleViolationOptions: snapshot.customRuleViolationOptions,
      customStrategyOptions: snapshot.customStrategyOptions,
    },
    accountValueHistory: snapshot.accountValueResets,
    notifications: snapshot.notifications,
  }), { merge: true });

  existingEntries.docs.forEach((entryDoc) => {
    batch.delete(entryDoc.ref);
  });

  Object.values(snapshot.tasks).forEach((task) => {
    batch.set(doc(entriesRef, task.id), removeUndefined({ entryType: 'task', data: task, updatedAt: task.updatedAt } satisfies EntryDocument));
  });

  Object.values(snapshot.trades).forEach((trade) => {
    batch.set(doc(entriesRef, trade.id), removeUndefined({ entryType: 'trade', data: trade, updatedAt: trade.updatedAt } satisfies EntryDocument));
  });

  Object.values(snapshot.spots).forEach((spot) => {
    batch.set(doc(entriesRef, spot.id), removeUndefined({ entryType: 'spot', data: spot, updatedAt: spot.updatedAt } satisfies EntryDocument));
  });

  await batch.commit();
  console.info(logPrefix, 'write success', {
    userId: context.userId,
    journalId,
    journalPath: journalRef.path,
    entriesPath: entriesRef.path,
    savedAt,
    writtenEntries: Object.keys(snapshot.tasks).length + Object.keys(snapshot.trades).length + Object.keys(snapshot.spots).length,
    deletedEntries: existingEntries.size,
  });
}

async function deleteFirebaseJournal(journalId = context.journalId) {
  if (!firestore || !context.userId) {
    console.info(logPrefix, 'delete skipped: Firestore/Auth is not configured');
    return [];
  }

  if (!isValidJournalId(journalId)) {
    throw new Error(`Invalid journal id: ${journalId}`);
  }

  const journalRef = getJournalRef(context.userId, journalId);
  const entriesSnapshot = await getDocs(collection(journalRef, 'entries'));
  const batch = writeBatch(firestore);

  console.info(logPrefix, 'delete start', {
    userId: context.userId,
    journalId,
    journalPath: journalRef.path,
    deletedEntries: entriesSnapshot.size,
  });

  entriesSnapshot.docs.forEach((entryDoc) => {
    batch.delete(entryDoc.ref);
  });
  batch.delete(journalRef);

  await batch.commit();
  console.info(logPrefix, 'delete success', { userId: context.userId, journalId });

  return listJournals();
}

function subscribeFirebaseSnapshot(onChange: (snapshot: JournalSnapshot) => void, onError?: (error: Error) => void) {
  if (!firestore || !context.userId) {
    console.info(logPrefix, 'listener skipped: Firestore/Auth is not configured');
    return () => undefined;
  }

  const journalId = context.journalId;
  const journalRef = getJournalRef(context.userId, journalId);
  const entriesRef = collection(journalRef, 'entries');
  console.info(logPrefix, 'listener start', {
    userId: context.userId,
    journalId,
    journalPath: journalRef.path,
    entriesPath: entriesRef.path,
  });

  let journalData: Record<string, unknown> | undefined;
  let entryDocs: EntryDocument[] = [];
  const loaded = {
    journal: false,
    entries: false,
  };

  const emit = () => {
    if (!journalData || !Object.values(loaded).every(Boolean)) return;
    const snapshot = buildSnapshotFromFirebase(journalId, journalData, entryDocs);
    console.info(logPrefix, 'realtime snapshot received', {
      userId: context.userId,
      journalId,
      entriesPath: entriesRef.path,
      tasks: Object.keys(snapshot.tasks).length,
      trades: Object.keys(snapshot.trades).length,
      spots: Object.keys(snapshot.spots).length,
      days: Object.keys(snapshot.days).length,
      savedAt: snapshot.savedAt,
    });
    onChange(snapshot);
  };

  const unsubscribers = [
    onSnapshot(
      journalRef,
      (snapshot) => {
        loaded.journal = true;
        journalData = snapshot.exists() ? snapshot.data() : undefined;
        emit();
      },
      (error) => {
        console.error(logPrefix, 'journal listener error', { path: journalRef.path, error });
        onError?.(error);
      },
    ),
    onSnapshot(
      entriesRef,
      (snapshot) => {
        loaded.entries = true;
        entryDocs = snapshot.docs.map((entryDoc) => entryDoc.data() as EntryDocument);
        emit();
      },
      (error) => {
        console.error(logPrefix, 'entries listener error', { path: entriesRef.path, error });
        onError?.(error);
      },
    ),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

export async function clearFirebaseSnapshot() {
  if (!firestore || !context.userId) return;

  const journalRef = getJournalRef(context.userId, context.journalId);
  const entriesSnapshot = await getDocs(collection(journalRef, 'entries'));

  await Promise.all([
    ...entriesSnapshot.docs.map((entryDoc) => deleteDoc(entryDoc.ref)),
    deleteDoc(journalRef),
  ]);
}

function buildSnapshotFromFirebase(
  journalId: string,
  journalData: Record<string, unknown>,
  entries: EntryDocument[],
): JournalSnapshot {
  const defaults = createDefaultJournalSnapshot();
  const settingsData = isRecord(journalData.settings) ? journalData.settings : {};
  const presetsData = isRecord(journalData.presets) ? journalData.presets : {};
  const tasks: Record<string, Task> = {};
  const trades: Record<string, Trade> = {};
  const spots: Record<string, SpotPosition> = {};

  entries.forEach((entry) => {
    if (entry.entryType === 'task' && isRecord(entry.data) && typeof entry.data.id === 'string') {
      tasks[entry.data.id] = entry.data;
    }

    if (entry.entryType === 'trade' && isRecord(entry.data) && typeof entry.data.id === 'string') {
      trades[entry.data.id] = entry.data;
    }

    if (entry.entryType === 'spot' && isRecord(entry.data) && typeof entry.data.id === 'string') {
      spots[entry.data.id] = entry.data;
    }
  });

  return normalizeJournalSnapshot({
    ...defaults,
    workspaceId: journalId,
    journalName: typeof journalData.name === 'string' ? journalData.name : defaults.journalName,
    journalType: normalizeJournalType(journalData.journalType ?? settingsData.journalType),
    savedAt: typeof journalData.savedAt === 'string' ? journalData.savedAt : defaults.savedAt,
    days: isRecord(settingsData.days) ? (settingsData.days as Record<string, Day>) : defaults.days,
    tasks,
    trades,
    spots,
    symbolOptions: Array.isArray(presetsData.symbolOptions) ? (presetsData.symbolOptions as string[]) : defaults.symbolOptions,
    assetTypeBySymbol: isRecord(presetsData.assetTypeBySymbol)
      ? (presetsData.assetTypeBySymbol as JournalSnapshot['assetTypeBySymbol'])
      : defaults.assetTypeBySymbol,
    screenshotTimeframes: Array.isArray(presetsData.screenshotTimeframes)
      ? (presetsData.screenshotTimeframes as string[])
      : defaults.screenshotTimeframes,
    customEmotionOptions: Array.isArray(presetsData.customEmotionOptions)
      ? (presetsData.customEmotionOptions as string[])
      : defaults.customEmotionOptions,
    customRuleViolationOptions: Array.isArray(presetsData.customRuleViolationOptions)
      ? (presetsData.customRuleViolationOptions as string[])
      : defaults.customRuleViolationOptions,
    customStrategyOptions: Array.isArray(presetsData.customStrategyOptions)
      ? (presetsData.customStrategyOptions as string[])
      : defaults.customStrategyOptions,
    categorySettings: isRecord(settingsData.categorySettings)
      ? (settingsData.categorySettings as JournalSnapshot['categorySettings'])
      : defaults.categorySettings,
    disciplineScoreSettings: isRecord(settingsData.disciplineScoreSettings)
      ? (settingsData.disciplineScoreSettings as JournalSnapshot['disciplineScoreSettings'])
      : defaults.disciplineScoreSettings,
    accountValueResets: Array.isArray(journalData.accountValueHistory)
      ? (journalData.accountValueHistory as JournalSnapshot['accountValueResets'])
      : defaults.accountValueResets,
    notifications: Array.isArray(journalData.notifications)
      ? (journalData.notifications as JournalSnapshot['notifications'])
      : defaults.notifications,
    journals: [{
      workspaceId: journalId,
      name: typeof journalData.name === 'string' ? journalData.name : defaults.journalName,
      savedAt: typeof journalData.updatedAt === 'string' ? journalData.updatedAt : defaults.savedAt,
      journalType: normalizeJournalType(journalData.journalType ?? settingsData.journalType),
    }],
    exportEmail: typeof settingsData.exportEmail === 'string' ? settingsData.exportEmail : '',
  });
}

function getJournalRef(userId: string, journalId: string) {
  return doc(firestore!, 'users', userId, 'journals', journalId || defaultJournalId);
}

function buildPaths(userId: string | undefined, journalId: string) {
  const journalPath = userId ? `users/${userId}/journals/${journalId}` : `users/{userId}/journals/${journalId}`;

  return {
    workspace: journalPath,
    entries: `${journalPath}/entries`,
    journalSettings: `${journalPath}.settings`,
    appSettings: `${journalPath}.settings`,
    presets: `${journalPath}.presets`,
    accountValueResets: `${journalPath}.accountValueHistory`,
    notifications: `${journalPath}.notifications`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isEntryDocument(value: unknown): value is EntryDocument {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  return value.entryType === 'task' || value.entryType === 'trade' || value.entryType === 'spot';
}

function isValidJournalId(value: string) {
  return Boolean(value && !value.includes('/') && value !== '.' && value !== '..');
}

function removeUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
