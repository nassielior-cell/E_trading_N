'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { getTodayDateKey } from '@/lib/dates';
import { useLanguage } from '@/lib/i18n/language-provider';
import type { Day, ScreenshotSlot, SpotPosition, Task, Trade } from '@/models/journal';

import {
  adherenceOptions,
  getCategory,
  emotionOptions,
  ruleViolationOptions,
  screenshotSlotOptions,
  strategyOptions,
  taskTypeOptions,
  tradeModeOptions,
  tradeResultOptions,
} from '../config/journal-options';
import { useJournalStore } from '../store/journal-store';
import { formatAccountValue, formatMoney, formatPercentValue, formatSignedMoney, getAccountValueAtStartOfDate, getAccountValueForDate, getCurrentAccountValue, getLivePnlForDate } from '../utils/account-value';
import { getModeLabelKey, getTradeCloseDate, isTradeInMode, type TradeModeFilter } from '../utils/trade-values';
import { getAllowedTradeModes } from '../utils/journal-scope';
import { getSpotLifecycleStatus, getSpotRemainingQuantity, isSpotOpen } from '../utils/spot-status';

type DayDetailsProps = {
  date: string;
  day?: Day;
  tasks: Task[];
  trades: Trade[];
  spots?: SpotPosition[];
  isViewOnly?: boolean;
  onEditTask: (task: Task) => void;
  onEditTrade: (trade: Trade) => void;
  onEditSpot?: (spot: SpotPosition) => void;
};

