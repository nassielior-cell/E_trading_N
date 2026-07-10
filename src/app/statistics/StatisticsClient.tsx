'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/components/ui/button';
import { LoginScreen } from '@/features/auth/login-screen';
import { useAuth } from '@/features/auth/auth-provider';
import { TextInput } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-provider';
import type { AssetType, Trade, TradeDirection, TradeMode } from '@/models/journal';
import { AddEntryModal } from '@/features/journal/components/add-entry-modal';
import {
  strategyOptions,
  tradeDirectionOptions,
  tradeModeOptions,
  type OptionDefinition,
} from '@/features/journal/config/journal-options';
import { useJournalStore } from '@/features/journal/store/journal-store';
import { formatAccountValue, getAccountValueTimeline, getCurrentAccountValue, getStartingAccountValue } from '@/features/journal/utils/account-value';
import { formatDuration, getClosedTradeDurations } from '@/features/journal/utils/statistics';
import { getClosedTradePnl, getTradeAssetName, getTradeAssetType, getTradeCloseDate, type AssetTypeFilter } from '@/features/journal/utils/trade-values';
import { getAllowedTradeModes } from '@/features/journal/utils/journal-scope';
import { getSpotStatsForDateRange } from '@/features/journal/utils/spot-values';
import { buildAdvancedGraphStats, type AdvancedGraphStats, type ChartPoint } from '@/features/journal/utils/advanced-statistics';

type FilterValue = 'all';
type ModeFilter = TradeMode | 'spot' | FilterValue;
type DirectionFilter = TradeDirection | FilterValue;

type Filters = {
  startDate: string;
  endDate: string;
  mode: ModeFilter;
  symbol: string;
  assetType: AssetTypeFilter;
  strategy: string;
  direction: DirectionFilter;
  entryTimeFrom: string;
  entryTimeTo: string;
  exitTimeFrom: string;
  exitTimeTo: string;
};

type StatRow = {
  id: string;
  label: string;
  trades: Trade[];
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  averageRr: number;
  averageDurationMs: number;
};

const initialFilters: Filters = {
  startDate: '',
  endDate: '',
  mode: 'all',
  symbol: 'all',
  assetType: 'all',
  strategy: 'all',
  direction: 'all',
  entryTimeFrom: '',
  entryTimeTo: '',
  exitTimeFrom: '',
  exitTimeTo: '',
};

const stopRanges = [
  { id: '0-1', label: '0-1%', min: 0, max: 1 },
  { id: '1-2', label: '1-2%', min: 1, max: 2 },
  { id: '2-3', label: '2-3%', min: 2, max: 3 },
  { id: '3-5', label: '3-5%', min: 3, max: 5 },
  { id: '5+', label: '5%+', min: 5, max: Number.POSITIVE_INFINITY },
];

