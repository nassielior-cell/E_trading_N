'use client';

import { useEffect, useRef, useState } from 'react';

import type { Day, SpotPosition, Trade, TradeMode } from '@/models/journal';
import { formatMonthLabel, getCalendarDays, getDateKey } from '@/lib/dates';
import { useLanguage } from '@/lib/i18n/language-provider';

import { getCategory } from '../config/journal-options';
import { isSpotOpen } from '../utils/spot-status';
import { isSameDate } from '../utils/trade-values';

type CalendarGridProps = {
  days: Record<string, Day>;
  trades: Record<string, Trade>;
  spots?: Record<string, SpotPosition>;
  monthDate: Date;
  selectedDate: string;
  onMonthChange: (date: Date) => void;
  onOpenEntry: (date: string) => void;
  onOpenDayDetails?: (date: string) => void;
  onSelectDate: (date: string) => void;
  allowedModes?: TradeMode[];
};

export function CalendarGrid({
  days,
  trades,
  spots = {},
  monthDate,
  selectedDate,
  onMonthChange,
  onOpenEntry,
  onOpenDayDetails,
  onSelectDate,
  allowedModes = ['live', 'backtesting'],
}: CalendarGridProps) {
  const { t, language } = useLanguage();
  const calendarDays = getCalendarDays(monthDate);
  const [today, setToday] = useState('');
  const lastTapRef = useRef<{ dateKey: string; time: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weekdays = [1, 2, 3, 4, 5, 6, 7].map((day) =>
    new Intl.DateTimeFormat(language, { weekday: 'short' }).format(new Date(2026, 5, day)),
  );

  const changeMonth = (amount: number) => {
    const nextDate = new Date(monthDate);
    nextDate.setMonth(monthDate.getMonth() + amount);
    onMonthChange(nextDate);
  };

  useEffect(() => {
    setToday(getDateKey(new Date()));
  }, []);

  const handleDayClick = (dateKey: string) => {
    const now = Date.now();
    const lastTap = lastTapRef.current;

    onSelectDate(dateKey);

    const allSpots = Object.values(spots);
    const hasSpotItems = allSpots.some((spot) =>
      isSameDate(spot.buyDate, dateKey) ||
      spot.sells.some((sell) => isSameDate(sell.sellDate, dateKey)),
    );

    if (lastTap?.dateKey === dateKey && now - lastTap.time < 350) {
      onOpenEntry(dateKey);
      lastTapRef.current = null;
      return;
    }

    lastTapRef.current = { dateKey, time: now };

    if (hasSpotItems) {
      onOpenDayDetails?.(dateKey);
    }
  };

  const startLongPress = (dateKey: string, pointerType: string) => {
    if (pointerType === 'mouse') {
      return;
    }

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      onSelectDate(dateKey);
      onOpenEntry(dateKey);
    }, 550);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-surface shadow-soft">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-3 sm:px-4">
        <button
          className="rounded-md px-2 py-2 text-sm font-semibold text-subtle hover:bg-muted sm:px-3"
          onClick={() => changeMonth(-1)}
          type="button"
        >
          {t('previous')}
        </button>
        <h2 className="min-w-0 truncate text-center text-base font-bold text-ink sm:text-lg">{formatMonthLabel(monthDate, language)}</h2>
        <button
          className="rounded-md px-2 py-2 text-sm font-semibold text-subtle hover:bg-muted sm:px-3"
          onClick={() => changeMonth(1)}
          type="button"
        >
          {t('next')}
        </button>
      </div>

      <div className="max-w-full overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-[repeat(7,minmax(0,1fr))] border-b border-border bg-muted text-xs font-semibold uppercase text-subtle md:min-w-0">
          {weekdays.map((weekday) => (
            <div className="truncate px-1 py-2 text-center sm:px-3" key={weekday}>
              {weekday}
            </div>
          ))}
        </div>

        <div className="grid min-w-[560px] grid-cols-[repeat(7,minmax(0,1fr))] md:min-w-0">
          {calendarDays.map(({ date, dateKey, isCurrentMonth }) => {
            const day = days[dateKey];
            const metadata = day?.metadata;
            const dayTrades = (day?.tradeIds.map((tradeId) => trades[tradeId]).filter(Boolean) ?? []).filter((trade) => allowedModes.includes(trade.mode));
            const allSpots = Object.values(spots);
            const daySpots = getSpotsOpenedOrSoldOnDate(allSpots, dateKey);
            const spotBuyEvents = daySpots.filter((spot) => isSameDate(spot.buyDate, dateKey));
            const spotSellEvents = daySpots.flatMap((spot) => spot.sells.filter((sell) => isSameDate(sell.sellDate, dateKey)).map((sell) => ({ spot, sell })));
            const openSpotEvents = getOpenSpotsOpenedOnDate(daySpots, dateKey);
            const hasTrades = dayTrades.length > 0;
            const hasSpots = daySpots.length > 0;
            const isSelected = selectedDate === dateKey;
            const dayCategories = metadata?.categoryIds
              .map((categoryId) => getCategory(categoryId))
              .filter((category) => category !== undefined) ?? [];
            const liveTrades = dayTrades.filter((trade) => trade.mode === 'live');
            const backtestingTrades = dayTrades.filter((trade) => trade.mode === 'backtesting');
            const shouldSplitTrading = liveTrades.length > 0 && backtestingTrades.length > 0;
            const background = getCategoryBackground(dayCategories.map((category) => category.color));
            const titleLabel = getDayLabel(dayTrades, spotBuyEvents, spotSellEvents, openSpotEvents, dayCategories, t, language);
            const calendarStats = buildCalendarStats(dayTrades, daySpots, metadata);

            return (
              <div
                className={`calendar-day-cell min-h-20 min-w-0 overflow-hidden border-b border-r border-border p-1 text-left transition hover:bg-blue-50 sm:min-h-28 sm:p-2 ${
                  isSelected ? 'ring-2 ring-inset ring-primary' : ''
                } ${hasTrades || hasSpots ? 'border-t-4 border-t-ink' : ''}`}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleDayClick(dateKey);
                  }
                }}
                key={dateKey}
                onClick={() => handleDayClick(dateKey)}
                onPointerCancel={cancelLongPress}
                onPointerDown={(event) => startLongPress(dateKey, event.pointerType)}
                onPointerLeave={cancelLongPress}
                onPointerUp={cancelLongPress}
                role="button"
                style={{ background }}
                tabIndex={0}
              >
                <div className="grid gap-1">
                  <div className="flex items-start justify-between gap-1">
                  <span
                    className={`calendar-day-number grid h-6 w-6 place-items-center rounded-md text-xs font-bold sm:h-7 sm:w-7 sm:text-sm ${
                      dateKey === today ? 'bg-primary text-white' : 'text-ink'
                    } ${isCurrentMonth ? '' : 'opacity-35'}`}
                  >
                    {date.getDate()}
                  </span>
                  </div>
                  {titleLabel ? (
                    <span className="calendar-entry-badge line-clamp-2 max-h-8 break-words rounded bg-white/70 px-1 py-0.5 text-[9px] font-bold leading-3 text-ink sm:max-h-none sm:text-[10px]">
                      {titleLabel}
                    </span>
                  ) : null}
                </div>

                {shouldSplitTrading ? (
                  <div className="calendar-entry-badge mt-1 grid overflow-hidden rounded border border-border text-[9px] font-bold text-subtle sm:mt-3 sm:text-[10px]">
                    <TradeSection dateKey={dateKey} label={t('liveSection')} onOpenDayDetails={onOpenDayDetails} trades={liveTrades} />
                    <TradeSection dateKey={dateKey} label={t('backtestingSection')} onOpenDayDetails={onOpenDayDetails} trades={backtestingTrades} />
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1 sm:mt-3">
                    {dayTrades.slice(0, 8).map((trade) => (
                      <TradeDot dateKey={dateKey} key={trade.id} onOpenDayDetails={onOpenDayDetails} result={trade.result} status={trade.status} />
                    ))}
                    {dayTrades.length > 8 ? <span className="text-[10px] font-bold text-subtle">+{dayTrades.length - 8}</span> : null}
                    {spotBuyEvents.filter((spot) => !isSpotOpen(spot)).slice(0, 3).map((spot) => <SpotMarker dateKey={dateKey} key={`buy-${spot.id}`} onOpenDayDetails={onOpenDayDetails} tone="buy" />)}
                    {spotSellEvents.slice(0, 3).map(({ spot, sell }) => <SpotMarker dateKey={dateKey} key={`sell-${spot.id}-${sell.id}`} onOpenDayDetails={onOpenDayDetails} tone="sell" />)}
                    {openSpotEvents.slice(0, 3).map((spot) => <SpotMarker dateKey={dateKey} key={`open-${spot.id}`} onOpenDayDetails={onOpenDayDetails} tone="open" />)}
                    {daySpots.some((spot) => !isSpotOpen(spot) && (isSameDate(spot.buyDate, dateKey) || spot.sells.some((sell) => isSameDate(sell.sellDate, dateKey)))) ? (
                      <SpotMarker dateKey={dateKey} onOpenDayDetails={onOpenDayDetails} tone="closed" />
                    ) : null}
                    {metadata?.taskCount && !hasTrades && !hasSpots ? <MarkerButton ariaLabel="Open day details" className="bg-subtle" dateKey={dateKey} onOpenDayDetails={onOpenDayDetails} /> : null}
                  </div>
                )}

                {calendarStats.length ? (
                  <div className="mt-1 hidden flex-wrap gap-1 text-[10px] font-bold text-subtle min-[430px]:flex sm:mt-2">
                    {calendarStats.map((item) => <span key={item}>{item}</span>)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function getCategoryBackground(colors: string[]) {
  if (!colors.length) {
    return 'var(--color-surface)';
  }

  const paleColors = colors.map((color) => `${color}24`);
  const step = 100 / paleColors.length;
  const stops = paleColors.flatMap((color, index) => [
    `${color} ${index * step}%`,
    `${color} ${(index + 1) * step}%`,
  ]);

  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function buildCalendarStats(dayTrades: Trade[], daySpots: SpotPosition[], metadata?: Day['metadata']) {
  if (!metadata) return [];

  return [
    dayTrades.length > 0 ? `${dayTrades.length}T` : '',
    daySpots.length > 0 ? `${daySpots.length}S` : '',
    metadata.taskCount > 0 ? `${metadata.taskCount}K` : '',
    metadata.winCount > 0 ? `${metadata.winCount}W` : '',
    metadata.lossCount > 0 ? `${metadata.lossCount}L` : '',
    metadata.pnl ? String(metadata.pnl) : '',
  ].filter(Boolean);
}

function getSpotsOpenedOrSoldOnDate(spots: SpotPosition[], dateKey: string) {
  return spots.filter((spot) =>
    isSameDate(spot.buyDate, dateKey) ||
    spot.sells.some((sell) => isSameDate(sell.sellDate, dateKey)),
  );
}

function getOpenSpotsOpenedOnDate(spots: SpotPosition[], dateKey: string) {
  return spots.filter((spot) => isSpotOpen(spot) && isSameDate(spot.buyDate, dateKey));
}

function getDayLabel(
  trades: Trade[],
  spotBuyEvents: SpotPosition[],
  spotSellEvents: Array<{ spot: SpotPosition; sell: SpotPosition['sells'][number] }>,
  openSpotEvents: SpotPosition[],
  categories: NonNullable<ReturnType<typeof getCategory>>[],
  t: ReturnType<typeof useLanguage>['t'],
  language: string,
) {
  const firstTrade = trades[0];
  const tradeLabel = firstTrade?.title || (firstTrade ? `${t(firstTrade.mode === 'live' ? 'liveTrade' : 'backtesting')} ${firstTrade.coin}` : '');

  if (tradeLabel && openSpotEvents[0]) {
    const spotLabel = language === 'he' ? `×¡×¤×•×˜ ×¤×ª×•×— ${openSpotEvents[0].assetName}` : `Open Spot ${openSpotEvents[0].assetName}`;
    return `${tradeLabel} / ${spotLabel}`;
  }

  if (tradeLabel && spotBuyEvents[0]) {
    const spotLabel = language === 'he' ? `×§× ×™×™×ª ×¡×¤×•×˜ ${spotBuyEvents[0].assetName}` : `Spot buy ${spotBuyEvents[0].assetName}`;
    return `${tradeLabel} / ${spotLabel}`;
  }

  if (tradeLabel && spotSellEvents[0]) {
    const spotLabel = language === 'he' ? `×ž×›×™×¨×ª ×¡×¤×•×˜ ${spotSellEvents[0].spot.assetName}` : `Spot sell/close ${spotSellEvents[0].spot.assetName}`;
    return `${tradeLabel} / ${spotLabel}`;
  }

  if (tradeLabel) {
    return tradeLabel;
  }

  if (openSpotEvents[0]) {
    return language === 'he' ? `ספוט פתוח ${openSpotEvents[0].assetName}` : `Open Spot ${openSpotEvents[0].assetName}`;
  }

  if (spotBuyEvents[0]) {
    return language === 'he' ? `קניית ספוט ${spotBuyEvents[0].assetName}` : `Spot buy ${spotBuyEvents[0].assetName}`;
  }

  if (spotSellEvents[0]) {
    return language === 'he' ? `מכירת ספוט ${spotSellEvents[0].spot.assetName}` : `Spot sell/close ${spotSellEvents[0].spot.assetName}`;
  }

  if (categories[0]) {
    return t(categories[0].labelKey);
  }

  return '';
}

function TradeSection({ dateKey, label, onOpenDayDetails, trades }: { dateKey: string; label: string; onOpenDayDetails?: (date: string) => void; trades: Trade[] }) {
  return (
    <div className="calendar-split-section flex min-h-6 items-center justify-between gap-1 border-b border-border bg-white/60 px-1.5 py-1 last:border-b-0">
      <span className="truncate">{label}</span>
      <span className="flex flex-wrap justify-end gap-1">
        {trades.slice(0, 4).map((trade) => (
          <TradeDot dateKey={dateKey} key={trade.id} onOpenDayDetails={onOpenDayDetails} result={trade.result} status={trade.status} />
        ))}
      </span>
    </div>
  );
}

function TradeDot({ dateKey, onOpenDayDetails, result, status }: { dateKey: string; onOpenDayDetails?: (date: string) => void; result: Trade['result']; status?: Trade['status'] }) {
  const colorClass =
    status === 'open'
      ? 'bg-yellow-500'
      : result === 'loss'
        ? 'bg-danger'
        : result === 'breakeven'
          ? 'bg-subtle'
          : 'bg-success';

  return <MarkerButton ariaLabel="Open day details" className={colorClass} dateKey={dateKey} onOpenDayDetails={onOpenDayDetails} />;
}

function SpotMarker({ dateKey, onOpenDayDetails, tone }: { dateKey: string; onOpenDayDetails?: (date: string) => void; tone: 'buy' | 'sell' | 'open' | 'closed' }) {
  const colorClass =
    tone === 'buy'
      ? 'bg-teal-600'
      : tone === 'sell'
        ? 'bg-emerald-600'
        : tone === 'open'
          ? 'bg-yellow-500'
          : 'bg-zinc-400';

  return <MarkerButton ariaLabel="Open spot day details" className={colorClass} dateKey={dateKey} onOpenDayDetails={onOpenDayDetails} />;
}

function MarkerButton({ ariaLabel, className, dateKey, onOpenDayDetails }: { ariaLabel: string; className: string; dateKey: string; onOpenDayDetails?: (date: string) => void }) {
  return (
    <button
      aria-label={ariaLabel}
      className={`h-3 w-3 rounded-full ring-offset-1 transition hover:ring-2 hover:ring-primary ${className}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpenDayDetails?.(dateKey);
      }}
      type="button"
    />
  );
}
