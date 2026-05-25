'use client';

import { useEffect, useMemo, useState } from 'react';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { getTodayDateKey } from '@/lib/dates';
import { useLanguage } from '@/lib/i18n/language-provider';
import type { JournalType, SpotPosition, SpotStatus, Trade, TradeMode } from '@/models/journal';

import type { AccountValueReset } from '../data/journal-repository';
import { formatAccountValue, formatPercentValue, formatSignedMoney, getAccountValueAtStartOfDate, getAccountValueForDate, getCurrentAccountValue, getModePnlBetweenDates } from '../utils/account-value';
import { formatDuration, getTradeStats } from '../utils/statistics';
import { getSpotStatsForDateRange } from '../utils/spot-values';
import { getSpotLifecycleStatus, getSpotRemainingQuantity, isSpotOpen } from '../utils/spot-status';
import { getModeLabelKey, getTradeCloseDate, isTradeInMode, type TradeModeFilter } from '../utils/trade-values';
import { getAllowedTradeModes, isSpotAllowed } from '../utils/journal-scope';

type SummaryFilter = TradeModeFilter | 'spot';
type SinglePurposeSummaryFilter = Exclude<SummaryFilter, 'all'>;

type DailyDashboardProps = {
  date: string;
  trades: Trade[];
  allTrades: Trade[];
  spots?: SpotPosition[];
  accountValueResets: AccountValueReset[];
  onOpenTrade: (trade: Trade) => void;
  onOpenSpot?: (spot: SpotPosition) => void;
  isOpen?: boolean;
  onToggle?: () => void;
  showOpenTrades?: boolean;
  journalType: JournalType;
};

