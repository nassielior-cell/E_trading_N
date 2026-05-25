import type { DayMetadata, DayResult, SpotPosition, Task, Trade } from '@/models/journal';
import { isSpotOpen } from './spot-status';
import { getClosedTradePnl } from './trade-values';

export function buildDayMetadata(tasks: Task[], trades: Trade[], spots: SpotPosition[] = []): DayMetadata {
  const pnl = trades.reduce((total, trade) => total + (getClosedTradePnl(trade) ?? 0), 0) +
    spots.reduce((total, spot) => total + spot.realizedPnl, 0);
  const closedTrades = trades.filter((trade) => trade.status === 'closed');
  const winCount = closedTrades.filter((trade) => trade.result === 'win').length;
  const lossCount = closedTrades.filter((trade) => trade.result === 'loss').length;
  const breakevenCount = closedTrades.filter((trade) => trade.result === 'breakeven').length;
  const categoryIds = Array.from(
    new Set([...tasks.map((task) => task.categoryId), ...trades.map((trade) => trade.categoryId)].filter(Boolean)),
  ) as string[];

  return {
    tradeCount: trades.length,
    taskCount: tasks.length,
    spotCount: spots.length,
    openSpotCount: spots.filter(isSpotOpen).length,
    closedSpotCount: spots.filter((spot) => !isSpotOpen(spot)).length,
    winCount,
    lossCount,
    breakevenCount,
    liveTradeCount: trades.filter((trade) => trade.mode === 'live').length,
    backtestingTradeCount: trades.filter((trade) => trade.mode === 'backtesting').length,
    reviewTradeCount: 0,
    result: getDayResult(pnl, winCount, lossCount),
    pnl,
    adherenceScore: undefined,
    categoryIds,
  };
}

function getDayResult(pnl: number, wins: number, losses: number): DayResult {
  if (pnl > 0) {
    return 'profitable';
  }

  if (pnl < 0) {
    return 'losing';
  }

  if (wins > losses) {
    return 'profitable';
  }

  if (losses > wins) {
    return 'losing';
  }

  return 'neutral';
}
