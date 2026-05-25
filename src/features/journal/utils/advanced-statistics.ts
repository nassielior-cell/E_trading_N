import type { SpotPosition, Trade, TradeMode } from '@/models/journal';
import { getSpotRemainingQuantity, isSpotOpen } from './spot-status';
import { getClosedTradePnl, getTradeAssetName, getTradeCloseDate } from './trade-values';

export type ChartPoint = Record<string, number | string>;

export type AdvancedGraphStats = {
  equity: ChartPoint[];
  profitLossOverTime: ChartPoint[];
  cumulativePnl: ChartPoint[];
  winLossBreakEven: ChartPoint[];
  tradeTypeDistribution: ChartPoint[];
  longShortPerformance: ChartPoint[];
  bestEntryHours: ChartPoint[];
  worstEntryHours: ChartPoint[];
  stopPerformance: ChartPoint[];
  strategyPerformance: ChartPoint[];
  symbolPerformance: ChartPoint[];
  averageRrOverTime: ChartPoint[];
  openClosedPositions: ChartPoint[];
  monthlyPerformance: ChartPoint[];
  exposureBySymbol: ChartPoint[];
  exposureSummary: {
    openCapital: number;
    openPositions: number;
  };
};

type ClosedEvent = {
  id: string;
  date: string;
  pnl: number;
  rr?: number;
  symbol: string;
  sourceType: 'futures' | 'testing' | 'spot';
};

type HourBucket = {
  hour: string;
  trades: number;
  closed: number;
  wins: number;
  pnl: number;
};

const stopRanges = [
  { label: '0-1%', min: 0, max: 1 },
  { label: '1-2%', min: 1, max: 2 },
  { label: '2-3%', min: 2, max: 3 },
  { label: '3-5%', min: 3, max: 5 },
  { label: '5%+', min: 5, max: Number.POSITIVE_INFINITY },
];

export function normalizeTradeForStats(trade: Trade) {
  return {
    id: trade.id,
    mode: trade.mode,
    sourceType: getTradeSourceType(trade.mode),
    status: trade.status,
    result: trade.result,
    symbol: getTradeAssetName(trade),
    direction: trade.direction,
    entryDate: trade.entryDate,
    entryTime: trade.entryTime,
    closeDate: getTradeCloseDate(trade),
    pnl: getClosedTradePnl(trade),
    rr: getFiniteNumber(trade.rr),
    stopPercentage: getFiniteNumber(trade.stopPercentage),
    strategyId: trade.strategyId,
    riskDollars: getFiniteNumber(trade.riskDollars),
  };
}

export function getClosedTrades(trades: Trade[]) {
  return trades.filter((trade) => trade.status === 'closed' && getClosedTradePnl(trade) !== undefined);
}

export function getOpenTrades(trades: Trade[]) {
  return trades.filter((trade) => trade.status === 'open');
}

export function calculateWinLossBreakEven(trades: Trade[]) {
  const closedTrades = trades.filter((trade) => trade.status === 'closed');
  return [
    { name: 'ניצחונות', value: closedTrades.filter((trade) => trade.result === 'win').length },
    { name: 'הפסדים', value: closedTrades.filter((trade) => trade.result === 'loss').length },
    { name: 'איזון', value: closedTrades.filter((trade) => trade.result === 'breakeven').length },
  ].filter((item) => item.value > 0);
}

export function calculateCumulativePnL(trades: Trade[], spots: SpotPosition[] = []) {
  let running = 0;
  return getClosedEvents(trades, spots)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((event) => {
      running += event.pnl;
      return { date: event.date, value: roundStat(running) };
    });
}

