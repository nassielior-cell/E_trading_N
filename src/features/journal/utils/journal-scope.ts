import type { JournalType, Trade, TradeMode } from '@/models/journal';

export const journalTypes: JournalType[] = ['liveOnly', 'backtestingOnly', 'spotOnly', 'combined'];

export function normalizeJournalType(value: unknown): JournalType {
  return value === 'liveOnly' || value === 'backtestingOnly' || value === 'spotOnly' ? value : 'combined';
}

export function getAllowedTradeModes(journalType: JournalType): TradeMode[] {
  if (journalType === 'spotOnly') return [];
  if (journalType === 'liveOnly') return ['live'];
  if (journalType === 'backtestingOnly') return ['backtesting'];
  return ['live', 'backtesting'];
}

export function getPrimaryTradeMode(journalType: JournalType): TradeMode {
  return journalType === 'backtestingOnly' ? 'backtesting' : 'live';
}

export function isSpotAllowed(journalType: JournalType) {
  return journalType === 'spotOnly' || journalType === 'combined';
}

export function isTradeModeAllowed(journalType: JournalType, mode: TradeMode) {
  return getAllowedTradeModes(journalType).includes(mode);
}

export function filterTradesForJournalType<T extends Pick<Trade, 'mode'>>(trades: T[], journalType: JournalType): T[] {
  const allowedModes = getAllowedTradeModes(journalType);
  return trades.filter((trade) => allowedModes.includes(trade.mode));
}

export function getJournalTypeLabel(journalType: JournalType, isHebrew: boolean) {
  if (journalType === 'liveOnly') return isHebrew ? 'פיוצרס בלבד' : 'Futures Only';
  if (journalType === 'backtestingOnly') return isHebrew ? 'בק-טסטינג בלבד' : 'Backtesting Only';
  if (journalType === 'spotOnly') return isHebrew ? 'ספוט בלבד' : 'Spot Only';
  return isHebrew ? 'משולב' : 'Combined';
}
