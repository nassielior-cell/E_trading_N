import type { SpotPosition } from '@/models/journal';
import { average, formatDuration } from './statistics';
import { getSpotRemainingQuantity, isSpotOpen } from './spot-status';

export function getSpotExpectedBuyCost(spot: Pick<SpotPosition, 'buyPrice' | 'quantityBought'>) {
  return spot.buyPrice * spot.quantityBought;
}

export function getSpotBuyFeesSlippage(spot: Pick<SpotPosition, 'actualAmountPaid' | 'buyPrice' | 'quantityBought'>) {
  return spot.actualAmountPaid - getSpotExpectedBuyCost(spot);
}

export function getSpotStats(spots: SpotPosition[]) {
  const closedOrPartial = spots.filter((spot) => spot.sells.length > 0);
  const pnlSorted = [...closedOrPartial].sort((a, b) => b.realizedPnl - a.realizedPnl);
  const durations = spots.flatMap((spot) =>
    spot.sells.map((sell) => sell.holdingDurationMs).filter((value): value is number => value !== undefined),
  );

  return {
    totalInvested: spots.reduce((sum, spot) => sum + spot.expectedBuyCost, 0),
    realizedPnl: spots.reduce((sum, spot) => sum + spot.realizedPnl, 0),
    openPositionValuePlaceholder: spots.filter(isSpotOpen).length,
    averageHoldingDurationMs: average(durations),
    bestSpot: pnlSorted[0],
    worstSpot: pnlSorted.at(-1),
    openCount: spots.filter(isSpotOpen).length,
    closedCount: spots.filter((spot) => !isSpotOpen(spot)).length,
  };
}

export function getSpotStatsForDateRange(spots: SpotPosition[], startDate: string, endDate: string) {
  const rangeSpots = spots.filter((spot) => isDateInRange(spot.buyDate, startDate, endDate) || spot.sells.some((sell) => isDateInRange(sell.sellDate, startDate, endDate)));
  const rangeSells = spots.flatMap((spot) => spot.sells.filter((sell) => isDateInRange(sell.sellDate, startDate, endDate)));
  const invested = spots
    .filter((spot) => isDateInRange(spot.buyDate, startDate, endDate))
    .reduce((sum, spot) => sum + spot.expectedBuyCost, 0);

  return {
    spots: rangeSpots,
    realizedPnl: rangeSells.reduce((sum, sell) => sum + sell.netPnl, 0),
    investedCapital: invested,
    openCount: spots.filter((spot) => isSpotOpen(spot) && spot.buyDate <= endDate).length,
    closedCount: spots.filter((spot) => !isSpotOpen(spot) && spot.sells.some((sell) => isDateInRange(sell.sellDate, startDate, endDate))).length,
    openCostBasis: spots
      .filter((spot) => isSpotOpen(spot) && spot.buyDate <= endDate)
      .reduce((sum, spot) => sum + (spot.quantityBought > 0 ? (getSpotRemainingQuantity(spot) / spot.quantityBought) * spot.expectedBuyCost : 0), 0),
    averageHoldingDurationMs: average(rangeSells.map((sell) => sell.holdingDurationMs ?? 0)),
  };
}

export function formatSpotHoldingDuration(ms?: number) {
  if (!ms) return '-';
  const days = Math.round(ms / 86_400_000);
  if (days >= 60) return `${Math.round(days / 30)}mo`;
  if (days >= 14) return `${Math.round(days / 7)}w`;
  if (days >= 1) return `${days}d`;
  return formatDuration(ms);
}

function isDateInRange(date: string | undefined, startDate: string, endDate: string) {
  return Boolean(date && startDate && endDate && date >= startDate && date <= endDate);
}