export function buildAdvancedGraphStats({
  spots,
  equityPoints,
  startingPortfolioValue,
  strategyLabelById,
  trades,
}: {
  trades: Trade[];
  spots: SpotPosition[];
  equityPoints?: ChartPoint[];
  startingPortfolioValue?: number;
  strategyLabelById: Record<string, string>;
}): AdvancedGraphStats {
  const closedEvents = getClosedEvents(trades, spots);
  const closedTrades = getClosedTrades(trades);
  const openTrades = getOpenTrades(trades);
  const openSpots = spots.filter(isSpotOpen);
  const cumulativePnl = calculateCumulativePnL(trades, spots);
  const startingValue = getFiniteNumber(startingPortfolioValue);

  return {
    equity: equityPoints?.length
      ? equityPoints
      : startingValue === undefined
      ? []
      : cumulativePnl.map((point) => ({ date: point.date, value: roundStat(startingValue + Number(point.value)) })),
    profitLossOverTime: buildProfitLossOverTime(closedEvents),
    cumulativePnl,
    winLossBreakEven: calculateWinLossBreakEven(trades),
    tradeTypeDistribution: buildTradeTypeDistribution(trades, spots),
    longShortPerformance: buildDirectionPerformance(trades),
    bestEntryHours: buildEntryHourPerformance(trades, 'best'),
    worstEntryHours: buildEntryHourPerformance(trades, 'worst'),
    stopPerformance: buildStopPerformance(trades),
    strategyPerformance: buildStrategyPerformance(trades, strategyLabelById),
    symbolPerformance: buildSymbolPerformance(closedEvents, spots),
    averageRrOverTime: buildAverageRrOverTime(closedTrades),
    openClosedPositions: buildOpenClosedPositions(closedTrades.length, openTrades.length + openSpots.length, getClosedSpotCount(spots)),
    monthlyPerformance: buildMonthlyPerformance(closedEvents),
    exposureBySymbol: buildExposureBySymbol(openTrades, openSpots),
    exposureSummary: buildExposureSummary(openTrades, openSpots),
  };
}

export function groupByDate(events: ClosedEvent[]) {
  return events.reduce((groups, event) => {
    const current = groups.get(event.date) ?? [];
    groups.set(event.date, [...current, event]);
    return groups;
  }, new Map<string, ClosedEvent[]>());
}

export function groupByMonth(events: ClosedEvent[]) {
  return events.reduce((groups, event) => {
    const month = event.date.slice(0, 7);
    const current = groups.get(month) ?? [];
    groups.set(month, [...current, event]);
    return groups;
  }, new Map<string, ClosedEvent[]>());
}

export function groupByEntryHour(trades: Trade[]) {
  return trades.reduce((groups, trade) => {
    const hour = trade.entryTime?.slice(0, 2);
    if (!hour) return groups;
    const label = `${hour}:00`;
    const current = groups.get(label) ?? [];
    groups.set(label, [...current, trade]);
    return groups;
  }, new Map<string, Trade[]>());
}

export function groupBySymbol(events: ClosedEvent[]) {
  return events.reduce((groups, event) => {
    const current = groups.get(event.symbol) ?? [];
    groups.set(event.symbol, [...current, event]);
    return groups;
  }, new Map<string, ClosedEvent[]>());
}

export function groupByStrategy(trades: Trade[]) {
  return trades.reduce((groups, trade) => {
    const key = trade.strategyId || 'not_set';
    const current = groups.get(key) ?? [];
    groups.set(key, [...current, trade]);
    return groups;
  }, new Map<string, Trade[]>());
}

function getClosedEvents(trades: Trade[], spots: SpotPosition[]): ClosedEvent[] {
  const tradeEvents = trades
    .map(normalizeTradeForStats)
    .filter((trade) => trade.status === 'closed' && trade.closeDate && trade.pnl !== undefined)
    .map((trade) => ({
      id: trade.id,
      date: trade.closeDate as string,
      pnl: trade.pnl as number,
      rr: trade.rr,
      symbol: trade.symbol,
      sourceType: trade.sourceType,
    }));

  const spotEvents = spots.flatMap((spot) =>
    spot.sells
      .filter((sell) => sell.sellDate && Number.isFinite(sell.netPnl))
      .map((sell) => ({
        id: `${spot.id}-${sell.id}`,
        date: sell.sellDate,
        pnl: sell.netPnl,
        symbol: spot.assetName,
        sourceType: 'spot' as const,
      })),
  );

  return [...tradeEvents, ...spotEvents];
}

