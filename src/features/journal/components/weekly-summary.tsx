'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useLanguage } from '@/lib/i18n/language-provider';
import type { JournalType, SpotPosition, Trade } from '@/models/journal';

import { strategyOptions } from '../config/journal-options';
import { formatDuration, getTradeStats, type TradeStats } from '../utils/statistics';
import { formatAccountValue, formatPercentValue, formatSignedMoney, getAccountValueAtStartOfDate, getAccountValueForDate, getModePnlBetweenDates } from '../utils/account-value';
import type { AccountValueReset } from '../data/journal-repository';
import { getModeLabelKey, getTradeAssetType, getTradeCloseDate, isTradeInMode, type TradeModeFilter } from '../utils/trade-values';
import { getAllowedTradeModes } from '../utils/journal-scope';
import { getSpotStatsForDateRange } from '../utils/spot-values';

type WeeklySummaryProps = {
  accountValueResets: AccountValueReset[];
  date: string;
  trades: Trade[];
  spots?: SpotPosition[];
  isOpen?: boolean;
  onToggle?: () => void;
  journalType: JournalType;
};

type WeekMode = 'current' | 'previous' | 'custom';

type DayPerformance = {
  date: string;
  stats: TradeStats;
};

type GroupRow = {
  id: string;
  label: string;
  stats: TradeStats;
};