export function DayDetails({ date, day, tasks, trades, spots = [], isViewOnly = false, onEditTask, onEditTrade, onEditSpot }: DayDetailsProps) {
  const { t } = useLanguage();
  const [capitalMode, setCapitalMode] = useState<TradeModeFilter>('all');
  const accountValueResets = useJournalStore((state) => state.accountValueResets);
  const tradesById = useJournalStore((state) => state.trades);
  const journalType = useJournalStore((state) => state.journalType);
  const allowedTradeModes = useMemo(() => getAllowedTradeModes(journalType), [journalType]);
  const allTrades = useMemo(() => Object.values(tradesById), [tradesById]);
  const metadata = day?.metadata;
  const [detailTrade, setDetailTrade] = useState<Trade | undefined>();
  const [detailTask, setDetailTask] = useState<Task | undefined>();
  const safeCapitalMode = capitalMode !== 'all' && !allowedTradeModes.includes(capitalMode) ? 'all' : capitalMode;
  const selectedMode = safeCapitalMode === 'all' ? undefined : safeCapitalMode;
  const displayTrades = trades.filter((trade) => allowedTradeModes.includes(trade.mode) && isTradeInMode(trade, safeCapitalMode));
  const selectedAccountValue = selectedMode ? getAccountValueForDate(accountValueResets, allTrades, date, selectedMode) : undefined;
  const startAccountValue = selectedMode ? getAccountValueAtStartOfDate(accountValueResets, allTrades, date, selectedMode) : undefined;
  const currentAccountValue = selectedMode ? getCurrentAccountValue(accountValueResets, allTrades, selectedMode) : undefined;
  const dayLivePnl = selectedMode
    ? getLivePnlForDate(allTrades, date, selectedMode)
    : allowedTradeModes.reduce((sum, mode) => sum + getLivePnlForDate(allTrades, date, mode), 0);
  const currentOrSelectedAccountValue = date > getTodayDateKey() ? currentAccountValue : selectedAccountValue;

  const getOptionLabel = (value: string | undefined, options: { value: string; labelKey: Parameters<typeof t>[0] }[]) => {
    const option = options.find((item) => item.value === value);
    return option ? t(option.labelKey) : '-';
  };

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-surface shadow-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase text-subtle">{t('selectedDay')}</p>
          <h2 className="text-lg font-bold text-ink">{date}</h2>
        </div>
        <select className="min-h-9 rounded-md border border-border bg-white px-2 py-1 text-xs font-bold text-ink" onChange={(event) => setCapitalMode(event.target.value as TradeModeFilter)} value={safeCapitalMode}>
          <option value="all">{t('all')}</option>
          {allowedTradeModes.map((mode) => <option key={mode} value={mode}>{t(getModeLabelKey(mode))}</option>)}
        </select>
        <div className="flex flex-wrap gap-2 text-xs font-bold text-subtle">
          <Metric label={t('trades')} value={displayTrades.length} />
          <Metric label="Spot" value={spots.length} />
          <Metric label={t('tasks')} value={metadata?.taskCount ?? 0} />
          <Metric label={t('wins')} value={displayTrades.filter((trade) => trade.result === 'win').length} />
          <Metric label={t('losses')} value={displayTrades.filter((trade) => trade.result === 'loss').length} />
          <Metric label={t('pnl')} value={formatSignedMoney(dayLivePnl)} />
          <Metric label={t('startingAccountValue')} value={formatAccountValue(startAccountValue?.value)} />
          <Metric label={t('currentAccountValue')} value={formatAccountValue(selectedAccountValue?.value)} />
          <Metric label={t('totalPnl')} value={formatSignedMoney(dayLivePnl)} />
          <Metric label={t('currentAccountValue')} value={formatAccountValue(currentOrSelectedAccountValue?.value)} />
        </div>
      </div>

      <div className="grid gap-3 p-3 md:hidden">
        {displayTrades.map((trade) => {
          const category = getCategory(trade.categoryId);
          return (
            <div className={`rounded-md border p-3 font-semibold ${getTradeSurfaceClass(trade)}`} key={trade.id} onClick={() => setDetailTrade(trade)} role="button" tabIndex={0}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-subtle">
                    {trade.entryDate} - {trade.entryTime}
                  </p>
                  <h3 className="break-words text-base font-bold text-ink">
                    {trade.title || `${getOptionLabel(trade.mode, tradeModeOptions)} ${trade.coin}`}
                  </h3>
                </div>
                {!isViewOnly ? (
                  <button
                    className="shrink-0 rounded-md bg-muted px-3 py-2 text-xs font-bold text-ink"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditTrade(trade);
                    }}
                    type="button"
                  >
                    {isLockedTrade(trade)
                      ? t('view')
                      : t('edit')}
                  </button>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-subtle">
                <MobileField label={t('type')} value={getOptionLabel(trade.mode, tradeModeOptions)} />
                <MobileField label={t('symbol')} value={trade.coin} />
                <MobileField label={t('direction')} value={trade.direction} />
                <MobileField label={t('strategy')} value={getOptionLabel(trade.strategyId, strategyOptions)} />
                <MobileField label={t('result')} value={getOptionLabel(trade.result, tradeResultOptions)} />
                <MobileField label={t('pnl')} value={formatSignedMoney(trade.pnl)} />
                <MobileField label={t('calculatedRr')} value={trade.rr?.toFixed(2) ?? '-'} />
                <MobileField label="Account $" value={formatAccountValue(getAccountValueForDate(accountValueResets, allTrades, getTradeCloseDate(trade) ?? trade.entryDate, trade.mode)?.value)} />
                <MobileField label={t('disciplineScoreValue')} value={formatPercentValue(trade.disciplineScore)} />
                <MobileField label={t('screenshotsSummary')} value={String(trade.screenshots.length)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {category ? <CategoryPill color={category.color} label={t(category.labelKey)} /> : null}
                <StatusPill isLocked={isLockedTrade(trade)} label={trade.status === 'open' ? t('openTrade') : t('closed')} status={trade.status} />
                <ResultPill label={getOptionLabel(trade.result, tradeResultOptions)} result={trade.result} />
                <DisciplinePill label={t('disciplineScoreValue')} score={trade.disciplineScore} />
              </div>
              {trade.notes || trade.improvements ? (
                <p className="mt-3 break-words text-sm text-subtle">
                  {[trade.notes, trade.improvements].filter(Boolean).join(' / ')}
                </p>
              ) : null}
            </div>
          );
        })}

        {tasks.map((task) => {
          const category = getCategory(task.categoryId);
          return (
            <div className="rounded-md border border-border bg-background p-3" key={task.id} onClick={() => setDetailTask(task)} role="button" tabIndex={0}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-subtle">
                    {[task.startTime, task.endTime].filter(Boolean).join(' - ') || date}
                  </p>
                  <h3 className="break-words text-base font-bold text-ink">{task.title}</h3>
                </div>
                {!isViewOnly ? (
                  <button
                    className="shrink-0 rounded-md bg-muted px-3 py-2 text-xs font-bold text-ink"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditTask(task);
                    }}
                    type="button"
                  >
                    {t('edit')}
                  </button>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {category ? <CategoryPill color={category.color} label={t(category.labelKey)} /> : null}
                <span className="rounded bg-muted px-2 py-1 text-xs font-bold text-subtle">
                  {getOptionLabel(task.taskType, taskTypeOptions)}
                </span>
              </div>
              {task.notes ? <p className="mt-3 break-words text-sm text-subtle">{task.notes}</p> : null}
            </div>
          );
        })}

        {spots.map((spot) => (
          <div className="rounded-md border border-border bg-background p-3" key={spot.id} onClick={() => onEditSpot?.(spot)} role={onEditSpot ? 'button' : undefined} tabIndex={onEditSpot ? 0 : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-subtle">{spot.buyDate} {spot.buyTime || ''}</p>
                <h3 className="break-words text-base font-bold text-ink">Spot {spot.assetName}</h3>
              </div>
              {!isViewOnly && onEditSpot ? (
                <button className="shrink-0 rounded-md bg-muted px-3 py-2 text-xs font-bold text-ink" onClick={() => onEditSpot(spot)} type="button">
                  {t('edit')}
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-subtle">
              <MobileField label="Status" value={getSpotLifecycleStatus(spot).replace('_', ' ')} />
              <MobileField label="Qty" value={`${getSpotRemainingQuantity(spot)} / ${spot.quantityBought}`} />
              <MobileField label="Invested" value={formatMoney(spot.expectedBuyCost)} />
              <MobileField label={t('pnl')} value={formatSignedMoney(spot.realizedPnl)} />
            </div>
          </div>
        ))}

        {tasks.length === 0 && displayTrades.length === 0 && spots.length === 0 ? (
          <p className="rounded-md bg-muted p-4 text-sm text-subtle">{t('noEntries')}</p>
        ) : null}
      </div>

      <div className="hidden max-w-full overflow-x-auto md:block">
        <table className="w-full min-w-[1120px] border-collapse text-sm">
          <thead className="whitespace-nowrap bg-muted text-left text-xs uppercase text-subtle">
            <tr>
              <th className="px-4 py-3">{t('entryDate')}</th>
              <th className="px-4 py-3">{t('entryTime')}</th>
              <th className="px-4 py-3">{t('type')}</th>
              <th className="px-4 py-3">{t('title')}</th>
              <th className="px-4 py-3">{t('category')}</th>
              <th className="px-4 py-3">{t('symbol')}</th>
              <th className="px-4 py-3">{t('strategy')}</th>
              <th className="px-4 py-3">{t('result')}</th>
              <th className="px-4 py-3">{t('adherence')}</th>
              <th className="px-4 py-3">{t('pnl')}</th>
              <th className="px-4 py-3">{t('calculatedRr')}</th>
              <th className="px-4 py-3">Account $</th>
              <th className="px-4 py-3">{t('disciplineScoreValue')}</th>
              <th className="px-4 py-3">{t('lockedAfter12Hours')}</th>
              <th className="px-4 py-3">{t('screenshotsSummary')}</th>
              <th className="px-4 py-3">{t('notes')}</th>
                  {!isViewOnly ? <th className="px-4 py-3">{t('edit')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {displayTrades.map((trade) => {
              const category = getCategory(trade.categoryId);

              return (
                <tr className={`cursor-pointer border-t border-border font-semibold hover:bg-muted/50 ${getTradeRowClass(trade)}`} key={trade.id} onClick={() => setDetailTrade(trade)}>
                  <td className="px-4 py-3 text-subtle">{trade.entryDate}</td>
                  <td className="px-4 py-3 text-subtle">{trade.entryTime}</td>
                  <td className="px-4 py-3 font-semibold text-ink">
                    <div className="grid gap-1">
                      <span>{getOptionLabel(trade.mode, tradeModeOptions)}</span>
                      <StatusPill isLocked={isLockedTrade(trade)} label={trade.status === 'open' ? t('openTrade') : t('closed')} status={trade.status} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {trade.title || `${getOptionLabel(trade.mode, tradeModeOptions)} ${trade.coin}`}
                  </td>
                  <td className="px-4 py-3 text-subtle">
                    {category ? <CategoryPill color={category.color} label={t(category.labelKey)} /> : '-'}
                  </td>
                  <td className="px-4 py-3 text-subtle">{trade.coin || '-'}</td>
                  <td className="px-4 py-3 text-subtle">
                    {getOptionLabel(trade.strategyId, strategyOptions)}
                  </td>
                  <td className="px-4 py-3">
                    <ResultPill label={getOptionLabel(trade.result, tradeResultOptions)} result={trade.result} />
                  </td>
                  <td className="px-4 py-3 text-subtle">
                    {getOptionLabel(trade.adherence, adherenceOptions)}
                  </td>
                  <td className="px-4 py-3 text-ink">{formatSignedMoney(trade.pnl)}</td>
                  <td className="px-4 py-3 text-ink">{trade.rr?.toFixed(2) ?? '-'}</td>
                  <td className="px-4 py-3 text-subtle">{formatAccountValue(getAccountValueForDate(accountValueResets, allTrades, getTradeCloseDate(trade) ?? trade.entryDate, trade.mode)?.value)}</td>
                  <td className="px-4 py-3">
                    <DisciplinePill label={t('disciplineScoreValue')} score={trade.disciplineScore} />
                  </td>
                  <td className="px-4 py-3 text-subtle">
                    {trade.mode === 'live' && trade.status === 'closed' ? (
                      <>
                        {isLockedTrade(trade) ? t('lockedViewOnly') : t('editableUntil')}
                        <br />
                        <span className="text-xs">{getClosedTradeEditableUntil(trade) ? new Date(getClosedTradeEditableUntil(trade) as string).toLocaleString() : '-'}</span>
                      </>
                    ) : (
                      <span className="text-xs">{trade.status === 'open' ? t('openTrade') : '-'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-subtle">{trade.screenshots.length}</td>
                  <td className="px-4 py-3 text-subtle">
                    {[trade.notes, trade.improvements].filter(Boolean).join(' / ') || '-'}
                  </td>
                  {!isViewOnly ? (
                    <td className="px-4 py-3">
                      <button
                        className="rounded-md bg-muted px-3 py-2 text-xs font-bold text-ink hover:bg-border"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditTrade(trade);
                        }}
                        type="button"
                      >
                        {isLockedTrade(trade)
                          ? t('view')
                          : t('edit')}
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}

            {spots.map((spot) => (
              <tr className="cursor-pointer border-t border-border font-semibold hover:bg-muted/50" key={spot.id} onClick={() => onEditSpot?.(spot)}>
                <td className="px-4 py-3 text-subtle">{spot.buyDate}</td>
                <td className="px-4 py-3 text-subtle">{spot.buyTime || '-'}</td>
                <td className="px-4 py-3 font-semibold text-ink">Spot <StatusPill isLocked={false} label={getSpotLifecycleStatus(spot).replace('_', ' ')} status={isSpotOpen(spot) ? 'open' : 'closed'} /></td>
                <td className="px-4 py-3 text-ink">{spot.assetName}</td>
                <td className="px-4 py-3 text-subtle">-</td>
                <td className="px-4 py-3 text-subtle">{spot.assetName}</td>
                <td className="px-4 py-3 text-subtle">-</td>
                <td className="px-4 py-3 text-subtle">-</td>
                <td className="px-4 py-3 text-subtle">-</td>
                <td className="px-4 py-3 text-ink">{formatSignedMoney(spot.realizedPnl)}</td>
                <td className="px-4 py-3 text-subtle">-</td>
                <td className="px-4 py-3 text-subtle">{formatMoney(spot.expectedBuyCost)}</td>
                <td className="px-4 py-3 text-subtle">-</td>
                <td className="px-4 py-3 text-subtle">{getSpotLifecycleStatus(spot)}</td>
                <td className="px-4 py-3 text-subtle">{spot.screenshots.length}</td>
                <td className="px-4 py-3 text-subtle">{spot.notes || spot.reasonForEntry || '-'}</td>
                {!isViewOnly ? (
                  <td className="px-4 py-3">
                    <button className="rounded-md bg-muted px-3 py-2 text-xs font-bold text-ink hover:bg-border" onClick={(event) => {
                      event.stopPropagation();
                      onEditSpot?.(spot);
                    }} type="button">
                      {t('edit')}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}

            {tasks.map((task) => {
              const category = getCategory(task.categoryId);

              return (
                <tr className="cursor-pointer border-t border-border hover:bg-muted/50" key={task.id} onClick={() => setDetailTask(task)}>
                  <td className="px-4 py-3 text-subtle">{date}</td>
                  <td className="px-4 py-3 text-subtle">
                    {[task.startTime, task.endTime].filter(Boolean).join(' - ') || '-'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">{t('task')}</td>
                  <td className="px-4 py-3 text-ink">{task.title}</td>
                  <td className="px-4 py-3 text-subtle">
                    {category ? <CategoryPill color={category.color} label={t(category.labelKey)} /> : '-'}
                  </td>
                  <td className="px-4 py-3 text-subtle">-</td>
                  <td className="px-4 py-3 text-subtle">{getOptionLabel(task.taskType, taskTypeOptions)}</td>
                  <td className="px-4 py-3 text-subtle">-</td>
                  <td className="px-4 py-3 text-subtle">-</td>
                  <td className="px-4 py-3 text-subtle">-</td>
                  <td className="px-4 py-3 text-subtle">-</td>
                  <td className="px-4 py-3 text-subtle">-</td>
                  <td className="px-4 py-3 text-subtle">-</td>
                  <td className="px-4 py-3 text-subtle">-</td>
                  <td className="px-4 py-3 text-subtle">-</td>
                  <td className="px-4 py-3 text-subtle">{task.notes || '-'}</td>
                  {!isViewOnly ? (
                    <td className="px-4 py-3">
                      <button
                        className="rounded-md bg-muted px-3 py-2 text-xs font-bold text-ink hover:bg-border"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditTask(task);
                        }}
                        type="button"
                      >
                        {t('edit')}
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}

            {tasks.length === 0 && displayTrades.length === 0 && spots.length === 0 ? (
              <tr className="border-t border-border">
                <td className="px-4 py-6 text-subtle" colSpan={isViewOnly ? 16 : 17}>
                  {t('noEntries')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <EntryDetailModal
        accountValueResets={accountValueResets}
        allTrades={allTrades}
        task={detailTask}
        trade={detailTrade}
        onClose={() => {
          setDetailTask(undefined);
          setDetailTrade(undefined);
        }}
      />
    </section>
  );
}

function EntryDetailModal({
  accountValueResets,
  allTrades,
  task,
  trade,
  onClose,
}: {
  accountValueResets: ReturnType<typeof useJournalStore.getState>['accountValueResets'];
  allTrades: Trade[];
  task?: Task;
  trade?: Trade;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [previewScreenshot, setPreviewScreenshot] = useState<ScreenshotSlot | null>(null);
  const isOpen = Boolean(task || trade);
  const getOptionLabel = (value: string | undefined, options: { value: string; labelKey: Parameters<typeof t>[0] }[]) => {
    const option = options.find((item) => item.value === value);
    return option ? t(option.labelKey) : formatCustomValue(value);
  };
  const category = trade ? getCategory(trade.categoryId) : task ? getCategory(task.categoryId) : undefined;

  return (
    <Modal closeLabel={t('close')} isOpen={isOpen} onClose={onClose} title={trade ? t('trade') : t('task')}>
      <div className="grid max-h-[72dvh] gap-4 overflow-y-auto pr-1">
        {trade ? (
          <>
            <div className="flex flex-wrap gap-2">
              <StatusPill isLocked={isLockedTrade(trade)} label={trade.status === 'open' ? t('openTrade') : t('closed')} status={trade.status} />
              <ResultPill label={getOptionLabel(trade.result, tradeResultOptions)} result={trade.result} />
              <DisciplinePill label={t('disciplineScoreValue')} score={trade.disciplineScore} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label={t('title')} value={trade.title} />
              <DetailRow label={t('type')} value={getOptionLabel(trade.mode, tradeModeOptions)} />
              <DetailRow label={t('category')} value={category ? t(category.labelKey) : undefined} />
              <DetailRow label={t('symbol')} value={trade.coin} />
              <DetailRow label={t('strategy')} value={getOptionLabel(trade.strategyId, strategyOptions)} />
              <DetailRow label={t('direction')} value={trade.direction} />
              <DetailRow label={t('entryDate')} value={trade.entryDate} />
              <DetailRow label={t('entryTime')} value={trade.entryTime} />
              <DetailRow label={t('exitTime')} value={trade.exitTime} />
              <DetailRow label={t('riskDollars')} value={formatMoney(trade.riskDollars)} />
              <DetailRow label={t('absolutePnl')} value={formatMoney(trade.pnlInput)} />
              <DetailRow label={t('pnl')} value={formatSignedMoney(trade.pnl)} />
              <DetailRow label={t('calculatedRr')} value={trade.rr?.toFixed(2)} />
              <DetailRow
                label="Account value reference"
                value={formatAccountValue(getAccountValueForDate(accountValueResets, allTrades, getTradeCloseDate(trade) ?? trade.entryDate, trade.mode)?.value)}
              />
              <DetailRow label={t('stopPercentage')} value={formatPercentValue(trade.stopPercentage)} />
              <DetailRow label={t('adherence')} value={getOptionLabel(trade.adherence, adherenceOptions)} />
              <DetailRow label={t('emotionBefore')} value={getOptionLabel(trade.emotion_before, emotionOptions)} />
              <DetailRow label={t('emotionAfter')} value={trade.emotion_after ? getOptionLabel(trade.emotion_after, emotionOptions) : undefined} />
              <DetailRow
                className="sm:col-span-2"
                label={t('ruleViolations')}
                value={trade.ruleViolations.map((violation) => getOptionLabel(violation, ruleViolationOptions)).join(', ')}
              />
              <DetailRow className="sm:col-span-2" label={t('notes')} value={trade.notes} />
              <DetailRow className="sm:col-span-2" label={t('improvements')} value={trade.improvements} />
              <DetailRow className="sm:col-span-2" label={t('preservationPoints')} value={trade.preservationPoints} />
              <DetailRow className="sm:col-span-2" label={t('sharpeningNeeded')} value={trade.sharpeningNeeded} />
            </div>
            <div className="grid gap-3">
              <p className="text-xs font-bold uppercase text-subtle">{t('timeframeScreenshots')}</p>
              {trade.screenshots.map((screenshot) => (
                <section className="grid gap-3 rounded-md border border-border bg-background p-3" key={screenshot.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink">
                      {getOptionLabel(screenshot.slotType, screenshotSlotOptions)}
                    </h3>
                    <span className="rounded bg-muted px-2 py-1 text-xs font-bold text-subtle">{screenshot.timeframe}</span>
                  </div>
                  {screenshot.description ? (
                    <p className="whitespace-pre-wrap break-words text-sm font-semibold text-ink">{screenshot.description}</p>
                  ) : null}
                  <button
                    className="grid min-h-44 place-items-center overflow-hidden rounded-md border border-dashed border-border bg-muted p-4 text-center text-sm font-bold text-subtle sm:min-h-56"
                    disabled={!(screenshot.localPreviewUrl || screenshot.cloudUrl)}
                    onClick={() => setPreviewScreenshot(screenshot)}
                    type="button"
                  >
                    {screenshot.localPreviewUrl || screenshot.cloudUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={getOptionLabel(screenshot.slotType, screenshotSlotOptions)}
                        className="max-h-72 w-full rounded object-contain"
                        src={screenshot.localPreviewUrl || screenshot.cloudUrl}
                      />
                    ) : (
                      t('imagePreviewFuture')
                    )}
                  </button>
                </section>
              ))}
            </div>
            <LargeScreenshotPreview
              context={`${trade.coin} · ${getOptionLabel(trade.mode, tradeModeOptions)} · ${trade.entryDate} ${trade.entryTime}`}
              onClose={() => setPreviewScreenshot(null)}
              screenshot={previewScreenshot}
              title={previewScreenshot ? getOptionLabel(previewScreenshot.slotType, screenshotSlotOptions) : t('screenshots')}
            />
          </>
        ) : null}
        {task ? (
          <>
            <DetailRow label={t('title')} value={task.title} />
            <DetailRow label={t('category')} value={category ? t(category.labelKey) : undefined} />
            <DetailRow label={t('taskType')} value={getOptionLabel(task.taskType, taskTypeOptions)} />
            <DetailRow label={t('entryTime')} value={[task.startTime, task.endTime].filter(Boolean).join(' - ')} />
            <DetailRow label={t('notes')} value={task.notes} />
          </>
        ) : null}
        <div className="flex justify-end">
          <Button onClick={onClose} type="button" variant="secondary">{t('close')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function DetailRow({ label, value, className = '' }: { label: string; value?: string; className?: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className={`rounded-md bg-muted p-3 ${className}`}>
      <p className="text-xs font-bold uppercase text-subtle">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function LargeScreenshotPreview({
  context,
  onClose,
  screenshot,
  title,
}: {
  context: string;
  onClose: () => void;
  screenshot: ScreenshotSlot | null;
  title: string;
}) {
  const { t } = useLanguage();
  const previewUrl = screenshot?.localPreviewUrl || screenshot?.cloudUrl;

  return (
    <Modal closeLabel={t('close')} isOpen={Boolean(screenshot)} onClose={onClose} title={title}>
      <div className="grid gap-4">
        <div className="grid gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:grid-cols-3">
          <span>{context}</span>
          <span>{t('timeframe')}: {screenshot?.timeframe ?? '-'}</span>
          <span>AI: {screenshot?.aiAnalysisStatus ?? 'not_started'}</span>
        </div>
        <div className="grid min-h-[40vh] place-items-center overflow-hidden rounded-md border border-border bg-background p-3">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={title} className="max-h-[68vh] w-full rounded object-contain" src={previewUrl} />
          ) : (
            <p className="text-sm font-bold text-subtle">{t('imagePreviewFuture')}</p>
          )}
        </div>
        {screenshot?.description ? (
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs font-bold uppercase text-subtle">{t('description')}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-ink">{screenshot.description}</p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="rounded bg-muted px-2 py-1">
      {value} {label}
    </span>
  );
}

function MobileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded bg-muted p-2">
      <p className="break-words text-[11px] font-bold uppercase text-subtle">{label}</p>
      <p className="mt-1 break-words font-semibold text-ink">{value}</p>
    </div>
  );
}

function CategoryPill({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded bg-muted px-2 py-1 text-xs font-bold">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function ResultPill({ label, result }: { label: string; result: Trade['result'] }) {
  const className =
    result === 'loss'
      ? 'bg-dangerSoft text-danger'
      : result === 'breakeven'
        ? 'bg-muted text-subtle'
        : 'bg-successSoft text-success';

  return <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${className}`}>{label}</span>;
}

function StatusPill({ label, status, isLocked }: { label: string; status: Trade['status']; isLocked: boolean }) {
  const className =
    status === 'open'
      ? 'bg-yellow-100 text-yellow-800'
      : isLocked
        ? 'bg-dangerSoft text-danger'
        : 'bg-muted text-subtle';

  return <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${className}`}>{label}</span>;
}

function DisciplinePill({ label, score }: { label: string; score: number }) {
  const className =
    score >= 85 ? 'bg-successSoft text-success' : score >= 70 ? 'bg-yellow-100 text-yellow-800' : 'bg-dangerSoft text-danger';

  return <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${className}`}>{label}: {formatPercentValue(score)}</span>;
}

function getTradeSurfaceClass(trade: Trade) {
  if (trade.status === 'open') return 'border-yellow-200 bg-yellow-50';
  if (trade.result === 'loss') return 'border-dangerSoft bg-red-50';
  if (trade.result === 'breakeven') return 'border-border bg-background';
  return 'border-successSoft bg-green-50';
}

function getTradeRowClass(trade: Trade) {
  if (trade.status === 'open') return 'bg-yellow-50/60';
  if (trade.result === 'loss') return 'bg-red-50/60';
  if (trade.result === 'win') return 'bg-green-50/60';
  return '';
}

function formatCustomValue(value: string | undefined) {
  return value ? value.replace(/_/g, ' ') : '-';
}

function isLockedTrade(trade: Trade) {
  const editableUntil = getClosedTradeEditableUntil(trade);
  return (
    trade.status === 'closed' &&
    trade.mode === 'live' &&
    editableUntil !== undefined &&
    new Date(editableUntil).getTime() < Date.now()
  );
}

function getClosedTradeEditableUntil(trade: Trade) {
  if (trade.editableUntil) return trade.editableUntil;
  if (trade.closedAt) return new Date(new Date(trade.closedAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
  if (trade.status === 'closed' && trade.mode === 'live') {
    return new Date(new Date(trade.updatedAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
  }
  return undefined;
}