function buildProfitLossOverTime(events: ClosedEvent[]) {
  return Array.from(groupByDate(events).entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dateEvents]) => ({
      date,
      profit: roundStat(dateEvents.filter((event) => event.pnl > 0).reduce((sum, event) => sum + event.pnl, 0)),
      loss: roundStat(Math.abs(dateEvents.filter((event) => event.pnl < 0).reduce((sum, event) => sum + event.pnl, 0))),
    }))
    .filter((point) => point.profit > 0 || point.loss > 0);
}

function buildTradeTypeDistribution(trades: Trade[], spots: SpotPosition[]) {
  const futures = trades.filter((trade) => trade.mode === 'live').length;
  const testing = trades.filter((trade) => trade.mode === 'backtesting').length;
  const spot = spots.length;

  return [
    { name: 'Futures', value: futures },
    { name: 'Testing', value: testing },
    { name: 'Spot', value: spot },
  ].filter((item) => item.value > 0);
}

function buildDirectionPerformance(trades: Trade[]) {
  return ['long', 'short'].map((direction) => {
    const directionTrades = trades.filter((trade) => trade.direction === direction);
    const closed = directionTrades.filter((trade) => trade.status === 'closed');
    const wins = closed.filter((trade) => trade.result === 'win').length;
    const pnl = sumClosedTradePnl(closed);

    return {
      name: direction === 'long' ? 'לונג' : 'שורט',
      trades: directionTrades.length,
      winRate: closed.length ? roundStat((wins / closed.length) * 100) : 0,
      pnl: roundStat(pnl),
    };
  }).filter((item) => item.trades > 0);
}

function buildEntryHourPerformance(trades: Trade[], sortMode: 'best' | 'worst') {
  const rows = Array.from(groupByEntryHour(trades).entries()).map(([hour, hourTrades]): HourBucket => {
    const closed = hourTrades.filter((trade) => trade.status === 'closed');
    const wins = closed.filter((trade) => trade.result === 'win').length;

    return {
      hour,
      trades: hourTrades.length,
      closed: closed.length,
      wins,
      pnl: sumClosedTradePnl(closed),
    };
  });

  return rows
    .sort((a, b) => sortMode === 'best' ? b.pnl - a.pnl || b.trades - a.trades : a.pnl - b.pnl || b.trades - a.trades)
    .slice(0, 8)
    .map((row) => ({
      hour: row.hour,
      trades: row.trades,
      winRate: row.closed ? roundStat((row.wins / row.closed) * 100) : 0,
      pnl: roundStat(row.pnl),
    }));
}

function buildStopPerformance(trades: Trade[]) {
  return stopRanges.map((range) => {
    const rangeTrades = trades.filter((trade) => {
      const stop = getFiniteNumber(trade.stopPercentage);
      return stop !== undefined && stop >= range.min && stop < range.max;
    });
    const closed = rangeTrades.filter((trade) => trade.status === 'closed');
    const wins = closed.filter((trade) => trade.result === 'win').length;

    return {
      range: range.label,
      trades: rangeTrades.length,
      winRate: closed.length ? roundStat((wins / closed.length) * 100) : 0,
      pnl: roundStat(sumClosedTradePnl(closed)),
    };
  }).filter((item) => item.trades > 0);
}

function buildStrategyPerformance(trades: Trade[], strategyLabelById: Record<string, string>) {
  return Array.from(groupByStrategy(trades).entries())
    .map(([strategyId, strategyTrades]) => {
      const closed = strategyTrades.filter((trade) => trade.status === 'closed');
      const wins = closed.filter((trade) => trade.result === 'win').length;
      const losses = closed.filter((trade) => trade.result === 'loss').length;

      return {
        strategy: strategyLabelById[strategyId] ?? strategyId.replace(/_/g, ' '),
        trades: strategyTrades.length,
        wins,
        losses,
        winRate: closed.length ? roundStat((wins / closed.length) * 100) : 0,
        pnl: roundStat(sumClosedTradePnl(closed)),
      };
    })
    .filter((item) => item.strategy !== 'not set' && item.trades > 0)
    .sort((a, b) => b.pnl - a.pnl || b.trades - a.trades)
    .slice(0, 10);
}