export function DailyDashboard({
  date,
  allTrades,
  spots = [],
  accountValueResets,
  onOpenTrade,
  onOpenSpot,
  isOpen = true,
  onToggle,
  showOpenTrades = true,
  journalType,
}: DailyDashboardProps) {
  const { language, t } = useLanguage();
  const [summaryMode, setSummaryMode] = useState<SummaryFilter>(journalType === 'spotOnly' ? 'spot' : 'all');
  const [isClientReady, setIsClientReady] = useState(false);
  const isHebrew = language === 'he';
  const allowedTradeModes = useMemo(() => getAllowedTradeModes(journalType), [journalType]);
  const hasSpot = isSpotAllowed(journalType);
  const isCombinedJournal = journalType === 'combined';
  const singlePurposeMode = useMemo(() => getSinglePurposeSummaryMode(journalType), [journalType]);
  const safeSummaryMode: SummaryFilter =
    singlePurposeMode ??
    (summaryMode === 'spot'
      ? hasSpot ? 'spot' : 'all'
      : summaryMode !== 'all' && !allowedTradeModes.includes(summaryMode as TradeMode)
        ? journalType === 'spotOnly' ? 'spot' : 'all'
        : summaryMode);
  const safeAllTrades = useMemo(() => (isClientReady ? allTrades : []), [allTrades, isClientReady]);
  const safeTrades = useMemo(
    () => safeSummaryMode === 'spot' ? [] : safeAllTrades.filter((trade) => isTradeInMode(trade, safeSummaryMode) && getTradeCloseDate(trade) === date),
    [date, safeAllTrades, safeSummaryMode],
  );
  const stats = useMemo(() => getTradeStats(safeTrades), [safeTrades]);
  const spotStats = useMemo(() => getSpotStatsForDateRange(spots, date, date), [date, spots]);
  const selectedMode = safeSummaryMode === 'all' || safeSummaryMode === 'spot' ? undefined : safeSummaryMode;
  const accountValueStart = selectedMode ? getAccountValueAtStartOfDate(accountValueResets, safeAllTrades, date, selectedMode) : undefined;
  const accountValueEnd = selectedMode ? getAccountValueForDate(accountValueResets, safeAllTrades, date, selectedMode) : undefined;
  const currentAccountValue = selectedMode ? getCurrentAccountValue(accountValueResets, safeAllTrades, selectedMode) : undefined;
  const tradeDayPnl = selectedMode
    ? getModePnlBetweenDates(safeAllTrades, date, date, selectedMode)
    : allowedTradeModes.reduce((sum, mode) => sum + getModePnlBetweenDates(safeAllTrades, date, date, mode), 0);
  const dayPnl = tradeDayPnl + (hasSpot && (safeSummaryMode === 'all' || safeSummaryMode === 'spot') ? spotStats.realizedPnl : 0);
  const isFutureDate = date > getTodayDateKey();
  const warnings = useMemo(() => safeSummaryMode === 'spot' ? [] : buildWarnings(safeTrades, isHebrew), [isHebrew, safeSummaryMode, safeTrades]);
  const modeOptions = [
    { value: 'all' as const, label: t('all') },
    ...allowedTradeModes.map((mode) => ({ value: mode, label: t(getModeLabelKey(mode)) })),
    ...(hasSpot ? [{ value: 'spot' as const, label: isHebrew ? 'ספוט' : 'Spot' }] : []),
  ];
  const journalLabel = getDashboardJournalLabel(journalType, isHebrew);
  const summaryModeLabel = getSummaryModeLabel(safeSummaryMode, isHebrew, t);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  useEffect(() => {
    setSummaryMode(journalType === 'spotOnly' ? 'spot' : 'all');
  }, [journalType]);

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft">
        <button className="flex flex-wrap items-center justify-between gap-3 text-start" onClick={onToggle} type="button">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-subtle">{isHebrew ? 'סיכום יומי' : 'Daily summary'}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-ink">{date}</h2>
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-ink">{journalLabel}</span>
            </div>
          </div>
          <span className="flex items-center gap-2">
            <span className={`rounded-md px-3 py-1 text-sm font-bold ${dayPnl < 0 ? 'bg-dangerSoft text-danger' : dayPnl > 0 ? 'bg-successSoft text-success' : 'bg-muted text-subtle'}`}>
              {formatSignedMoney(dayPnl)}
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-lg font-bold text-ink">{isOpen ? '-' : '+'}</span>
          </span>
        </button>

        {isOpen ? (
          <div className="grid gap-3">
            {isCombinedJournal ? (
              <SegmentedControl onChange={setSummaryMode} options={modeOptions} value={safeSummaryMode} />
            ) : (
              <div className="inline-flex w-fit max-w-full rounded-md bg-muted px-3 py-2 text-sm font-bold text-ink">
                {summaryModeLabel}
              </div>
            )}

            {safeSummaryMode !== 'spot' ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                  <Metric label={t('trades')} value={String(stats.count)} />
                  <Metric label={t('wins')} value={String(stats.wins)} tone="positive" />
                  <Metric label={t('losses')} value={String(stats.losses)} tone="negative" />
                  <Metric label={t('breakeven')} value={String(stats.breakeven)} />
                  <Metric label={t('openTrade')} value={String(stats.open)} tone="open" />
                  <Metric label={t('monthlyRr')} value={formatNumber(stats.averageRr)} />
                  <Metric label={t('disciplineScore')} value={stats.count ? formatPercentValue(stats.averageDiscipline) : '-'} />
                  <Metric label={isHebrew ? 'משך ממוצע' : 'Avg duration'} value={formatDuration(stats.averageDurationMs)} />
                </div>
                {selectedMode ? (
                  <div className="grid gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:grid-cols-4">
                    <SmallField label={isHebrew ? 'תחילת יום' : 'Start of day'} value={formatAccountValue(accountValueStart?.value)} />
                    <SmallField label={isHebrew ? 'אחרי טריידים' : 'After day trades'} value={formatAccountValue(accountValueEnd?.value)} />
                    <SmallField label={isHebrew ? 'רווח/הפסד יומי' : 'Day P/L'} value={formatSignedMoney(tradeDayPnl)} />
                    <SmallField label={isHebrew ? 'שווי נוכחי' : 'Current/latest'} value={isFutureDate ? formatAccountValue(currentAccountValue?.value) : formatAccountValue(accountValueEnd?.value)} />
                  </div>
                ) : null}
                {safeSummaryMode === 'all' && allowedTradeModes.length ? (
                  <div className="grid gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:grid-cols-3">
                    {allowedTradeModes.map((mode) => {
                      const end = getAccountValueForDate(accountValueResets, safeAllTrades, date, mode);
                      const pnl = getModePnlBetweenDates(safeAllTrades, date, date, mode);
                      return <SmallField key={mode} label={t(getModeLabelKey(mode))} value={`${formatAccountValue(end?.value)} (${formatSignedMoney(pnl)})`} />;
                    })}
                  </div>
                ) : null}
              </>
            ) : null}

            {(safeSummaryMode === 'all' || safeSummaryMode === 'spot') && hasSpot ? <SpotSummaryGrid isHebrew={isHebrew} stats={spotStats} /> : null}
          </div>
        ) : null}
      </section>

      {isOpen && warnings.length ? (
        <section className="grid gap-2 sm:grid-cols-3">
          {warnings.map((warning) => (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm font-semibold text-yellow-800" key={warning}>
              {warning}
            </div>
          ))}
        </section>
      ) : null}

      {showOpenTrades ? <OpenTradesPanel allTrades={safeAllTrades} journalType={journalType} onOpenSpot={onOpenSpot} onOpenTrade={onOpenTrade} spots={spots} /> : null}
    </div>
  );
}