export function WeeklySummary({ accountValueResets, date, trades, spots = [], isOpen = true, onToggle, journalType }: WeeklySummaryProps) {
  const { language, t } = useLanguage();
  const isHebrew = language === 'he';
  const [weekMode, setWeekMode] = useState<WeekMode>('current');
  const [summaryMode, setSummaryMode] = useState<TradeModeFilter>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const allowedTradeModes = useMemo(() => getAllowedTradeModes(journalType), [journalType]);
  const safeSummaryMode = summaryMode !== 'all' && !allowedTradeModes.includes(summaryMode) ? 'all' : summaryMode;
  const modeOptions = [
    { value: 'all' as const, label: t('all') },
    ...allowedTradeModes.map((mode) => ({ value: mode, label: t(getModeLabelKey(mode)) })),
  ];
  const selectedMode = safeSummaryMode === 'all' ? undefined : safeSummaryMode;
  const calculationTrades = useMemo(() => (isOpen ? trades : []), [isOpen, trades]);
  const selectedRange = useMemo(
    () => getSelectedRange(date, weekMode, customStart, customEnd),
    [customEnd, customStart, date, weekMode],
  );
  const weekTrades = useMemo(
    () =>
      calculationTrades.filter((trade) => {
        if (!selectedRange.start || !selectedRange.end) return false;
        const tradeDate = getTradeCloseDate(trade);
        return isTradeInMode(trade, safeSummaryMode) && tradeDate !== undefined && tradeDate >= selectedRange.start && tradeDate <= selectedRange.end;
      }),
    [calculationTrades, safeSummaryMode, selectedRange.end, selectedRange.start],
  );
  const stats = getTradeStats(weekTrades);
  const spotStats = useMemo(() => getSpotStatsForDateRange(spots, selectedRange.start, selectedRange.end || selectedRange.start), [selectedRange.end, selectedRange.start, spots]);
  const isSpotOnly = journalType === 'spotOnly';
  const rangeStartAccountValue = selectedMode ? getAccountValueAtStartOfDate(accountValueResets, calculationTrades, selectedRange.start, selectedMode) : undefined;
  const rangeEndAccountValue = selectedMode ? getAccountValueForDate(accountValueResets, calculationTrades, selectedRange.end || selectedRange.start, selectedMode) : undefined;
  const rangePnl = selectedMode
    ? getModePnlBetweenDates(calculationTrades, selectedRange.start, selectedRange.end || selectedRange.start, selectedMode)
    : allowedTradeModes.reduce((sum, mode) => sum + getModePnlBetweenDates(calculationTrades, selectedRange.start, selectedRange.end || selectedRange.start, mode), 0);
  const dayRows = useMemo(() => buildDayRows(weekTrades, selectedRange.start, selectedRange.end), [selectedRange.end, selectedRange.start, weekTrades]);
  const bestTradingDay = getBestPnlDay(dayRows);
  const worstTradingDay = getWorstPnlDay(dayRows);
  const highestDisciplineDay = getHighestDisciplineDay(dayRows);
  const lowestDisciplineDay = getLowestDisciplineDay(dayRows);
  const groupedRows = useMemo(
    () => ({
      strategy: buildGroupRows(weekTrades, (trade) => trade.strategyId ?? 'not_set', (value) => getStrategyLabel(value, t)),
      direction: buildGroupRows(weekTrades, (trade) => trade.direction, (value) => t(value as Trade['direction'])),
      timeframe: buildGroupRows(weekTrades, getPrimaryTimeframe, (value) => value),
      assetType: buildGroupRows(weekTrades, getTradeAssetType, (value) => getAssetTypeLabel(value, isHebrew)),
    }),
    [isHebrew, t, weekTrades],
  );
  const chartRows = useMemo(() => buildChartRows(dayRows), [dayRows]);

  return (
    <section className="min-w-0 rounded-lg border border-border bg-surface p-4 shadow-soft">
      <button
        className="mb-3 grid w-full gap-3 text-start lg:flex lg:items-center lg:justify-between"
        onClick={() => {
          if (typeof onToggle === 'function') onToggle();
        }}
        type="button"
      >
        <div>
          <p className="text-xs font-bold uppercase text-subtle">סיכום שבועי</p>
          <p className="mt-1 text-sm font-semibold text-subtle">
            {selectedRange.start || '-'} - {selectedRange.end || '-'}
          </p>
        </div>
        <span className="flex items-center gap-2 justify-self-start">
          <span className={`rounded-md px-3 py-1 text-sm font-bold ${stats.totalPnl < 0 ? 'bg-dangerSoft text-danger' : stats.totalPnl > 0 ? 'bg-successSoft text-success' : 'bg-muted text-subtle'}`}>
            {formatCurrency(stats.totalPnl + spotStats.realizedPnl)}
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-lg font-bold text-ink">{isOpen ? '-' : '+'}</span>
        </span>
      </button>

      {isOpen ? <div className="grid gap-4">
      {!isSpotOnly ? <SegmentedControl onChange={setSummaryMode} options={modeOptions} value={safeSummaryMode} /> : null}
      {!isSpotOnly ? <div className="grid gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:grid-cols-3">
        <SummaryItem label={isHebrew ? 'שווי בתחילת הטווח' : 'Period start account'} value={formatAccountValue(rangeStartAccountValue?.value)} />
        <SummaryItem label={isHebrew ? 'שווי בסוף הטווח' : 'Period end account'} value={formatAccountValue(rangeEndAccountValue?.value)} />
        <SummaryItem label={isHebrew ? 'רווח/הפסד בטווח' : 'Period P/L'} value={formatSignedMoney(rangePnl)} />
      </div> : null}
      {journalType === 'combined' || journalType === 'spotOnly' ? (
        <div className="grid gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:grid-cols-2 lg:grid-cols-5">
          <SummaryItem label={isHebrew ? 'ספוט רווח/הפסד' : 'Spot realized P/L'} value={formatSignedMoney(spotStats.realizedPnl)} />
          <SummaryItem label={isHebrew ? 'ספוט פתוח' : 'Open Spot'} value={String(spotStats.openCount)} />
          <SummaryItem label={isHebrew ? 'ספוט סגור' : 'Closed Spot'} value={String(spotStats.closedCount)} />
          <SummaryItem label={isHebrew ? 'הון מושקע' : 'Spot invested'} value={formatAccountValue(spotStats.investedCapital)} />
          <SummaryItem label={isHebrew ? 'הון פתוח' : 'Open cost basis'} value={formatAccountValue(spotStats.openCostBasis)} />
        </div>
      ) : null}
      {safeSummaryMode === 'all' && !isSpotOnly ? (
        <div className="grid gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:grid-cols-3">
          {allowedTradeModes.map((mode) => {
            const end = getAccountValueForDate(accountValueResets, calculationTrades, selectedRange.end || selectedRange.start, mode);
            const pnl = getModePnlBetweenDates(calculationTrades, selectedRange.start, selectedRange.end || selectedRange.start, mode);
            return <SummaryItem key={mode} label={t(getModeLabelKey(mode))} value={`${formatAccountValue(end?.value)} (${formatSignedMoney(pnl)})`} />;
          })}
        </div>
      ) : null}
      <div className="grid gap-2 lg:grid-cols-[auto_auto_minmax(0,1fr)] lg:items-end">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setWeekMode('current')} type="button" variant={weekMode === 'current' ? 'primary' : 'secondary'}>
            {isHebrew ? 'שבוע נוכחי' : 'Current week'}
          </Button>
          <Button onClick={() => setWeekMode('previous')} type="button" variant={weekMode === 'previous' ? 'primary' : 'secondary'}>
            {isHebrew ? 'שבוע קודם' : 'Previous week'}
          </Button>
          <Button onClick={() => setWeekMode('custom')} type="button" variant={weekMode === 'custom' ? 'primary' : 'secondary'}>
            {isHebrew ? 'טווח מותאם' : 'Custom range'}
          </Button>
        </div>
        {weekMode === 'custom' ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <TextInput label={isHebrew ? 'תחילת שבוע' : 'Week start'} onChange={(event) => setCustomStart(event.target.value)} type="date" value={customStart} />
            <TextInput label={isHebrew ? 'סיום שבוע' : 'Week end'} onChange={(event) => setCustomEnd(event.target.value)} type="date" value={customEnd} />
          </div>
        ) : null}
      </div>

      {!isSpotOnly ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-9">
        <SummaryItem label={t('trades')} value={String(stats.count)} />
        <SummaryItem label={t('wins')} tone="positive" value={String(stats.wins)} />
        <SummaryItem label={t('losses')} tone="negative" value={String(stats.losses)} />
        <SummaryItem label={t('breakeven')} value={String(stats.breakeven)} />
        <SummaryItem label={t('winRate')} value={formatPercentValue(stats.winRate, { alreadyRatio: true })} />
        <SummaryItem label={t('totalPnl')} value={formatSignedMoney(stats.totalPnl)} />
        <SummaryItem label={t('monthlyRr')} value={stats.count ? stats.averageRr.toFixed(2) : '-'} />
        <SummaryItem label={t('disciplineScore')} value={stats.count ? formatPercentValue(stats.averageDiscipline) : '-'} />
        <SummaryItem label={t('averageTradeDuration')} value={formatDuration(stats.averageDurationMs)} />
      </div> : null}

      {!isSpotOnly ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PerformanceCard label={isHebrew ? 'היום הטוב ביותר' : 'Best trading day'} row={bestTradingDay} value={bestTradingDay ? formatSignedMoney(bestTradingDay.stats.totalPnl) : '-'} />
        <PerformanceCard label={isHebrew ? 'יום הרווח/הפסד החלש ביותר' : 'Worst P/L day'} row={worstTradingDay} value={worstTradingDay ? formatSignedMoney(worstTradingDay.stats.totalPnl) : '-'} />
        <PerformanceCard label={isHebrew ? 'משמעת גבוהה ביותר' : 'Highest discipline day'} row={highestDisciplineDay} value={highestDisciplineDay ? formatPercentValue(highestDisciplineDay.stats.averageDiscipline) : '-'} />
        <PerformanceCard label={isHebrew ? 'יום המשמעת החלש ביותר' : 'Weakest discipline day'} row={lowestDisciplineDay} value={lowestDisciplineDay ? formatPercentValue(lowestDisciplineDay.stats.averageDiscipline) : '-'} />
      </div> : null}

      {!isSpotOnly ? <div className="grid gap-3 xl:grid-cols-2">
        <GroupTable title={isHebrew ? 'לפי אסטרטגיה' : 'By strategy'} rows={groupedRows.strategy} />
        <GroupTable title={isHebrew ? 'לפי כיוון' : 'By direction'} rows={groupedRows.direction} />
        <GroupTable title={isHebrew ? 'לפי טיים פריים' : 'By timeframe'} rows={groupedRows.timeframe} />
        <GroupTable title={isHebrew ? 'לפי סוג נכס' : 'By asset type'} rows={groupedRows.assetType} />
      </div> : null}

      {!isSpotOnly ? <div className="grid gap-3 xl:grid-cols-3">
        <MiniChart title={isHebrew ? 'רווח/הפסד שבועי' : 'P/L over week'} rows={chartRows.pnl} valueSuffix="" />
        <MiniChart title={isHebrew ? 'משמעת שבועית' : 'Discipline over week'} rows={chartRows.discipline} valueSuffix="%" />
        <MiniChart title={isHebrew ? 'מגמת אחוז ניצחון' : 'Win rate trend'} rows={chartRows.winRate} valueSuffix="%" />
      </div> : null}
      </div> : null}
    </section>
  );
}

