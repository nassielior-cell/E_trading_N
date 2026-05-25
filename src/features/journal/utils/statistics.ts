import type { Trade } from '@/models/journal';
import { getClosedTradePnl } from './trade-values';

export type TradeStats = {
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  open: number;
  winRate: number;
  totalPnl: number;
  averageRr: number;
  averageDiscipline: number;
  averageDurationMs: number;
};

export function getTradeStats(trades: Trade[]): TradeStats {
  const closedTrades = trades.filter((trade) => trade.status === 'closed');
  const wins = closedTrades.filter((trade) => trade.result === 'win').length;
  const losses = closedTrades.filter((trade) => trade.result === 'loss').length;
  const breakeven = closedTrades.filter((trade) => trade.result === 'breakeven').length;
  const open = trades.filter((trade) => trade.status === 'open').length;
  const totalPnl = trades.reduce((sum, trade) => sum + (getClosedTradePnl(trade) ?? 0), 0);

  return {
    count: trades.length,
    wins,
    losses,
    breakeven,
    open,
    winRate: closedTrades.length ? wins / closedTrades.length : 0,
    totalPnl,
    averageRr: average(trades.map((trade) => trade.rr ?? 0)),
    averageDiscipline: average(trades.map((trade) => trade.disciplineScore)),
    averageDurationMs: average(getClosedTradeDurations(trades)),
  };
}

export function getClosedTradeDurations(trades: Trade[]) {
  return trades
    .filter((trade) => trade.status === 'closed')
    .map(getTradeDurationMs)
    .filter((value): value is number => value !== undefined);
}

export function getTradeDurationMs(trade: Trade) {
  if (!trade.entryDate || !trade.entryTime || !trade.exitDate || !trade.exitTime) {
    return undefined;
  }

  const start = new Date(`${trade.entryDate}T${trade.entryTime}:00`);
  const end = new Date(`${trade.exitDate}T${trade.exitTime}:00`);
  const diffMs = end.getTime() - start.getTime();

  return Number.isFinite(diffMs) && diffMs >= 0 ? diffMs : undefined;
}

export function formatDuration(valueMs: number) {
  if (!Number.isFinite(valueMs) || valueMs <= 0) {
    return '-';
  }

  const totalMinutes = Math.round(valueMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

export function groupTradesBy<T extends string>(trades: Trade[], getKey: (trade: Trade) => T) {
  return trades.reduce<Record<T, Trade[]>>((groups, trade) => {
    const key = getKey(trade);
    groups[key] = [...(groups[key] ?? []), trade];
    return groups;
  }, {} as Record<T, Trade[]>);
}

export function average(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length : 0;
}