function buildSymbolPerformance(events: ClosedEvent[], spots: SpotPosition[]) {
  const openSpotCountBySymbol = spots.filter(isSpotOpen).reduce((counts, spot) => {
    counts.set(spot.assetName, (counts.get(spot.assetName) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  const rows = Array.from(groupBySymbol(events).entries()).map(([symbol, symbolEvents]) => ({
    symbol,
    pnl: roundStat(symbolEvents.reduce((sum, event) => sum + event.pnl, 0)),
    trades: symbolEvents.length,
    openSpot: openSpotCountBySymbol.get(symbol) ?? 0,
  }));

  openSpotCountBySymbol.forEach((openSpot, symbol) => {
    if (!rows.some((row) => row.symbol === symbol)) rows.push({ symbol, pnl: 0, trades: 0, openSpot });
  });

  return rows.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl) || b.trades - a.trades).slice(0, 10);
}

function buildAverageRrOverTime(trades: Trade[]) {
  const grouped = trades.reduce((groups, trade) => {
    const date = getTradeCloseDate(trade);
    const rr = getFiniteNumber(trade.rr);
    if (!date || rr === undefined) return groups;
    const current = groups.get(date) ?? [];
    groups.set(date, [...current, rr]);
    return groups;
  }, new Map<string, number[]>());

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, value: roundStat(values.reduce((sum, value) => sum + value, 0) / values.length) }));
}

function buildOpenClosedPositions(closedTradeCount: number, openPositionCount: number, closedSpotCount: number) {
  return [
    { name: 'פתוחות', value: openPositionCount },
    { name: 'סגורות', value: closedTradeCount + closedSpotCount },
  ].filter((item) => item.value > 0);
}

function buildMonthlyPerformance(events: ClosedEvent[]) {
  return Array.from(groupByMonth(events).entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthEvents]) => ({
      month,
      pnl: roundStat(monthEvents.reduce((sum, event) => sum + event.pnl, 0)),
      trades: monthEvents.length,
    }));
}

function buildExposureBySymbol(openTrades: Trade[], openSpots: SpotPosition[]) {
  const exposure = new Map<string, number>();

  openTrades.forEach((trade) => {
    const value = getFiniteNumber(trade.riskDollars);
    if (value === undefined || value <= 0) return;
    const symbol = getTradeAssetName(trade);
    exposure.set(symbol, (exposure.get(symbol) ?? 0) + value);
  });

  openSpots.forEach((spot) => {
    const value = getOpenSpotCostBasis(spot);
    if (value <= 0) return;
    exposure.set(spot.assetName, (exposure.get(spot.assetName) ?? 0) + value);
  });

  return Array.from(exposure.entries())
    .map(([symbol, value]) => ({ symbol, value: roundStat(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

function buildExposureSummary(openTrades: Trade[], openSpots: SpotPosition[]) {
  return {
    openCapital: roundStat(
      openTrades.reduce((sum, trade) => sum + Math.max(0, getFiniteNumber(trade.riskDollars) ?? 0), 0) +
        openSpots.reduce((sum, spot) => sum + getOpenSpotCostBasis(spot), 0),
    ),
    openPositions: openTrades.length + openSpots.length,
  };
}

function getClosedSpotCount(spots: SpotPosition[]) {
  return spots.filter((spot) => !isSpotOpen(spot) && spot.sells.length > 0).length;
}

function getOpenSpotCostBasis(spot: SpotPosition) {
  if (!spot.quantityBought || spot.quantityBought <= 0) return 0;
  return (getSpotRemainingQuantity(spot) / spot.quantityBought) * spot.expectedBuyCost;
}

function getTradeSourceType(mode: TradeMode): ClosedEvent['sourceType'] {
  return mode === 'backtesting' ? 'testing' : 'futures';
}

function sumClosedTradePnl(trades: Trade[]) {
  return trades.reduce((sum, trade) => sum + (getClosedTradePnl(trade) ?? 0), 0);
}

function getFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function roundStat(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}
