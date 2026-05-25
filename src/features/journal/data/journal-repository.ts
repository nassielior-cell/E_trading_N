import type { AssetType, Category, Day, DayMetadata, JournalNotification, JournalType, RuleAdherence, SpotPosition, SpotStatus, Task, Trade, TradeMode } from '@/models/journal';

import { categories, defaultAssetTypeBySymbol, defaultScreenshotTimeframes, defaultSymbolOptions } from '../config/journal-options';
import { localStorageAdapter, type StorageAdapter } from './storage-adapter';
import { normalizeAssetName, normalizeAssetType, normalizeDateKey, normalizeTradeMode } from '../utils/trade-values';
import { normalizeJournalType } from '../utils/journal-scope';

const journalStorageKey = 'e_trading_n:v1:journal';

export type DisciplineScoreSettings = {
  adherenceDeductions: Record<RuleAdherence, number>;
  negativeEmotionDeduction: number;
  negativeEmotions: string[];
  ruleViolationDeduction: number;
};

export type AccountValueMode = TradeMode | 'spot';

export type AccountValueReset = {
  id: string;
  date: string;
  value: number;
  mode: AccountValueMode;
  note?: string;
  createdAt?: string;
};

export type JournalSummary = {
  workspaceId: string;
  name: string;
  savedAt: string;
  journalType?: JournalType;
};

export type JournalSnapshot = {
  version: 1;
  savedAt: string;
  journalName: string;
  journalType: JournalType;
  workspaceId: string;
  days: Record<string, Day>;
  tasks: Record<string, Task>;
  trades: Record<string, Trade>;
  spots: Record<string, SpotPosition>;
  symbolOptions: string[];
  assetTypeBySymbol: Record<string, AssetType>;
  screenshotTimeframes: string[];
  customEmotionOptions: string[];
  customRuleViolationOptions: string[];
  customStrategyOptions: string[];
  categorySettings: Record<string, Pick<Category, 'id' | 'labelKey' | 'type' | 'color' | 'isCustom'>>;
  disciplineScoreSettings: DisciplineScoreSettings;
  accountValueResets: AccountValueReset[];
  notifications: JournalNotification[];
  journals: JournalSummary[];
  exportEmail?: string;
};

export const defaultDisciplineScoreSettings: DisciplineScoreSettings = {
  adherenceDeductions: {
    followed: 0,
    partial: 10,
    broken: 15,
    not_applicable: 0,
  },
  negativeEmotionDeduction: 5,
  negativeEmotions: ['stressed', 'frustrated', 'greedy', 'fearful', 'tired'],
  ruleViolationDeduction: 10,
};

export const createDefaultJournalSnapshot = (): JournalSnapshot => ({
  version: 1,
  savedAt: new Date().toISOString(),
  journalName: 'E_trading_N Journal',
  journalType: 'combined',
  workspaceId: 'personal-journal',
  days: {},
  tasks: {},
  trades: {},
  spots: {},
  symbolOptions: defaultSymbolOptions,
  assetTypeBySymbol: defaultAssetTypeBySymbol,
  screenshotTimeframes: defaultScreenshotTimeframes,
  customEmotionOptions: [],
  customRuleViolationOptions: [],
  customStrategyOptions: [],
  categorySettings: Object.fromEntries(
    categories.map((category) => [
      category.id,
      {
        id: category.id,
        labelKey: category.labelKey,
        type: category.type,
        color: category.color,
        isCustom: category.isCustom,
      },
    ]),
  ),
  disciplineScoreSettings: defaultDisciplineScoreSettings,
  accountValueResets: [],
  notifications: [],
  journals: [{ workspaceId: 'personal-journal', name: 'E_trading_N Journal', savedAt: new Date().toISOString() }],
  exportEmail: '',
});

export type JournalRepository = {
  load: () => JournalSnapshot;
  save: (snapshot: JournalSnapshot) => void;
  clear: () => void;
  exportJson: (snapshot: JournalSnapshot) => string;
  importJson: (json: string) => JournalSnapshot;
};

