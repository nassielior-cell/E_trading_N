import type { AssetType, Trade, TradeMode } from '@/models/journal';
import type { TranslationKey } from '@/lib/i18n/translations';

export type TradeModeFilter = TradeMode | 'all';
export type AssetTypeFilter = AssetType | 'all';

export const tradeModes: TradeMode[] = ['live', 'backtesting'];

export function normalizeTradeMode(value: unknown): TradeMode {
  return value === 'backtesting' || value === 'simulation' ? value : 'live';
}

export function normalizeAssetType(value: unknown, assetName = ''): AssetType {
  if (value === 'crypto' || value === 'stock' || value === 'forex') return value;
  return inferAssetType(assetName);
}

export function normalizeAssetName(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

export function normalizeDateKey(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const directMatch = value.trim().match(/^\d{4}-\d{2}-\d{2}/);
  if (directMatch) return directMatch[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

export function isSameDate(a: unknown, b: unknown) {
  const aKey = normalizeDateKey(a);
  const bKey = normalizeDateKey(b);
  return Boolean(aKey && bKey && aKey === bKey);
}

export function isOnOrAfterDate(selectedDate: unknown, openDate: unknown) {
  const selectedDateKey = normalizeDateKey(selectedDate);
  const openDateKey = normalizeDateKey(openDate);
  return Boolean(selectedDateKey && openDateKey && selectedDateKey >= openDateKey);
}

export function getTradeAssetName(trade: Trade) {
  return normalizeAssetName(trade.assetName ?? trade.coin);
}

export function getTradeAssetType(trade: Trade) {
  return normalizeAssetType(trade.assetType, getTradeAssetName(trade));
}

export function getClosedTradePnl(trade: Trade) {
  if (trade.status !== 'closed') return undefined;
  const value = Number.isFinite(trade.numericPnl) ? trade.numericPnl : trade.pnl;
  return Number.isFinite(value) ? value : undefined;
}

export function getTradeCloseDate(trade: Trade) {
  if (trade.status !== 'closed') return undefined;
  return normalizeDateKey(trade.closeDate ?? trade.exitDate);
}

export function isTradeInMode(trade: Trade, mode: TradeModeFilter) {
  return mode === 'all' || normalizeTradeMode(trade.mode) === mode;
}

export function getModeLabelKey(mode: TradeModeFilter): TranslationKey {
  if (mode === 'all') return 'all';
  if (mode === 'live') return 'liveTrade';
  return 'backtesting';
}

export function inferAssetType(assetName: string): AssetType {
  const normalized = normalizeAssetName(assetName);
  if (normalized.includes('USDT') || normalized.includes('BTC') || normalized.includes('ETH')) return 'crypto';
  if (normalized.includes('USD') || normalized.includes('EUR') || normalized.includes('JPY') || normalized.includes('GBP')) return 'forex';
  return 'stock';
}