function SummaryItem({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'positive' | 'negative' | 'open' }) {
  const toneClass =
    tone === 'positive'
      ? 'bg-successSoft text-success'
      : tone === 'negative'
        ? 'bg-dangerSoft text-danger'
        : tone === 'open'
          ? 'bg-yellow-100 text-yellow-800'
          : 'bg-muted text-ink';

  return (
    <div className={`min-w-0 rounded-md p-3 ${toneClass}`}>
      <p className="break-words text-xs font-bold uppercase leading-4 opacity-80">{label}</p>
      <p className="mt-1 break-words text-lg font-bold">{value}</p>
    </div>
  );
}

function PerformanceCard({ label, row, value }: { label: string; row?: DayPerformance; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-bold uppercase text-subtle">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
      <p className="text-sm font-semibold text-subtle">{row?.date ?? '-'}</p>
    </div>
  );
}

function GroupTable({ title, rows }: { title: string; rows: GroupRow[] }) {
  return (
    <section className="rounded-md border border-border bg-background p-3">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      <div className="mt-3 grid gap-2">
        {rows.length ? (
          rows.map((row) => (
            <div className="grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] gap-2 rounded-md bg-muted p-2 text-sm" key={row.id}>
              <span className="truncate font-bold text-ink">{row.label}</span>
              <span className="text-subtle">{row.stats.count}</span>
              <span className={row.stats.totalPnl < 0 ? 'font-bold text-danger' : 'font-bold text-success'}>{formatSignedMoney(row.stats.totalPnl)}</span>
              <span className="font-semibold text-subtle">{formatPercentValue(row.stats.winRate, { alreadyRatio: true })}</span>
            </div>
          ))
        ) : (
          <p className="rounded-md bg-muted p-3 text-sm font-semibold text-subtle">-</p>
        )}
      </div>
    </section>
  );
}