export const createJournalRepository = (storage: StorageAdapter = localStorageAdapter): JournalRepository => ({
  load: () => {
    const raw = storage.getItem(journalStorageKey);
    if (!raw) return createDefaultJournalSnapshot();

    try {
      return normalizeJournalSnapshot(JSON.parse(raw));
    } catch {
      return createDefaultJournalSnapshot();
    }
  },
  save: (snapshot) => {
    storage.setItem(journalStorageKey, JSON.stringify({ ...normalizeJournalSnapshot(snapshot), savedAt: new Date().toISOString() }));
  },
  clear: () => {
    storage.removeItem(journalStorageKey);
  },
  exportJson: (snapshot) => JSON.stringify({ ...normalizeJournalSnapshot(snapshot), savedAt: new Date().toISOString() }, null, 2),
  importJson: (json) => {
    const snapshot = normalizeJournalSnapshot(JSON.parse(json));
    storage.setItem(journalStorageKey, JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() }));
    return snapshot;
  },
});

export const journalRepository = createJournalRepository();

export function normalizeJournalSnapshot(value: Partial<JournalSnapshot>): JournalSnapshot {
  const defaults = createDefaultJournalSnapshot();
  const rawDays = isRecord(value.days) ? value.days : defaults.days;
  const rawTasks = isRecord(value.tasks) ? value.tasks : defaults.tasks;
  const rawTrades = isRecord(value.trades) ? value.trades : defaults.trades;
  const rawSpots = isRecord(value.spots) ? value.spots : defaults.spots;

  return {
    version: 1,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : defaults.savedAt,
    journalName: typeof value.journalName === 'string' && value.journalName.trim() ? value.journalName : defaults.journalName,
    journalType: normalizeJournalType(value.journalType),
    workspaceId: typeof value.workspaceId === 'string' && value.workspaceId.trim() ? value.workspaceId : defaults.workspaceId,
    days: normalizeDays(rawDays as Record<string, Day>),
    tasks: normalizeTasks(rawTasks as Record<string, Task>),
    trades: normalizeTrades(rawTrades as Record<string, Trade>),
    spots: normalizeSpots(rawSpots as Record<string, SpotPosition>),
    symbolOptions: value.symbolOptions?.length ? value.symbolOptions : defaults.symbolOptions,
    assetTypeBySymbol: normalizeAssetTypeBySymbol(value.assetTypeBySymbol, value.symbolOptions?.length ? value.symbolOptions : defaults.symbolOptions),
    screenshotTimeframes: value.screenshotTimeframes?.length ? value.screenshotTimeframes : defaults.screenshotTimeframes,
    customEmotionOptions: value.customEmotionOptions ?? defaults.customEmotionOptions,
    customRuleViolationOptions: value.customRuleViolationOptions ?? defaults.customRuleViolationOptions,
    customStrategyOptions: value.customStrategyOptions ?? defaults.customStrategyOptions,
    categorySettings: value.categorySettings ?? defaults.categorySettings,
    disciplineScoreSettings: {
      ...defaults.disciplineScoreSettings,
      ...value.disciplineScoreSettings,
      adherenceDeductions: {
        ...defaults.disciplineScoreSettings.adherenceDeductions,
        ...value.disciplineScoreSettings?.adherenceDeductions,
      },
      negativeEmotions: value.disciplineScoreSettings?.negativeEmotions?.length
        ? value.disciplineScoreSettings.negativeEmotions
        : defaults.disciplineScoreSettings.negativeEmotions,
    },
    accountValueResets: Array.isArray(value.accountValueResets) ? value.accountValueResets.filter(isAccountValueReset).map(normalizeAccountValueReset) : defaults.accountValueResets,
    notifications: Array.isArray(value.notifications) ? value.notifications.filter(isRecord) as JournalNotification[] : defaults.notifications,
    journals: Array.isArray(value.journals) && value.journals.length ? value.journals.filter(isJournalSummary).map((journal) => ({
      ...journal,
      journalType: normalizeJournalType(journal.journalType),
    })) : [{
      workspaceId: typeof value.workspaceId === 'string' && value.workspaceId.trim() ? value.workspaceId : defaults.workspaceId,
      name: typeof value.journalName === 'string' && value.journalName.trim() ? value.journalName : defaults.journalName,
      savedAt: typeof value.savedAt === 'string' ? value.savedAt : defaults.savedAt,
      journalType: normalizeJournalType(value.journalType),
    }],
    exportEmail: typeof value.exportEmail === 'string' ? value.exportEmail : '',
  };
}

