import type { AccountValueMode, AccountValueReset } from '../data/journal-repository';
import type { SpotPosition, Trade, TradeMode } from '@/models/journal';
import { getClosedTradePnl, getTradeCloseDate, normalizeTradeMode } from './trade-values';

export type AccountValuePoint = AccountValueReset & {
  livePnl: number;
  resetValue: number;
};

export function getSortedAccountValueHistory(history: AccountValueReset[], mode?: AccountValueMode) {
  const filtered = [...history].filter((item) => Number.isFinite(item.value) && (!mode || getResetMode(item) === mode));
  const initial = getInitialAccountValueRecord(filtered);
  if (!initial) return [];

  return [
    initial,
    ...filtered
      .filter((item) => item.id !== initial.id)
      .filter((item) => Boolean(item.date))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id)),
  ];
}

export function getAccountValueForDate(history: AccountValueReset[], entriesOrDate: Trade[] | SpotPosition[] | string = [], date?: string, mode: AccountValueMode = 'live'): AccountValuePoint | undefined {
  const entries = Array.isArray(entriesOrDate) ? entriesOrDate : [];
  const trades = mode === 'spot' ? [] : entries as Trade[];
  const spots = mode === 'spot' ? entries as SpotPosition[] : [];
  const requestedDate = typeof entriesOrDate === 'string' ? entriesOrDate : date;
  const sorted = getSortedAccountValueHistory(history, mode);
  if (!sorted.length) return undefined;
  const initial = sorted[0];
  const targetDate = requestedDate ?? getLatestAccountValueDate(sorted, trades, spots, mode);
  const datedReset = getDatedResets(sorted).filter((item) => item.date <= targetDate).at(-1);
  const reset = datedReset ?? initial;
  const isInitialFallback = reset.id === initial.id;
  const livePnl = isInitialFallback
    ? getCumulativeModePnlFromJournalStart(trades, spots, targetDate, mode)
    : getCumulativeModePnlAfterReset(trades, spots, reset.date, targetDate, mode);

  return {
    ...reset,
    resetValue: reset.value,
    livePnl,
    value: reset.value + livePnl,
  };
}

export function getAccountValueAtStartOfDate(history: AccountValueReset[], entries: Trade[] | SpotPosition[] = [], date: string, mode: AccountValueMode = 'live') {
  const trades = mode === 'spot' ? [] : entries as Trade[];
  const spots = mode === 'spot' ? entries as SpotPosition[] : [];
  const sorted = getSortedAccountValueHistory(history, mode);
  if (!sorted.length) return undefined;
  const initial = sorted[0];
  const datedReset = getDatedResets(sorted).filter((item) => item.date <= date).at(-1);
  const reset = datedReset ?? initial;
  const previousDate = getPreviousDateKey(date);
  const isInitialFallback = reset.id === initial.id;
  const livePnl = isInitialFallback
    ? getCumulativeModePnlFromJournalStart(trades, spots, previousDate, mode)
    : previousDate >= reset.date
      ? getCumulativeModePnlAfterReset(trades, spots, reset.date, previousDate, mode)
      : 0;

  return {
    ...reset,
    resetValue: reset.value,
    livePnl,
    value: reset.value + livePnl,
  };
}

export function getLivePnlForDate(trades: Trade[], date: string, mode: TradeMode = 'live') {
  return getModePnlBetweenDates(trades, date, date, mode);
}

export function getLivePnlBetweenDates(trades: Trade[], startDate: string, endDate: string) {
  return getModePnlBetweenDates(trades, startDate, endDate, 'live');
}

export function getModePnlBetweenDates(trades: Trade[], startDate: string, endDate: string, mode: TradeMode = 'live') {
  if (!startDate || !endDate) return 0;

  return trades.reduce((sum, trade) => {
    const tradeDate = getTradeCloseDate(trade);
    const pnl = getClosedTradePnl(trade);

    if (
      normalizeTradeMode(trade.mode) !== mode ||
      pnl === undefined ||
      !tradeDate ||
      tradeDate < startDate ||
      tradeDate > endDate
    ) {
      return sum;
    }

    return sum + pnl;
  }, 0);
}

export function getSpotPnlBetweenDates(spots: SpotPosition[], startDate: string, endDate: string) {
  if (!startDate || !endDate) return 0;

  return spots.reduce(
    (sum, spot) =>
      sum + spot.sells.reduce((sellSum, sell) => {
        if (!sell.sellDate || sell.sellDate < startDate || sell.sellDate > endDate || !Number.isFinite(sell.netPnl)) {
          return sellSum;
        }

        return sellSum + sell.netPnl;
      }, 0),
    0,
  );
}