export function StatisticsClient() {
  const { language, t } = useLanguage();
  const { isLoading: isAuthLoading, isReady: isAuthReady, user } = useAuth();
  const isHebrew = language === 'he';
  const tradesById = useJournalStore((state) => state.trades);
  const spotsById = useJournalStore((state) => state.spots);
  const symbolOptions = useJournalStore((state) => state.symbolOptions);
  const customStrategyOptions = useJournalStore((state) => state.customStrategyOptions);
  const accountValueResets = useJournalStore((state) => state.accountValueResets);
  const journalType = useJournalStore((state) => state.journalType);
  const assetTypeBySymbol = useJournalStore((state) => state.assetTypeBySymbol);
  const isViewOnly = useJournalStore((state) => state.isViewOnly);
  const shareCode = useJournalStore((state) => state.shareCode);
  const initializeCloudSync = useJournalStore((state) => state.initializeCloudSync);
  const initializeSharedJournal = useJournalStore((state) => state.initializeSharedJournal);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [selectedGroup, setSelectedGroup] = useState<StatRow | null>(null);
  const [tradeToEdit, setTradeToEdit] = useState<Trade | undefined>();
  const [showAdvancedGraphs, setShowAdvancedGraphs] = useState(false);

  const allowedTradeModes = useMemo(() => getAllowedTradeModes(journalType), [journalType]);
  const allTrades = useMemo(() => Object.values(tradesById).filter((trade) => allowedTradeModes.includes(trade.mode)), [allowedTradeModes, tradesById]);
  const supportsSpot = journalType === 'combined' || journalType === 'spotOnly';
  const allSpots = useMemo(() => supportsSpot ? Object.values(spotsById) : [], [spotsById, supportsSpot]);
  const safeModeFilter = filters.mode === 'spot' && supportsSpot ? 'spot' : filters.mode !== 'all' && !allowedTradeModes.includes(filters.mode as TradeMode) ? (journalType === 'spotOnly' ? 'spot' : 'all') : filters.mode;

  useEffect(() => {
    if (!isAuthReady || !user) return;
    const params = new URLSearchParams(window.location.search);
    const shareCode = params.get('shareCode');
    if (shareCode) {
      void initializeSharedJournal(user.uid, shareCode);
      return;
    }

    const requestedWorkspace = params.get('workspace') ?? undefined;
    void initializeCloudSync(user.uid, requestedWorkspace);
  }, [initializeCloudSync, initializeSharedJournal, isAuthReady, user]);
  const strategyLabelById = useMemo(() => {
    const defaultLabels = Object.fromEntries(strategyOptions.map((option) => [option.value, t(option.labelKey)]));
    const customLabels = Object.fromEntries(customStrategyOptions.map((value) => [value, value.replace(/_/g, ' ')]));
    return { ...defaultLabels, ...customLabels };
  }, [customStrategyOptions, t]);
  const filteredTrades = useMemo(
    () =>
      safeModeFilter === 'spot' ? [] : allTrades.filter((trade) => {
        const closeDate = getTradeCloseDate(trade);
        if (filters.startDate && (!closeDate || closeDate < filters.startDate)) return false;
        if (filters.endDate && (!closeDate || closeDate > filters.endDate)) return false;
        if (safeModeFilter !== 'all' && trade.mode !== safeModeFilter) return false;
        if (filters.symbol !== 'all' && getTradeAssetName(trade) !== filters.symbol) return false;
        if (filters.assetType !== 'all' && getTradeAssetType(trade) !== filters.assetType) return false;
        if (filters.strategy !== 'all' && trade.strategyId !== filters.strategy) return false;
        if (filters.direction !== 'all' && trade.direction !== filters.direction) return false;
        if (filters.entryTimeFrom && trade.entryTime < filters.entryTimeFrom) return false;
        if (filters.entryTimeTo && trade.entryTime > filters.entryTimeTo) return false;
        if (filters.exitTimeFrom && (!trade.exitTime || trade.exitTime < filters.exitTimeFrom)) return false;
        if (filters.exitTimeTo && (!trade.exitTime || trade.exitTime > filters.exitTimeTo)) return false;
        return true;
      }),
    [allTrades, filters, safeModeFilter],
  );
  const filteredSpots = useMemo(
    () =>
      allSpots.filter((spot) => {
        if (filters.startDate && spot.buyDate < filters.startDate && !spot.sells.some((sell) => sell.sellDate >= filters.startDate)) return false;
        if (filters.endDate && spot.buyDate > filters.endDate && !spot.sells.some((sell) => sell.sellDate <= filters.endDate)) return false;
        if (filters.symbol !== 'all' && spot.assetName !== filters.symbol) return false;
        if (filters.assetType !== 'all' && spot.assetType !== filters.assetType) return false;
        return true;
      }),
    [allSpots, filters.assetType, filters.endDate, filters.startDate, filters.symbol],
  );
  const spotStats = useMemo(
    () => getSpotStatsForDateRange(filteredSpots, filters.startDate || '0000-01-01', filters.endDate || '9999-12-31'),
    [filteredSpots, filters.endDate, filters.startDate],
  );
  const accountValueMode = safeModeFilter === 'spot' ? 'spot' : safeModeFilter === 'backtesting' ? 'backtesting' : 'live';
  const accountValueEntries = accountValueMode === 'spot' ? filteredSpots : filteredTrades;
  const startingAccountValue = getStartingAccountValue(accountValueResets, accountValueMode);
  const currentAccountValue = safeModeFilter === 'all' ? undefined : getCurrentAccountValue(accountValueResets, accountValueEntries, accountValueMode);
  const equityPoints = useMemo(
    () => getAccountValueTimeline(accountValueResets, accountValueEntries, accountValueMode),
    [accountValueEntries, accountValueMode, accountValueResets],
  );
  const advancedGraphStats = useMemo(
    () =>
      showAdvancedGraphs
        ? buildAdvancedGraphStats({
          spots: safeModeFilter === 'all' || safeModeFilter === 'spot' ? filteredSpots : [],
          equityPoints,
          startingPortfolioValue: startingAccountValue?.value,
          strategyLabelById,
          trades: safeModeFilter === 'spot' ? [] : filteredTrades,
        })
        : undefined,
    [equityPoints, filteredSpots, filteredTrades, safeModeFilter, showAdvancedGraphs, startingAccountValue?.value, strategyLabelById],
  );
  const largestLossTrade = useMemo(
    () =>
      filteredTrades
        .filter((trade) => {
          const pnl = getClosedTradePnl(trade);
          return pnl !== undefined && pnl < 0;
        })
        .reduce<Trade | undefined>((largestLoss, trade) => {
          if (!largestLoss) return trade;
          return (getClosedTradePnl(trade) ?? 0) < (getClosedTradePnl(largestLoss) ?? 0) ? trade : largestLoss;
        }, undefined),
    [filteredTrades],
  );

  const modeOptions: Array<{ value: ModeFilter; label: string }> = [
    { value: 'all', label: t('all') },
    ...mapTranslatedOptions(tradeModeOptions, t).filter((option) => allowedTradeModes.includes(option.value)),
    ...(supportsSpot ? [{ value: 'spot' as const, label: isHebrew ? 'ספוט' : 'Spot' }] : []),
  ];
  const directionOptions: Array<{ value: DirectionFilter; label: string }> = [
    { value: 'all', label: t('all') },
    ...mapTranslatedOptions(tradeDirectionOptions, t),
  ];
  const assetTypeOptions: Array<{ value: AssetTypeFilter; label: string }> = [
    { value: 'all', label: t('all') },
    ...(['crypto', 'stock', 'forex'] as AssetType[]).map((value) => ({ value, label: t(value) })),
  ];
  const symbolSelectOptions = useMemo(() => [
    { value: 'all', label: t('all') },
    ...buildStatisticsSymbolOptions({
      allSpots,
      allTrades,
      assetTypeBySymbol,
      assetTypeFilter: filters.assetType,
      symbolOptions,
    }).map((symbol) => ({
      value: symbol,
      label: symbol,
    })),
  ], [allSpots, allTrades, assetTypeBySymbol, filters.assetType, symbolOptions, t]);
  const strategySelectOptions = [
    { value: 'all', label: t('all') },
    ...Object.entries(strategyLabelById).map(([value, label]) => ({ value, label })),
  ];

  const entryHourRows = useMemo(() => buildHourRows(filteredTrades, 'entryTime'), [filteredTrades]);
  const exitHourRows = useMemo(
    () => buildHourRows(filteredTrades.filter((trade) => trade.exitTime), 'exitTime'),
    [filteredTrades],
  );
  const worstEntryHourRows = useMemo(() => [...entryHourRows].reverse(), [entryHourRows]);
  const timeCombinationRows = useMemo(() => buildTimeCombinationRows(filteredTrades), [filteredTrades]);
  const stopRows = useMemo(() => buildStopRows(filteredTrades), [filteredTrades]);
  const directionRows = useMemo(
    () =>
      buildRows([
        { id: 'long', label: t('long'), trades: filteredTrades.filter((trade) => trade.direction === 'long') },
        { id: 'short', label: t('short'), trades: filteredTrades.filter((trade) => trade.direction === 'short') },
      ]),
    [filteredTrades, t],
  );
  const strategyRows = useMemo(() => {
    const grouped = new Map<string, Trade[]>();
    filteredTrades.forEach((trade) => {
      const key = trade.strategyId || 'not_set';
      grouped.set(key, [...(grouped.get(key) ?? []), trade]);
    });

    return buildRows(
      Array.from(grouped.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([strategyId, trades]) => ({
          id: strategyId,
          label: strategyLabelById[strategyId] ?? strategyId.replace(/_/g, ' '),
          trades,
        })),
    );
  }, [filteredTrades, strategyLabelById]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (filters.symbol === 'all') return;
    const validSymbols = new Set(symbolSelectOptions.map((option) => option.value));
    if (!validSymbols.has(filters.symbol)) {
      setFilters((current) => ({ ...current, symbol: 'all' }));
    }
  }, [filters.symbol, symbolSelectOptions]);

  if (!isAuthReady || isAuthLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4">
        <p className="text-sm font-bold text-subtle">{isHebrew ? 'טוען...' : 'Loading...'}</p>
      </main>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <main className="min-h-screen bg-background px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto grid max-w-7xl gap-4">
        <header className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft md:flex md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">{t('customStatistics')}</h1>
            <p className="mt-1 text-sm text-subtle">
              {safeModeFilter === 'spot' ? `${filteredSpots.length} / ${allSpots.length} Spot` : `${filteredTrades.length} / ${allTrades.length} ${t('trades')}`}
            </p>
          </div>
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-muted px-4 py-2 text-sm font-semibold text-ink transition hover:bg-border"
            href={shareCode
              ? `/?shareCode=${encodeURIComponent(shareCode)}`
              : '/'}
          >
            {t('workspace')}
          </Link>
        </header>

        <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <TextInput
              label={t('dateRange')}
              onChange={(event) => updateFilter('startDate', event.target.value)}
              type="date"
              value={filters.startDate}
            />
            <TextInput
              label={t('dateRange')}
              onChange={(event) => updateFilter('endDate', event.target.value)}
              type="date"
              value={filters.endDate}
            />
            <Select
              label={t('modeFilter')}
              onValueChange={(value) => updateFilter('mode', value)}
              options={modeOptions}
              value={safeModeFilter}
            />
            <Select
              label={t('assetType')}
              onValueChange={(value) => updateFilter('assetType', value)}
              options={assetTypeOptions}
              value={filters.assetType}
            />
            <Select
              label={t('symbol')}
              onValueChange={(value) => updateFilter('symbol', value)}
              options={symbolSelectOptions}
              value={filters.symbol}
            />
            <Select
              label={t('strategy')}
              onValueChange={(value) => updateFilter('strategy', value)}
              options={strategySelectOptions}
              value={filters.strategy}
            />
            <Select
              label={t('direction')}
              onValueChange={(value) => updateFilter('direction', value)}
              options={directionOptions}
              value={filters.direction}
            />
            <TextInput label={isHebrew ? 'כניסה משעה' : 'Entry time from'} onChange={(event) => updateFilter('entryTimeFrom', event.target.value)} type="time" value={filters.entryTimeFrom} />
            <TextInput label={isHebrew ? 'כניסה עד שעה' : 'Entry time to'} onChange={(event) => updateFilter('entryTimeTo', event.target.value)} type="time" value={filters.entryTimeTo} />
            <TextInput label={isHebrew ? 'יציאה משעה' : 'Exit time from'} onChange={(event) => updateFilter('exitTimeFrom', event.target.value)} type="time" value={filters.exitTimeFrom} />
            <TextInput label={isHebrew ? 'יציאה עד שעה' : 'Exit time to'} onChange={(event) => updateFilter('exitTimeTo', event.target.value)} type="time" value={filters.exitTimeTo} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setFilters(initialFilters)} type="button" variant="secondary">
              {t('all')}
            </Button>
          </div>
        </section>

        {supportsSpot ? (
          <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label={isHebrew ? 'ספוט רווח/הפסד' : 'Spot realized P/L'} value={formatCurrency(spotStats.realizedPnl)} />
            <StatCard label={isHebrew ? 'ספוט פתוח' : 'Open Spot'} value={String(spotStats.openCount)} />
            <StatCard label={isHebrew ? 'ספוט סגור' : 'Closed Spot'} value={String(spotStats.closedCount)} />
            <StatCard label={isHebrew ? 'הון מושקע' : 'Spot invested'} value={formatAccountValue(spotStats.investedCapital)} />
            <StatCard label={isHebrew ? 'הון פתוח' : 'Open cost basis'} value={formatAccountValue(spotStats.openCostBasis)} />
          </section>
        ) : null}

        {safeModeFilter !== 'spot' ? <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label={isHebrew ? 'הפסד הגדול ביותר' : 'Largest loss'} value={largestLossTrade ? formatCurrency(getClosedTradePnl(largestLossTrade) ?? 0) : '-'} />
          <StatCard label={t('symbol')} value={largestLossTrade ? getTradeAssetName(largestLossTrade) : '-'} />
          <StatCard label={isHebrew ? 'שווי תיק התחלתי' : 'Starting account value'} value={formatAccountValue(startingAccountValue?.value)} />
          <StatCard label={isHebrew ? 'שווי תיק נוכחי' : 'Current account value'} value={formatAccountValue(currentAccountValue?.value)} />
          <button
            className="rounded-md border border-border bg-muted p-3 text-start transition hover:bg-border disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!largestLossTrade || isViewOnly}
            onClick={() => {
              if (isViewOnly) return;
              setTradeToEdit(largestLossTrade);
            }}
            type="button"
          >
            <span className="block text-xs font-bold uppercase text-subtle">{largestLossTrade ? largestLossTrade.entryDate : '-'}</span>
            <span className="mt-1 block text-lg font-bold text-ink">
              {largestLossTrade ? `${getTradeAssetName(largestLossTrade)} · ${strategyLabelById[largestLossTrade.strategyId ?? ''] ?? largestLossTrade.strategyId ?? t('notSet')}` : t('noEntries')}
            </span>
          </button>
        </section> : null}

        {safeModeFilter !== 'spot' ? <div className="grid gap-4">
          <StatsSection isHebrew={isHebrew} onOpen={setSelectedGroup} rows={entryHourRows} title={isHebrew ? 'טווחי כניסה עם הביצועים הטובים ביותר' : 'Best performing entry time ranges'} />
          <StatsSection isHebrew={isHebrew} onOpen={setSelectedGroup} rows={worstEntryHourRows} title={isHebrew ? 'טווחי כניסה עם הביצועים החלשים ביותר' : 'Worst performing entry time ranges'} />
          <StatsSection isHebrew={isHebrew} onOpen={setSelectedGroup} rows={exitHourRows} title={isHebrew ? 'טווחי יציאה עם הביצועים הטובים ביותר' : 'Best performing exit time ranges'} />
          <StatsSection isHebrew={isHebrew} onOpen={setSelectedGroup} rows={timeCombinationRows} title={isHebrew ? 'שילובי כניסה + יציאה הטובים ביותר' : 'Best entry + exit time combinations'} />
          <StatsSection isHebrew={isHebrew} onOpen={setSelectedGroup} rows={stopRows} title={t('stopPerformance')} />
          <StatsSection isHebrew={isHebrew} onOpen={setSelectedGroup} rows={directionRows} title={t('directionPerformance')} />
          <StatsSection isHebrew={isHebrew} onOpen={setSelectedGroup} rows={strategyRows} title={t('strategyPerformance')} />
        </div> : null}

        <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">{isHebrew ? 'גרפים מתקדמים' : 'Advanced graphs'}</h2>
              <p className="mt-1 text-sm text-subtle">
                {isHebrew ? 'תובנות ויזואליות לפי הסינונים הנוכחיים' : 'Visual insights based on the current filters'}
              </p>
            </div>
            <Button onClick={() => setShowAdvancedGraphs((current) => !current)} type="button" variant="secondary">
              {showAdvancedGraphs ? (isHebrew ? '− הסתר גרפים מתקדמים' : '- Hide advanced graphs') : (isHebrew ? '+ הצג גרפים מתקדמים' : '+ Show advanced graphs')}
            </Button>
          </div>
          {showAdvancedGraphs && advancedGraphStats ? <AdvancedGraphsSection isHebrew={isHebrew} stats={advancedGraphStats} /> : null}
        </section>
      </div>

      <Modal
        closeLabel={t('close')}
        isOpen={Boolean(selectedGroup)}
        onClose={() => setSelectedGroup(null)}
        title={selectedGroup?.label ?? t('trades')}
      >
        <div className="grid gap-2">
          {selectedGroup?.trades.length ? (
            selectedGroup.trades.map((trade) => (
              <button
                className="grid gap-1 rounded-md border border-border bg-surface p-3 text-start text-sm transition hover:bg-muted"
                key={trade.id}
                onClick={() => {
                  if (isViewOnly) return;
                  setSelectedGroup(null);
                  setTradeToEdit(trade);
                }}
                type="button"
              >
                <span className="font-bold text-ink">
                  {getTradeAssetName(trade)} · {strategyLabelById[trade.strategyId ?? ''] ?? trade.strategyId ?? t('notSet')}
                </span>
                <span className="text-subtle">
                  {trade.entryDate} {trade.entryTime} · {t(trade.direction)} · {formatCurrency(getClosedTradePnl(trade) ?? 0)} · R:R {formatNumber(trade.rr ?? 0)}
                </span>
              </button>
            ))
          ) : (
            <p className="rounded-md bg-muted p-3 text-sm font-semibold text-subtle">{t('noEntries')}</p>
          )}
        </div>
      </Modal>

      <AddEntryModal
        date={tradeToEdit?.dayId ?? tradeToEdit?.entryDate ?? ''}
        isOpen={Boolean(tradeToEdit)}
        onClose={() => setTradeToEdit(undefined)}
        tradeToEdit={tradeToEdit}
      />
    </main>
  );
}