function normalizeDays(days: Record<string, Day>) {
  return Object.fromEntries(
    Object.entries(days).filter(([, day]) => isRecord(day) && typeof day.date === 'string').map(([dayId, day]) => [
      dayId,
      {
        ...day,
        id: typeof day.id === 'string' ? day.id : dayId,
        taskIds: Array.isArray(day.taskIds) ? day.taskIds.filter((item): item is string => typeof item === 'string') : [],
        tradeIds: Array.isArray(day.tradeIds) ? day.tradeIds.filter((item): item is string => typeof item === 'string') : [],
        spotIds: Array.isArray(day.spotIds) ? day.spotIds.filter((item): item is string => typeof item === 'string') : [],
        metadata: isRecord(day.metadata) ? (day.metadata as DayMetadata) : createEmptyDayMetadata(),
      },
    ]),
  );
}

function createEmptyDayMetadata(): DayMetadata {
  return {
    tradeCount: 0,
    taskCount: 0,
    spotCount: 0,
    openSpotCount: 0,
    closedSpotCount: 0,
    winCount: 0,
    lossCount: 0,
    breakevenCount: 0,
    liveTradeCount: 0,
    backtestingTradeCount: 0,
    reviewTradeCount: 0,
    result: 'neutral',
    categoryIds: [],
  };
}

function normalizeSpots(spots: Record<string, SpotPosition>) {
  return Object.fromEntries(
    Object.entries(spots).filter(([, spot]) => isRecord(spot)).map(([spotId, spot]) => {
      const quantityBought = Number.isFinite(spot.quantityBought) ? spot.quantityBought : 0;
      const buyPrice = Number.isFinite(spot.buyPrice) ? spot.buyPrice : 0;
      const expectedBuyCost = buyPrice * quantityBought;
      const actualAmountPaid = expectedBuyCost;
      const sells = (Array.isArray(spot.sells) ? spot.sells : []).filter(isRecord).map((sell, index) => {
        const quantitySold = Number.isFinite(sell.quantitySold) ? sell.quantitySold : 0;
        const sellPrice = Number.isFinite(sell.sellPrice) ? sell.sellPrice : 0;
        const expectedSellValue = sellPrice * quantitySold;
        const actualAmountReceived = Number.isFinite(sell.actualAmountReceived) ? sell.actualAmountReceived : expectedSellValue;
        const costBasisSold = quantityBought > 0 ? (quantitySold / quantityBought) * expectedBuyCost : 0;
        const netPnl = actualAmountReceived - costBasisSold;

        return {
          ...sell,
          id: typeof sell.id === 'string' ? sell.id : `${spotId}_sell_${index}`,
          sellDate: normalizeDateKey(sell.sellDate) ?? '',
          sellPrice,
          quantitySold,
          actualAmountReceived,
          expectedSellValue,
          sellFeesSlippage: expectedSellValue - actualAmountReceived,
          costBasisSold,
          netPnl,
          screenshots: (Array.isArray(sell.screenshots) ? sell.screenshots : []).filter(isRecord) as SpotPosition['screenshots'],
        };
      });
      const quantitySold = sells.length
        ? sells.reduce((sum, sell) => sum + sell.quantitySold, 0)
        : Number.isFinite(spot.quantitySold) ? spot.quantitySold : 0;
      const remainingQuantity = Math.max(0, quantityBought - quantitySold);
      const realizedPnl = sells.length
        ? sells.reduce((sum, sell) => sum + sell.netPnl, 0)
        : Number.isFinite(spot.realizedPnl) ? spot.realizedPnl : 0;
      const status: SpotStatus = remainingQuantity <= 0 && quantityBought > 0 ? 'closed' : quantitySold > 0 ? 'partially_sold' : 'open';

      return [
        spotId,
        {
          ...spot,
          id: typeof spot.id === 'string' ? spot.id : spotId,
          assetName: normalizeAssetName(spot.assetName),
          assetType: normalizeAssetType(spot.assetType, spot.assetName),
          buyDate: normalizeDateKey(spot.buyDate) ?? '',
          buyPrice,
          quantityBought,
          actualAmountPaid,
          currentPortfolioValue: Number.isFinite(spot.currentPortfolioValue) ? spot.currentPortfolioValue : undefined,
          expectedBuyCost,
          buyFeesSlippage: 0,
          sells,
          screenshots: (Array.isArray(spot.screenshots) ? spot.screenshots : []).filter(isRecord) as SpotPosition['screenshots'],
          quantitySold,
          remainingQuantity,
          realizedPnl,
          status,
        },
      ];
    }),
  );
}