export function getAccountValueTimeline(history: AccountValueReset[], entries: Trade[] | SpotPosition[] = [], mode: AccountValueMode = 'live') {
  const dates = new Set<string>();
  getSortedAccountValueHistory(history, mode).forEach((item) => {
    if (item.date) dates.add(item.date);
  });
  if (mode === 'spot') {
    (entries as SpotPosition[]).forEach((spot) => spot.sells.forEach((sell) => {
      if (sell.sellDate) dates.add(sell.sellDate);
    }));
  } else {
    (entries as Trade[]).forEach((trade) => {
      const date = getTradeCloseDate(trade);
      if (date && normalizeTradeMode(trade.mode) === mode) dates.add(date);
    });
  }

  return Array.from(dates)
    .sort()
    .map((date) => {
      const value = getAccountValueForDate(history, entries, date, mode)?.value;
      return value === undefined ? undefined : { date, value };
    })
    .filter((point): point is { date: string; value: number } => Boolean(point));
}

export function getStartingAccountValue(history: AccountValueReset[], mode: AccountValueMode = 'live') {
  return getSortedAccountValueHistory(history, mode)[0];
}

export function getCurrentAccountValue(history: AccountValueReset[], entries: Trade[] | SpotPosition[] = [], mode: AccountValueMode = 'live') {
  return getCurrentTradingAccountValue(history, entries, mode);
}

export function getCurrentTradingAccountValue(history: AccountValueReset[], entries: Trade[] | SpotPosition[], mode: AccountValueMode = 'live') {
  return getAccountValueForDate(history, entries, undefined, mode);
}

export function formatAccountValue(value?: number) {
  return value === undefined ? '-' : `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatSignedMoney(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatMoney(value?: number) {
  return formatAccountValue(value);
}

export function formatPercentValue(value?: number, options: { alreadyRatio?: boolean } = {}) {
  if (value === undefined || !Number.isFinite(value)) return '-';
  const percent = options.alreadyRatio ? value * 100 : value;
  return `${Number.isInteger(percent) ? String(percent) : percent.toFixed(1)}%`;
}

function getCumulativeModePnlAfterReset(trades: Trade[], spots: SpotPosition[], resetDate: string, targetDate: string, mode: AccountValueMode) {
  return mode === 'spot' ? getSpotPnlBetweenDates(spots, resetDate, targetDate) : getModePnlBetweenDates(trades, resetDate, targetDate, mode);
}

function getCumulativeModePnlFromJournalStart(trades: Trade[], spots: SpotPosition[], targetDate: string, mode: AccountValueMode) {
  if (!targetDate) return 0;
  if (mode === 'spot') return getSpotPnlBetweenDates(spots, '0000-01-01', targetDate);

  return trades.reduce((sum, trade) => {
    const tradeDate = getTradeCloseDate(trade);
    const pnl = getClosedTradePnl(trade);

    if (normalizeTradeMode(trade.mode) !== mode || pnl === undefined || !tradeDate || tradeDate > targetDate) {
      return sum;
    }

    return sum + pnl;
  }, 0);
}

function getLatestAccountValueDate(history: AccountValueReset[], trades: Trade[], spots: SpotPosition[], mode: AccountValueMode) {
  if (mode === 'spot') {
    const latestSpotDate = spots.flatMap((spot) => spot.sells.map((sell) => sell.sellDate).filter(Boolean)).sort().at(-1);
    return [getDatedResets(history).at(-1)?.date, latestSpotDate, history.at(0)?.date].filter(Boolean).sort().at(-1) ?? '';
  }

  const latestTradeDate = trades
    .filter((trade) => normalizeTradeMode(trade.mode) === mode && trade.status === 'closed')
    .map(getTradeCloseDate)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);

  return [getDatedResets(history).at(-1)?.date, latestTradeDate, history.at(0)?.date].filter(Boolean).sort().at(-1) ?? '';
}

function getResetMode(reset: AccountValueReset): AccountValueMode {
  return reset.mode === 'spot' ? 'spot' : normalizeTradeMode(reset.mode);
}

function getPreviousDateKey(date: string) {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setDate(parsed.getDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

function getDatedResets(history: AccountValueReset[]) {
  return history.slice(1).filter((item) => Boolean(item.date));
}

function getInitialAccountValueRecord(history: AccountValueReset[]) {
  return [...history].sort((a, b) => compareInitialAccountValueRecords(a, b))[0];
}

function compareInitialAccountValueRecords(a: AccountValueReset, b: AccountValueReset) {
  if (a.createdAt && b.createdAt) return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  if (a.createdAt && !b.createdAt) return 1;
  if (!a.createdAt && b.createdAt) return -1;
  return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}