function MiniChart({ title, rows, valueSuffix }: { title: string; rows: Array<{ label: string; value: number; normalized: number }>; valueSuffix: string }) {
  return (
    <section className="rounded-md border border-border bg-background p-3">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      <div className="mt-3 grid gap-2">
        {rows.map((row) => (
          <div className="grid grid-cols-[72px_minmax(0,1fr)_64px] items-center gap-2 text-xs font-semibold" key={row.label}>
            <span className="text-subtle">{row.label.slice(5)}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, row.normalized)}%` }} />
            </span>
            <span className="text-end text-ink">{formatCompactNumber(row.value)}{valueSuffix}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function getSelectedRange(date: string, weekMode: WeekMode, customStart: string, customEnd: string) {
  if (weekMode === 'custom') {
    return {
      start: customStart,
      end: customEnd || customStart,
    };
  }

  const baseDate = date ? new Date(`${date}T00:00:00`) : new Date();
  const start = getWeekStart(baseDate);

  if (weekMode === 'previous') {
    start.setDate(start.getDate() - 7);
  }

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: toDateKey(start),
    end: toDateKey(end),
  };
}

function buildDayRows(trades: Trade[], start?: string, end?: string): DayPerformance[] {
  if (!start || !end) return [];

  const dates = eachDate(start, end);
  return dates.map((date) => ({
    date,
    stats: getTradeStats(trades.filter((trade) => getTradeCloseDate(trade) === date)),
  }));
}

function buildGroupRows(trades: Trade[], getKey: (trade: Trade) => string, getLabel: (value: string) => string): GroupRow[] {
  const grouped = new Map<string, Trade[]>();

  trades.forEach((trade) => {
    const key = getKey(trade) || 'not_set';
    grouped.set(key, [...(grouped.get(key) ?? []), trade]);
  });

  return Array.from(grouped.entries())
    .map(([id, groupedTrades]) => ({
      id,
      label: getLabel(id),
      stats: getTradeStats(groupedTrades),
    }))
    .sort((a, b) => b.stats.count - a.stats.count || b.stats.totalPnl - a.stats.totalPnl);
}

function buildChartRows(dayRows: DayPerformance[]) {
  const pnlValues = dayRows.map((row) => row.stats.totalPnl);
  const disciplineValues = dayRows.map((row) => row.stats.averageDiscipline || 0);
  const winRateValues = dayRows.map((row) => Math.round(row.stats.winRate * 100));

  return {
    pnl: normalizeChartRows(dayRows, pnlValues),
    discipline: normalizeChartRows(dayRows, disciplineValues),
    winRate: normalizeChartRows(dayRows, winRateValues),
  };
}

function normalizeChartRows(dayRows: DayPerformance[], values: number[]) {
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));

  return dayRows.map((row, index) => ({
    label: row.date,
    value: values[index] ?? 0,
    normalized: Math.abs(values[index] ?? 0) / max * 100,
  }));
}

function getPopulatedRows(rows: DayPerformance[]) {
  return rows.filter((row) => row.stats.count > 0);
}

function getBestPnlDay(rows: DayPerformance[]) {
  return getPopulatedRows(rows).reduce<DayPerformance | undefined>((selected, row) => {
    if (!selected) return row;
    return row.stats.totalPnl > selected.stats.totalPnl ? row : selected;
  }, undefined);
}

function getWorstPnlDay(rows: DayPerformance[]) {
  return getPopulatedRows(rows).reduce<DayPerformance | undefined>((selected, row) => {
    if (!selected) return row;
    return row.stats.totalPnl < selected.stats.totalPnl ? row : selected;
  }, undefined);
}

function getHighestDisciplineDay(rows: DayPerformance[]) {
  return getPopulatedRows(rows).reduce<DayPerformance | undefined>((selected, row) => {
    if (!selected) return row;
    return row.stats.averageDiscipline > selected.stats.averageDiscipline ? row : selected;
  }, undefined);
}

function getLowestDisciplineDay(rows: DayPerformance[]) {
  return getPopulatedRows(rows).reduce<DayPerformance | undefined>((selected, row) => {
    if (!selected) return row;
    return row.stats.averageDiscipline < selected.stats.averageDiscipline ? row : selected;
  }, undefined);
}

function getPrimaryTimeframe(trade: Trade) {
  const actualEntry = trade.screenshots.find((screenshot) => screenshot.slotType === 'actual_entry_timeframe');
  return actualEntry?.timeframe || trade.screenshots[0]?.timeframe || 'not_set';
}

function getAssetTypeLabel(value: string, isHebrew: boolean) {
  if (value === 'crypto') return isHebrew ? 'קריפטו' : 'Crypto';
  if (value === 'forex') return isHebrew ? 'מט"ח' : 'Forex';
  return isHebrew ? 'מניה' : 'Stock';
}

function getStrategyLabel(value: string, t: ReturnType<typeof useLanguage>['t']) {
  const option = strategyOptions.find((item) => item.value === value);
  return option ? t(option.labelKey) : value.replace(/_/g, ' ');
}

function getWeekStart(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function eachDate(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  while (cursor.getTime() <= endDate.getTime()) {
    dates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatCurrency(value: number) {
  return formatSignedMoney(value);
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