function normalizeTasks(tasks: Record<string, Task>) {
  return Object.fromEntries(
    Object.entries(tasks).filter(([, task]) => isRecord(task) && typeof task.id === 'string').map(([taskId, task]) => [
      taskId,
      task,
    ]),
  );
}

function normalizeAssetTypeBySymbol(value: Partial<Record<string, AssetType>> | undefined, symbols: string[]) {
  return Object.fromEntries(
    symbols.map((symbol) => {
      const normalized = symbol.toUpperCase();
      const existing = value?.[normalized] ?? value?.[symbol];
      return [normalized, normalizeAssetType(existing, normalized)];
    }),
  );
}

function normalizeTrades(trades: Record<string, Trade>) {
  return Object.fromEntries(
    Object.entries(trades).filter(([, trade]) => isRecord(trade)).map(([tradeId, trade]) => {
      const assetName = normalizeAssetName(trade.assetName ?? trade.coin);
      const numericPnl = Number.isFinite(trade.numericPnl) ? trade.numericPnl : Number.isFinite(trade.pnl) ? trade.pnl : 0;
      const closeDate = normalizeDateKey(trade.closeDate ?? trade.exitDate);

      return [
        tradeId,
        {
        ...trade,
        mode: normalizeTradeMode(trade.mode),
        pnl: numericPnl,
        numericPnl,
        pnlInput: Number.isFinite(trade.pnlInput) ? trade.pnlInput : Math.abs(numericPnl),
        coin: assetName,
        assetName,
        assetType: normalizeAssetType(trade.assetType, assetName),
        entryDate: normalizeDateKey(trade.entryDate) ?? '',
        exitDate: closeDate,
        closeDate,
        screenshots: (Array.isArray(trade.screenshots) ? trade.screenshots : []).filter(isRecord).map((screenshot, index) => {
          const slotType = screenshot.slotType ?? (screenshot.id as Trade['screenshots'][number]['slotType']);

          return {
            ...screenshot,
            id: screenshot.id || `${tradeId}_${slotType}_${index}`,
            tradeId: screenshot.tradeId ?? tradeId,
            slotType,
            order: screenshot.order ?? index,
            uploadPlaceholder: screenshot.uploadPlaceholder ?? 'pending',
            aiAnalysisStatus: screenshot.aiAnalysisStatus ?? 'not_started',
          };
        }),
      },
      ];
    }),
  );
}

function isAccountValueReset(value: unknown): value is AccountValueReset {
  return isRecord(value) && typeof value.id === 'string' && typeof value.date === 'string' && Number.isFinite(value.value);
}

function normalizeAccountValueReset(value: AccountValueReset) {
  return {
    ...value,
    date: normalizeDateKey(value.date) ?? value.date,
    mode: normalizeAccountValueMode(value.mode),
  };
}

function normalizeAccountValueMode(value: unknown): AccountValueMode {
  return value === 'spot' ? 'spot' : normalizeTradeMode(value);
}

function isJournalSummary(value: unknown): value is JournalSummary {
  return isRecord(value) &&
    typeof value.workspaceId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.savedAt === 'string' &&
    value.isDeleted !== true &&
    !value.deletedAt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