const chartColors = ['#38bdf8', '#22c55e', '#f97316', '#a78bfa', '#f43f5e', '#eab308'];
const gridStroke = 'rgba(148, 163, 184, 0.24)';

function AdvancedGraphsSection({ stats, isHebrew }: { stats: AdvancedGraphStats; isHebrew: boolean }) {
  const emptyMessage = isHebrew ? 'אין מספיק נתונים להצגת גרף' : 'Not enough data to show this chart';

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={isHebrew ? 'הון פתוח / חשיפה פתוחה' : 'Open capital / exposure'} value={formatAccountValue(stats.exposureSummary.openCapital)} />
        <StatCard label={isHebrew ? 'פוזיציות פתוחות' : 'Open positions'} value={String(stats.exposureSummary.openPositions)} />
        <StatCard label={isHebrew ? 'אירועי רווח/הפסד' : 'Realized P/L events'} value={String(stats.cumulativePnl.length)} />
        <StatCard label={isHebrew ? 'נכסים בגרפים' : 'Assets in charts'} value={String(stats.symbolPerformance.length)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={isHebrew ? 'שווי תיק לאורך זמן' : 'Portfolio value over time'}>
          <LineChartPanel data={stats.equity} dataKey="value" emptyMessage={emptyMessage} stroke="#38bdf8" />
        </ChartCard>

        <ChartCard title={isHebrew ? 'רווחים מול הפסדים לאורך זמן' : 'Profit vs loss over time'}>
          <BarChartPanel
            bars={[
              { dataKey: 'profit', fill: '#22c55e', name: isHebrew ? 'רווח' : 'Profit' },
              { dataKey: 'loss', fill: '#ef4444', name: isHebrew ? 'הפסד' : 'Loss' },
            ]}
            data={stats.profitLossOverTime}
            emptyMessage={emptyMessage}
            xKey="date"
          />
        </ChartCard>

        <ChartCard title={isHebrew ? 'רווח/הפסד מצטבר' : 'Cumulative P/L'}>
          <LineChartPanel data={stats.cumulativePnl} dataKey="value" emptyMessage={emptyMessage} stroke="#22c55e" />
        </ChartCard>

        <ChartCard title={isHebrew ? 'יחס ניצחונות / הפסדים / איזון' : 'Win / loss / break-even ratio'}>
          <DonutChartPanel data={stats.winLossBreakEven} emptyMessage={emptyMessage} />
        </ChartCard>

        <ChartCard title={isHebrew ? 'חלוקת סוגי עסקאות' : 'Trade type distribution'}>
          <DonutChartPanel data={stats.tradeTypeDistribution} emptyMessage={emptyMessage} />
        </ChartCard>

        <ChartCard title={isHebrew ? 'ביצועי לונג מול שורט' : 'Long vs short performance'}>
          <BarChartPanel
            bars={[
              { dataKey: 'pnl', fill: '#38bdf8', name: isHebrew ? 'רווח/הפסד' : 'P/L' },
              { dataKey: 'trades', fill: '#a78bfa', name: isHebrew ? 'עסקאות' : 'Trades' },
            ]}
            data={stats.longShortPerformance}
            emptyMessage={emptyMessage}
            xKey="name"
          />
        </ChartCard>

        <ChartCard title={isHebrew ? 'שעות כניסה עם הביצועים הטובים ביותר' : 'Best entry hours'}>
          <BarChartPanel
            bars={[
              { dataKey: 'pnl', fill: '#22c55e', name: isHebrew ? 'רווח/הפסד' : 'P/L' },
              { dataKey: 'trades', fill: '#38bdf8', name: isHebrew ? 'עסקאות' : 'Trades' },
            ]}
            data={stats.bestEntryHours}
            emptyMessage={emptyMessage}
            xKey="hour"
          />
        </ChartCard>

        <ChartCard title={isHebrew ? 'שעות כניסה החלשות ביותר' : 'Worst entry hours'}>
          <BarChartPanel
            bars={[
              { dataKey: 'pnl', fill: '#ef4444', name: isHebrew ? 'רווח/הפסד' : 'P/L' },
              { dataKey: 'trades', fill: '#38bdf8', name: isHebrew ? 'עסקאות' : 'Trades' },
            ]}
            data={stats.worstEntryHours}
            emptyMessage={emptyMessage}
            xKey="hour"
          />
        </ChartCard>

        <ChartCard title={isHebrew ? 'ביצועי אחוז סטופ' : 'Stop loss performance'}>
          <BarChartPanel
            bars={[
              { dataKey: 'pnl', fill: '#f97316', name: isHebrew ? 'רווח/הפסד' : 'P/L' },
              { dataKey: 'winRate', fill: '#22c55e', name: isHebrew ? 'אחוז ניצחון' : 'Win rate' },
              { dataKey: 'trades', fill: '#38bdf8', name: isHebrew ? 'עסקאות' : 'Trades' },
            ]}
            data={stats.stopPerformance}
            emptyMessage={emptyMessage}
            xKey="range"
          />
        </ChartCard>

        <ChartCard title={isHebrew ? 'ביצועי אסטרטגיות' : 'Strategy performance'}>
          <HorizontalBarChartPanel
            data={stats.strategyPerformance}
            dataKey="pnl"
            emptyMessage={isHebrew ? 'אין אסטרטגיות להצגה' : 'No strategy data to show'}
            name={isHebrew ? 'רווח/הפסד' : 'P/L'}
            yKey="strategy"
          />
        </ChartCard>

        <ChartCard title={isHebrew ? 'ביצועים לפי נכס' : 'Asset / symbol performance'}>
          <HorizontalBarChartPanel
            data={stats.symbolPerformance}
            dataKey="pnl"
            emptyMessage={emptyMessage}
            name={isHebrew ? 'רווח/הפסד' : 'P/L'}
            yKey="symbol"
          />
        </ChartCard>

        <ChartCard title={isHebrew ? 'R:R ממוצע לאורך זמן' : 'Average R:R over time'}>
          <LineChartPanel data={stats.averageRrOverTime} dataKey="value" emptyMessage={emptyMessage} stroke="#a78bfa" />
        </ChartCard>

        <ChartCard title={isHebrew ? 'פתוחות מול סגורות' : 'Open vs closed positions'}>
          <DonutChartPanel data={stats.openClosedPositions} emptyMessage={emptyMessage} />
        </ChartCard>

        <ChartCard title={isHebrew ? 'ביצועים חודשיים' : 'Monthly performance'}>
          <BarChartPanel
            bars={[
              { dataKey: 'pnl', fill: '#38bdf8', name: isHebrew ? 'רווח/הפסד' : 'P/L' },
              { dataKey: 'trades', fill: '#a78bfa', name: isHebrew ? 'עסקאות' : 'Trades' },
            ]}
            data={stats.monthlyPerformance}
            emptyMessage={emptyMessage}
            xKey="month"
          />
        </ChartCard>

        <ChartCard title={isHebrew ? 'הון פתוח / חשיפה פתוחה' : 'Risk exposure / open capital'}>
          <HorizontalBarChartPanel
            data={stats.exposureBySymbol}
            dataKey="value"
            emptyMessage={emptyMessage}
            name={isHebrew ? 'הון פתוח' : 'Open capital'}
            yKey="symbol"
          />
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="grid gap-3 rounded-lg border border-border bg-muted/60 p-3 shadow-soft">
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {children}
    </article>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="grid min-h-[260px] place-items-center rounded-md border border-dashed border-border bg-surface p-4 text-center text-sm font-semibold text-subtle">
      {message}
    </div>
  );
}