export function OpenTradesPanel({
  allTrades,
  spots = [],
  onOpenTrade,
  onOpenSpot,
  journalType = 'combined',
}: {
  allTrades: Trade[];
  spots?: SpotPosition[];
  onOpenTrade: (trade: Trade) => void;
  onOpenSpot?: (spot: SpotPosition) => void;
  journalType?: JournalType;
}) {
  const { language, t } = useLanguage();
  const [isClientReady, setIsClientReady] = useState(false);
  const isHebrew = language === 'he';
  const showTrades = journalType !== 'spotOnly';
  const showSpots = isSpotAllowed(journalType);
  const openTrades = useMemo(
    () => (isClientReady ? allTrades : []).filter((trade) => trade.status === 'open').sort((a, b) => `${a.entryDate} ${a.entryTime}`.localeCompare(`${b.entryDate} ${b.entryTime}`)),
    [allTrades, isClientReady],
  );
  const openSpots = useMemo(
    () => spots.filter(isSpotOpen).sort((a, b) => `${a.buyDate} ${a.buyTime ?? ''}`.localeCompare(`${b.buyDate} ${b.buyTime ?? ''}`)),
    [spots],
  );

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">
          {showTrades && showSpots ? (isHebrew ? 'פוזיציות פתוחות' : 'Open Positions') : showSpots ? (isHebrew ? 'פוזיציות ספוט פתוחות' : 'Open Spot Positions') : (isHebrew ? 'פוזיציות פיוצרס פתוחות' : 'Open Futures Positions')}
        </h2>
        <span className="rounded-md bg-yellow-100 px-2 py-1 text-xs font-bold uppercase text-yellow-800">
          {(showTrades ? openTrades.length : 0) + (showSpots ? openSpots.length : 0)}
        </span>
      </div>

      {showTrades && openTrades.length ? (
        <div className="grid gap-2 lg:grid-cols-2">
          {openTrades.map((trade) => {
            const duration = getOpenDuration(trade);
            return (
              <button className="grid gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-start transition hover:bg-yellow-100" key={trade.id} onClick={() => onOpenTrade(trade)} type="button">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-ink"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-yellow-500" />{trade.coin} · {t(trade.direction)}</span>
                  <span className="rounded bg-yellow-100 px-2 py-1 text-xs font-bold text-yellow-800">{t('openTrade')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-subtle sm:grid-cols-4">
                  <SmallField label={t('entryTime')} value={`${trade.entryDate} ${trade.entryTime}`} />
                  <SmallField label={isHebrew ? 'משך פתיחה' : 'Open duration'} value={duration.label} />
                  <SmallField label={t('pnl')} value={formatSignedMoney(trade.pnl)} />
                  <SmallField label={t('calculatedRr')} value={formatNumber(trade.rr ?? 0)} />
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {showSpots && openSpots.length ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-bold uppercase text-subtle">{isHebrew ? 'ספוט פתוח' : 'Open Spot Positions'}</h3>
          <div className="grid gap-2 lg:grid-cols-2">
          {openSpots.map((spot) => {
            const status = getSpotLifecycleStatus(spot);
            const remainingQuantity = getSpotRemainingQuantity(spot);

            return (
            <button className="grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-start transition hover:bg-amber-100" key={spot.id} onClick={() => onOpenSpot?.(spot)} type="button">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-ink"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />{isHebrew ? 'ספוט פתוח' : 'Open Spot'} · {spot.assetName}</span>
                <span className={`rounded px-2 py-1 text-xs font-bold ${status === 'open' ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'}`}>{getSpotStatusLabel(status, isHebrew)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-subtle sm:grid-cols-4">
                <SmallField label={isHebrew ? 'נקנה' : 'Bought'} value={`${spot.buyDate} ${spot.buyTime || ''}`} />
                <SmallField label={isHebrew ? 'כמות נשארה' : 'Remaining'} value={String(remainingQuantity)} />
                <SmallField label={isHebrew ? 'בסיס פתוח' : 'Open cost'} value={formatAccountValue(spot.quantityBought > 0 ? (remainingQuantity / spot.quantityBought) * spot.expectedBuyCost : 0)} />
                <SmallField label={t('pnl')} value={formatSignedMoney(spot.realizedPnl)} />
              </div>
            </button>
            );
          })}
          </div>
        </div>
      ) : null}

      {(!showTrades || !openTrades.length) && (!showSpots || !openSpots.length) ? (
        <p className="rounded-md bg-muted p-3 text-sm font-semibold text-subtle">{isHebrew ? 'אין פוזיציות פתוחות כרגע' : 'No open positions right now'}</p>
      ) : null}
    </section>
  );
}

function SpotSummaryGrid({ isHebrew, stats }: { isHebrew: boolean; stats: ReturnType<typeof getSpotStatsForDateRange> }) {
  return (
    <div className="grid gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:grid-cols-2 lg:grid-cols-5">
      <SmallField label={isHebrew ? 'ספוט רווח/הפסד' : 'Spot realized P/L'} value={formatSignedMoney(stats.realizedPnl)} />
      <SmallField label={isHebrew ? 'ספוט פתוח' : 'Open Spot'} value={String(stats.openCount)} />
      <SmallField label={isHebrew ? 'ספוט סגור' : 'Closed Spot'} value={String(stats.closedCount)} />
      <SmallField label={isHebrew ? 'הון מושקע' : 'Spot invested'} value={formatAccountValue(stats.investedCapital)} />
      <SmallField label={isHebrew ? 'הון פתוח' : 'Open cost basis'} value={formatAccountValue(stats.openCostBasis)} />
    </div>
  );
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'positive' | 'negative' | 'open' }) {
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
      <p className="break-words text-xs font-bold uppercase opacity-80">{label}</p>
      <p className="mt-1 break-words text-lg font-bold">{value}</p>
    </div>
  );
}

function SmallField({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded bg-white/70 p-2">
      <span className="block break-words text-[11px] font-bold uppercase text-subtle">{label}</span>
      <span className="break-words font-semibold text-ink">{value}</span>
    </span>
  );
}

function buildWarnings(trades: Trade[], isHebrew: boolean) {
  if (!trades.length) return [];

  const averageDiscipline = average(trades.map((trade) => trade.disciplineScore));
  const violationCount = trades.reduce((sum, trade) => sum + trade.ruleViolations.length, 0);
  const emotionalTrades = trades.filter((trade) =>
    ['stressed', 'anxious', 'frustrated', 'greedy', 'fearful', 'tired'].includes(trade.emotion_before) ||
    (trade.emotion_after && ['stressed', 'anxious', 'frustrated', 'greedy', 'fearful', 'tired'].includes(trade.emotion_after))
  ).length;
  const warnings: string[] = [];

  if (averageDiscipline < 70) warnings.push(isHebrew ? 'זוהתה משמעת נמוכה' : 'Low discipline detected');
  if (violationCount >= 3 || violationCount / trades.length >= 1) warnings.push(isHebrew ? 'יותר מדי הפרות כללים' : 'Too many rule violations');
  if (emotionalTrades / trades.length >= 0.5) warnings.push(isHebrew ? 'מסחר רגשי גבוה' : 'High emotional trading');

  return warnings;
}

function getSinglePurposeSummaryMode(journalType: JournalType): SinglePurposeSummaryFilter | undefined {
  if (journalType === 'liveOnly') return 'live';
  if (journalType === 'backtestingOnly') return 'backtesting';
  if (journalType === 'spotOnly') return 'spot';
  return undefined;
}

function getDashboardJournalLabel(journalType: JournalType, isHebrew: boolean) {
  if (journalType === 'liveOnly') return isHebrew ? 'יומן פיוצרס' : 'Futures Journal';
  if (journalType === 'backtestingOnly') return isHebrew ? 'יומן בק-טסטינג' : 'Backtesting Journal';
  if (journalType === 'spotOnly') return isHebrew ? 'יומן ספוט' : 'Spot Journal';
  return isHebrew ? 'יומן כללי' : 'Combined Journal';
}

function getSummaryModeLabel(mode: SummaryFilter, isHebrew: boolean, t: (key: ReturnType<typeof getModeLabelKey>) => string) {
  if (mode === 'spot') return isHebrew ? 'ספוט' : 'Spot';
  return t(getModeLabelKey(mode));
}

function getOpenDuration(trade: Trade) {
  const openedAt = new Date(`${trade.entryDate}T${trade.entryTime || '00:00'}:00`);
  const diffMs = Math.max(0, Date.now() - openedAt.getTime());
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return { hours, label: `${days}d ${hours % 24}h` };
  }

  return { hours, label: `${hours}h ${minutes}m` };
}

function average(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length : 0;
}

function formatNumber(value: number) {
  return value.toFixed(2);
}

function getSpotStatusLabel(status: SpotStatus, isHebrew: boolean) {
  if (!isHebrew) {
    if (status === 'partially_sold') return 'Partially Sold';
    if (status === 'closed') return 'Closed';
    return 'Open';
  }

  if (status === 'partially_sold') return 'נמכר חלקית';
  if (status === 'closed') return 'סגור';
  return 'פתוח';
}
