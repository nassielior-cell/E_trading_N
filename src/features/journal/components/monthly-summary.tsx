'use client';

import { useMemo, useState } from 'react';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { useLanguage } from '@/lib/i18n/language-provider';
import type { JournalType, SpotPosition, Trade } from '@/models/journal';
import { formatDuration, getTradeStats } from '../utils/statistics';
import { formatAccountValue, formatPercentValue, formatSignedMoney, getAccountValueAtStartOfDate, getAccountValueForDate, getModePnlBetweenDates } from '../utils/account-value';
import type { AccountValueReset } from '../data/journal-repository';
import { getModeLabelKey, getTradeCloseDate, isTradeInMode, type TradeModeFilter } from '../utils/trade-values';
import { getAllowedTradeModes } from '../utils/journal-scope';
import { getSpotStatsForDateRange } from '../utils/spot-values';

type MonthlySummaryProps = {
  accountValueResets: AccountValueReset[];
  monthDate: Date;
  trades: Trade[];
  spots?: SpotPosition[];
  isOpen?: boolean;
  onToggle?: () => void;
  journalType: JournalType;
};

export function MonthlySummary({ accountValueResets, monthDate, trades, spots = [], isOpen = true, onToggle, journalType }: MonthlySummaryProps) {
  const { language, t } = useLanguage();
  const isHebrew = language === 'he';
  const [summaryMode, setSummaryMode] = useState<TradeModeFilter>('all');
  const allowedTradeModes = useMemo(() => getAllowedTradeModes(journalType), [journalType]);
  const safeSummaryMode = summaryMode !== 'all' && !allowedTradeModes.includes(summaryMode) ? 'all' : summaryMode;
  const month = monthDate.getMonth();
  const year = monthDate.getFullYear();
  const modeOptions = [
    { value: 'all' as const, label: t('all') },
    ...allowedTradeModes.map((mode) => ({ value: mode, label: t(getModeLabelKey(mode)) })),
  ];
  const selectedMode = safeSummaryMode === 'all' ? undefined : safeSummaryMode;
  const calculationTrades = useMemo(() => (isOpen ? trades : []), [isOpen, trades]);
  const monthTrades = useMemo(
    () =>
      calculationTrades.filter((trade) => {
        const tradeDateKey = getTradeCloseDate(trade);
        if (!tradeDateKey) return false;
        const date = new Date(`${tradeDateKey}T00:00:00`);
        return isTradeInMode(trade, safeSummaryMode) && date.getMonth() === month && date.getFullYear() === year;
      }),
    [calculationTrades, month, safeSummaryMode, year],
  );
  const stats = useMemo(() => getTradeStats(monthTrades), [monthTrades]);
  const monthStartDate = getMonthStartDateKey(year, month);
  const monthEndDate = getMonthEndDateKey(year, month);
  const spotStats = useMemo(() => getSpotStatsForDateRange(spots, monthStartDate, monthEndDate), [monthEndDate, monthStartDate, spots]);
  const isSpotOnly = journalType === 'spotOnly';
  const monthStartAccountValue = useMemo(
    () => selectedMode ? getAccountValueAtStartOfDate(accountValueResets, calculationTrades, monthStartDate, selectedMode) : undefined,
    [accountValueResets, calculationTrades, monthStartDate, selectedMode],
  );
  const monthEndAccountValue = useMemo(
    () => selectedMode ? getAccountValueForDate(accountValueResets, calculationTrades, monthEndDate, selectedMode) : undefined,
    [accountValueResets, calculationTrades, monthEndDate, selectedMode],
  );
  const monthPnl = useMemo(
    () =>
      selectedMode
        ? getModePnlBetweenDates(calculationTrades, monthStartDate, monthEndDate, selectedMode)
        : allowedTradeModes.reduce((sum, mode) => sum + getModePnlBetweenDates(calculationTrades, monthStartDate, monthEndDate, mode), 0),
    [allowedTradeModes, calculationTrades, monthEndDate, monthStartDate, selectedMode],
  );

  return (
    <section className="min-w-0 rounded-lg border border-border bg-surface p-4 shadow-soft">
      <button
        className="mb-3 flex w-full flex-wrap items-center justify-between gap-2 text-start"
        onClick={() => {
          if (typeof onToggle === 'function') onToggle();
        }}
        type="button"
      >
        <p className="text-xs font-bold uppercase text-subtle">סיכום חודשי</p>
        <span className="flex items-center gap-2">
          <span className={`rounded-md px-3 py-1 text-sm font-bold ${stats.totalPnl < 0 ? 'bg-dangerSoft text-danger' : stats.totalPnl > 0 ? 'bg-successSoft text-success' : 'bg-muted text-subtle'}`}>
            {formatCurrency(stats.totalPnl + spotStats.realizedPnl)}
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-lg font-bold text-ink">{isOpen ? '-' : '+'}</span>
        </span>
      </button>
      {isOpen ? <div className="grid gap-3">
        {!isSpotOnly ? <SegmentedControl onChange={setSummaryMode} options={modeOptions} value={safeSummaryMode} /> : null}
        {!isSpotOnly ? <div className="grid gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:grid-cols-3">
          <SummaryItem label={isHebrew ? 'שווי בתחילת החודש' : 'Month start account'} value={formatAccountValue(monthStartAccountValue?.value)} />
          <SummaryItem label={isHebrew ? 'שווי בסוף החודש' : 'Month end account'} value={formatAccountValue(monthEndAccountValue?.value)} />
          <SummaryItem label={isHebrew ? 'רווח/הפסד בחודש' : 'Month P/L'} value={formatSignedMoney(monthPnl)} />
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
              const end = getAccountValueForDate(accountValueResets, calculationTrades, monthEndDate, mode);
              const pnl = getModePnlBetweenDates(calculationTrades, monthStartDate, monthEndDate, mode);
              return <SummaryItem key={mode} label={t(getModeLabelKey(mode))} value={`${formatAccountValue(end?.value)} (${formatSignedMoney(pnl)})`} />;
            })}
          </div>
        ) : null}
        {!isSpotOnly ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-8">
          <SummaryItem label={t('trades')} value={String(stats.count)} />
          <SummaryItem label={t('wins')} tone="positive" value={String(stats.wins)} />
          <SummaryItem label={t('losses')} tone="negative" value={String(stats.losses)} />
          <SummaryItem label={t('openTrade')} tone="open" value={String(stats.open)} />
          <SummaryItem label={t('monthlyRr')} value={stats.count ? stats.averageRr.toFixed(2) : '-'} />
          <SummaryItem label={t('winRate')} value={formatPercentValue(stats.winRate, { alreadyRatio: true })} />
          <SummaryItem label={t('disciplineScore')} value={stats.count ? formatPercentValue(stats.averageDiscipline) : '-'} />
          <SummaryItem label={t('averageTradeDuration')} value={formatDuration(stats.averageDurationMs)} />
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

function formatCurrency(value: number) {
  return formatSignedMoney(value);
}

function getMonthStartDateKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function getMonthEndDateKey(year: number, month: number) {
  const end = new Date(year, month + 1, 0);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
}