function LineChartPanel({ data, dataKey, emptyMessage, stroke }: { data: ChartPoint[]; dataKey: string; emptyMessage: string; stroke: string }) {
  if (data.length < 2) return <EmptyChart message={emptyMessage} />;

  return (
    <div className="h-[280px] min-w-0">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={data} margin={{ top: 10, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="date" minTickGap={18} stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
          <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 11 }} width={48} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line dataKey={dataKey} dot={false} name="Value" stroke={stroke} strokeWidth={3} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarChartPanel({
  bars,
  data,
  emptyMessage,
  xKey,
}: {
  bars: Array<{ dataKey: string; fill: string; name: string }>;
  data: ChartPoint[];
  emptyMessage: string;
  xKey: string;
}) {
  if (!hasNonZeroData(data, bars.map((bar) => bar.dataKey))) return <EmptyChart message={emptyMessage} />;

  return (
    <div className="h-[280px] min-w-0">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey={xKey} minTickGap={12} stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
          <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 11 }} width={48} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 12 }} />
          {bars.map((bar) => <Bar dataKey={bar.dataKey} fill={bar.fill} key={bar.dataKey} name={bar.name} radius={[4, 4, 0, 0]} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HorizontalBarChartPanel({
  data,
  dataKey,
  emptyMessage,
  name,
  yKey,
}: {
  data: ChartPoint[];
  dataKey: string;
  emptyMessage: string;
  name: string;
  yKey: string;
}) {
  if (!hasNonZeroData(data, [dataKey])) return <EmptyChart message={emptyMessage} />;

  return (
    <div className="h-[280px] min-w-0">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 12, bottom: 8, left: 28 }}>
          <CartesianGrid stroke={gridStroke} horizontal={false} />
          <XAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 11 }} type="number" />
          <YAxis dataKey={yKey} stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 11 }} type="category" width={72} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey={dataKey} fill="#38bdf8" name={name} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutChartPanel({ data, emptyMessage }: { data: ChartPoint[]; emptyMessage: string }) {
  if (!hasNonZeroData(data, ['value'])) return <EmptyChart message={emptyMessage} />;

  return (
    <div className="h-[280px] min-w-0">
      <ResponsiveContainer height="100%" width="100%">
        <PieChart>
          <Pie
            cx="50%"
            cy="50%"
            data={data}
            dataKey="value"
            innerRadius="54%"
            nameKey="name"
            outerRadius="78%"
            paddingAngle={3}
          >
            {data.map((entry, index) => <Cell fill={chartColors[index % chartColors.length]} key={String(entry.name ?? index)} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

const tooltipStyle = {
  background: '#111827',
  border: '1px solid #374151',
  borderRadius: 8,
  color: '#f9fafb',
};

function hasNonZeroData(data: ChartPoint[], keys: string[]) {
  return data.some((point) =>
    keys.some((key) => {
      const value = point[key];
      return typeof value === 'number' && Number.isFinite(value) && value !== 0;
    }),
  );
}

function StatsSection({ title, rows, onOpen, isHebrew }: { title: string; rows: StatRow[]; onOpen: (row: StatRow) => void; isHebrew: boolean }) {
  return (
    <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="hidden overflow-x-auto rounded-md border border-border md:block">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 bg-surface text-sm">
          <thead className="bg-muted">
            <tr className="text-start text-subtle">
              <HeaderCell label={title} />
              <HeaderCell label={isHebrew ? 'טריידים' : 'Trades'} />
              <HeaderCell label={isHebrew ? 'ניצחונות' : 'Wins'} />
              <HeaderCell label={isHebrew ? 'הפסדים' : 'Losses'} />
              <HeaderCell label={isHebrew ? 'אחוז ניצחון' : 'Win rate'} />
              <HeaderCell label="P/L" />
              <HeaderCell label="Avg R:R" />
              <HeaderCell label={isHebrew ? 'משך בפועל' : 'Actual duration'} />
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr className="cursor-pointer transition hover:bg-muted" key={row.id} onClick={() => onOpen(row)}>
                  <BodyCell className="font-bold text-ink" value={row.label} />
                  <BodyCell value={String(row.count)} />
                  <BodyCell value={String(row.wins)} />
                  <BodyCell value={String(row.losses)} />
                  <BodyCell value={formatPercent(row.winRate)} />
                  <BodyCell value={formatCurrency(row.totalPnl)} />
                  <BodyCell value={formatNumber(row.averageRr)} />
                  <BodyCell value={formatDuration(row.averageDurationMs)} />
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-6 text-center text-sm font-semibold text-subtle" colSpan={8}>
                  {isHebrew ? 'אין שורות' : 'No rows'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 md:hidden">
        {rows.length ? (
          rows.map((row) => (
            <button
              className="grid gap-2 rounded-md border border-border bg-surface p-3 text-start text-sm shadow-soft transition hover:bg-muted"
              key={row.id}
              onClick={() => onOpen(row)}
              type="button"
            >
              <span className="font-bold text-ink">{row.label}</span>
              <span className="grid grid-cols-2 gap-2 text-subtle">
                <Metric label={isHebrew ? 'טריידים' : 'Trades'} value={String(row.count)} />
                <Metric label={isHebrew ? 'אחוז ניצחון' : 'Win rate'} value={formatPercent(row.winRate)} />
                <Metric label="P/L" value={formatCurrency(row.totalPnl)} />
                <Metric label="Avg R:R" value={formatNumber(row.averageRr)} />
                <Metric label={isHebrew ? 'משך בפועל' : 'Actual duration'} value={formatDuration(row.averageDurationMs)} />
              </span>
            </button>
          ))
        ) : (
          <p className="rounded-md border border-border bg-muted p-3 text-sm font-semibold text-subtle">{isHebrew ? 'אין שורות' : 'No rows'}</p>
        )}
      </div>
    </section>
  );
}

function HeaderCell({ label }: { label: string }) {
  return <th className="border-b border-border px-3 py-2 text-start text-xs font-bold uppercase">{label}</th>;
}

function BodyCell({ value, className = '' }: { value: string; className?: string }) {
  return <td className={`border-b border-border px-3 py-3 text-subtle ${className}`}>{value}</td>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="font-semibold text-ink">{label}: </span>
      {value}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted p-3">
      <p className="text-xs font-bold uppercase text-subtle">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
    </div>
  );
}

function buildHourRows(trades: Trade[], timeField: 'entryTime' | 'exitTime') {
  const grouped = new Map<string, Trade[]>();

  trades.forEach((trade) => {
    const hour = trade[timeField]?.slice(0, 2);
    if (!hour) return;

    const label = `${hour}:00-${hour}:59`;
    grouped.set(label, [...(grouped.get(label) ?? []), trade]);
  });

  return buildRows(
    Array.from(grouped.entries())
      .sort(([, aTrades], [, bTrades]) => sumClosedPnl(bTrades) - sumClosedPnl(aTrades))
      .map(([label, groupedTrades]) => ({ id: `${timeField}-${label}`, label, trades: groupedTrades })),
  );
}

function buildTimeCombinationRows(trades: Trade[]) {
  const grouped = new Map<string, Trade[]>();

  trades.forEach((trade) => {
    if (!trade.entryTime || !trade.exitTime) return;
    const entryHour = trade.entryTime.slice(0, 2);
    const exitHour = trade.exitTime.slice(0, 2);
    const label = `${entryHour}:00 entry -> ${exitHour}:00 exit`;
    grouped.set(label, [...(grouped.get(label) ?? []), trade]);
  });

  return buildRows(
    Array.from(grouped.entries())
      .sort(([, aTrades], [, bTrades]) => sumClosedPnl(bTrades) - sumClosedPnl(aTrades))
      .map(([label, groupedTrades]) => ({ id: `combo-${label}`, label, trades: groupedTrades })),
  );
}

function buildStopRows(trades: Trade[]) {
  return buildRows(
    stopRanges.map((range) => ({
      id: range.id,
      label: range.label,
      trades: trades.filter((trade) => {
        if (trade.stopPercentage === undefined) return false;
        return trade.stopPercentage >= range.min && trade.stopPercentage < range.max;
      }),
    })),
  );
}

function buildStatisticsSymbolOptions({
  allSpots,
  allTrades,
  assetTypeBySymbol,
  assetTypeFilter,
  symbolOptions,
}: {
  allSpots: Array<{ assetName: string; assetType: AssetType }>;
  allTrades: Trade[];
  assetTypeBySymbol: Record<string, AssetType>;
  assetTypeFilter: AssetTypeFilter;
  symbolOptions: string[];
}) {
  const symbols = new Set<string>();
  const shouldIncludeType = (assetType: AssetType) => assetTypeFilter === 'all' || assetType === assetTypeFilter;

  symbolOptions.forEach((symbol) => {
    const assetType = assetTypeBySymbol[symbol];
    if (assetType && shouldIncludeType(assetType)) symbols.add(symbol);
  });
  allTrades.forEach((trade) => {
    const assetType = getTradeAssetType(trade);
    if (shouldIncludeType(assetType)) symbols.add(getTradeAssetName(trade));
  });
  allSpots.forEach((spot) => {
    if (shouldIncludeType(spot.assetType)) symbols.add(spot.assetName);
  });

  return Array.from(symbols).sort();
}

function buildRows(groups: Array<{ id: string; label: string; trades: Trade[] }>): StatRow[] {
  return groups.map((group) => {
    const closedTrades = group.trades.filter((trade) => trade.status === 'closed');
    const wins = closedTrades.filter((trade) => trade.result === 'win').length;
    const losses = closedTrades.filter((trade) => trade.result === 'loss').length;
    const totalPnl = sumClosedPnl(group.trades);
    const rrValues = group.trades.map((trade) => trade.rr ?? 0).filter((value) => Number.isFinite(value));
    const averageRr = rrValues.length ? rrValues.reduce((sum, value) => sum + value, 0) / rrValues.length : 0;
    const durations = getClosedTradeDurations(group.trades);
    const averageDurationMs = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;

    return {
      ...group,
      count: group.trades.length,
      wins,
      losses,
      winRate: closedTrades.length ? wins / closedTrades.length : 0,
      totalPnl,
      averageRr,
      averageDurationMs,
    };
  }).sort((a, b) => b.totalPnl - a.totalPnl || b.winRate - a.winRate || b.count - a.count);
}

function sumClosedPnl(trades: Trade[]) {
  return trades.reduce((sum, trade) => sum + (getClosedTradePnl(trade) ?? 0), 0);
}

function mapTranslatedOptions<T extends string>(
  options: OptionDefinition<T>[],
  t: (key: OptionDefinition<T>['labelKey']) => string,
) {
  return options.map((option) => ({ value: option.value, label: t(option.labelKey) }));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatCurrency(value: number) {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;
}

function formatNumber(value: number) {
  return value.toFixed(2);
}
