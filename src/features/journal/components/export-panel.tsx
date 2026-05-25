'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-provider';
import type { AssetType, Trade, TradeDirection, TradeMode, TradeResult } from '@/models/journal';

import {
  adherenceOptions,
  ruleViolationOptions,
  strategyOptions,
  tradeDirectionOptions,
  tradeModeOptions,
  tradeResultOptions,
  type OptionDefinition,
} from '../config/journal-options';
import { useJournalStore } from '../store/journal-store';
import { getAllowedTradeModes } from '../utils/journal-scope';
import { getTradeAssetName, getTradeAssetType, type AssetTypeFilter } from '../utils/trade-values';

type ExportPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

type FilterValue = 'all';
type ModeFilter = TradeMode | FilterValue;
type DirectionFilter = TradeDirection | FilterValue;
type ResultFilter = TradeResult | 'open' | FilterValue;

type ExportFilters = {
  startDate: string;
  endDate: string;
  mode: ModeFilter;
  assetType: AssetTypeFilter;
  symbol: string;
  strategy: string;
  direction: DirectionFilter;
  result: ResultFilter;
};

const initialFilters: ExportFilters = {
  startDate: '',
  endDate: '',
  mode: 'all',
  assetType: 'all',
  symbol: 'all',
  strategy: 'all',
  direction: 'all',
  result: 'all',
};

export function ExportPanel({ isOpen, onClose }: ExportPanelProps) {
  const { dir, language, t } = useLanguage();
  const tradesById = useJournalStore((state) => state.trades);
  const symbolOptions = useJournalStore((state) => state.symbolOptions);
  const assetTypeBySymbol = useJournalStore((state) => state.assetTypeBySymbol);
  const customStrategyOptions = useJournalStore((state) => state.customStrategyOptions);
  const recordEvent = useJournalStore((state) => state.recordEvent);
  const journalType = useJournalStore((state) => state.journalType);
  const [filters, setFilters] = useState<ExportFilters>(initialFilters);

  const allowedTradeModes = useMemo(() => getAllowedTradeModes(journalType), [journalType]);
  const allTrades = useMemo(() => Object.values(tradesById).filter((trade) => allowedTradeModes.includes(trade.mode)), [allowedTradeModes, tradesById]);
  const safeModeFilter = filters.mode !== 'all' && !allowedTradeModes.includes(filters.mode) ? 'all' : filters.mode;
  const strategyLabelById = useMemo(() => {
    const defaultLabels = Object.fromEntries(strategyOptions.map((option) => [option.value, t(option.labelKey)]));
    const customLabels = Object.fromEntries(customStrategyOptions.map((value) => [value, value.replace(/_/g, ' ')]));
    return { ...defaultLabels, ...customLabels };
  }, [customStrategyOptions, t]);
  const adherenceLabelById = useMemo(
    () => Object.fromEntries(adherenceOptions.map((option) => [option.value, t(option.labelKey)])),
    [t],
  );
  const violationLabelById = useMemo(
    () => Object.fromEntries(ruleViolationOptions.map((option) => [option.value, t(option.labelKey)])),
    [t],
  );

  const filteredTrades = useMemo(
    () =>
      allTrades
        .filter((trade) => {
          if (filters.startDate && trade.entryDate < filters.startDate) return false;
          if (filters.endDate && trade.entryDate > filters.endDate) return false;
          if (safeModeFilter !== 'all' && trade.mode !== safeModeFilter) return false;
          if (filters.assetType !== 'all' && getTradeAssetType(trade) !== filters.assetType) return false;
          if (filters.symbol !== 'all' && getTradeAssetName(trade) !== filters.symbol) return false;
          if (filters.strategy !== 'all' && trade.strategyId !== filters.strategy) return false;
          if (filters.direction !== 'all' && trade.direction !== filters.direction) return false;
          if (filters.result === 'open' && trade.status !== 'open') return false;
          if (filters.result !== 'all' && filters.result !== 'open' && trade.result !== filters.result) return false;
          return true;
        })
        .sort((a, b) => `${a.entryDate} ${a.entryTime}`.localeCompare(`${b.entryDate} ${b.entryTime}`)),
    [allTrades, filters, safeModeFilter],
  );

  const modeOptions: Array<{ value: ModeFilter; label: string }> = [
    { value: 'all', label: t('all') },
    ...mapTranslatedOptions(tradeModeOptions, t).filter((option) => allowedTradeModes.includes(option.value)),
  ];
  const directionOptions: Array<{ value: DirectionFilter; label: string }> = [
    { value: 'all', label: t('all') },
    ...mapTranslatedOptions(tradeDirectionOptions, t),
  ];
  const resultOptions: Array<{ value: ResultFilter; label: string }> = [
    { value: 'all', label: t('all') },
    ...mapTranslatedOptions(tradeResultOptions, t),
    { value: 'open', label: t('openTrade') },
  ];
  const symbolSelectOptions = useMemo(() => [
    { value: 'all', label: t('all') },
    ...buildExportSymbolOptions({
      allTrades,
      assetTypeBySymbol,
      assetTypeFilter: filters.assetType,
      symbolOptions,
    }).map((symbol) => ({ value: symbol, label: symbol })),
  ], [allTrades, assetTypeBySymbol, filters.assetType, symbolOptions, t]);
  const assetTypeOptions: Array<{ value: AssetTypeFilter; label: string }> = [
    { value: 'all', label: t('all') },
    ...(['crypto', 'stock', 'forex'] as AssetType[]).map((value) => ({ value, label: t(value) })),
  ];
  const strategySelectOptions = [
    { value: 'all', label: t('all') },
    ...Object.entries(strategyLabelById).map(([value, label]) => ({ value, label })),
  ];

  const updateFilter = <K extends keyof ExportFilters>(key: K, value: ExportFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (filters.symbol === 'all') return;
    const validSymbols = new Set(symbolSelectOptions.map((option) => option.value));
    if (!validSymbols.has(filters.symbol)) {
      setFilters((current) => ({ ...current, symbol: 'all' }));
    }
  }, [filters.symbol, symbolSelectOptions]);

  const exportPrintable = (autoPrint = true) => {
    const html = buildPrintableHtml({
      dir,
      language,
      title: language === 'he' ? 'ייצוא יומן מסחר' : 'Trade Journal Export',
      labels: {
        summary: language === 'he' ? 'סיכום' : 'Summary',
        totalTrades: language === 'he' ? 'סה"כ טריידים' : 'Total trades',
        winsLosses: language === 'he' ? 'ניצחונות / הפסדים' : 'Wins / losses',
        winRate: t('winRate'),
        totalPnl: t('totalPnl'),
        averageRr: language === 'he' ? 'ממוצע R:R' : 'Average R:R',
        averageDiscipline: language === 'he' ? 'ממוצע משמעת' : 'Average discipline score',
        entryDate: t('entryDate'),
        entryTime: t('entryTime'),
        exitTime: t('exitTime'),
        symbol: t('symbol'),
        mode: t('tradeMode'),
        assetType: language === 'he' ? 'סוג נכס' : 'Asset type',
        direction: t('direction'),
        strategy: t('strategy'),
        result: t('result'),
        pnl: t('pnl'),
        rr: t('calculatedRr'),
        disciplineScore: t('disciplineScore'),
        emotions: language === 'he' ? 'רגשות' : 'Emotions',
        adherence: t('adherence'),
        violations: t('ruleViolations'),
        notes: t('notes'),
        preservation: t('preservationPoints'),
        improvements: t('improvements'),
        screenshots: t('screenshots'),
        notSet: t('notSet'),
      },
      trades: filteredTrades,
      strategyLabelById,
      adherenceLabelById,
      violationLabelById,
      t,
    });
    const printWindow = window.open('', '_blank');

    if (!printWindow) return;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    recordEvent('export_created', { format: 'printable_html', trades: filteredTrades.length });
    if (autoPrint) {
      printWindow.print();
    }
  };

  return (
    <Modal
      closeLabel={t('close')}
      isOpen={isOpen}
      onClose={onClose}
      title={language === 'he' ? 'ייצוא' : 'Export'}
    >
      <div className="grid gap-4">
        <section className="grid gap-3 rounded-md border border-border bg-muted p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            <Select label={t('tradeIdentity')} onValueChange={(value) => updateFilter('mode', value)} options={modeOptions} value={safeModeFilter} />
            <Select label={t('assetType')} onValueChange={(value) => updateFilter('assetType', value)} options={assetTypeOptions} value={filters.assetType} />
            <Select label={t('symbol')} onValueChange={(value) => updateFilter('symbol', value)} options={symbolSelectOptions} value={filters.symbol} />
            <Select label={t('strategy')} onValueChange={(value) => updateFilter('strategy', value)} options={strategySelectOptions} value={filters.strategy} />
            <Select label={t('direction')} onValueChange={(value) => updateFilter('direction', value)} options={directionOptions} value={filters.direction} />
            <Select label={t('result')} onValueChange={(value) => updateFilter('result', value)} options={resultOptions} value={filters.result} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-subtle">
              {filteredTrades.length} / {allTrades.length} {t('trades')}
            </p>
            <Button onClick={() => setFilters(initialFilters)} type="button" variant="secondary">
              {t('all')}
            </Button>
          </div>
        </section>

        <section className="grid gap-2 rounded-md border border-border bg-white p-3 text-sm text-subtle">
          {filteredTrades.slice(0, 5).map((trade) => (
            <div className="rounded-md bg-muted p-2" key={trade.id}>
              <span className="font-bold text-ink">{trade.entryDate} · {trade.coin}</span>
              <span> · {t(trade.direction)} · {formatCurrency(trade.pnl)} · R:R {formatNumber(trade.rr ?? 0)}</span>
            </div>
          ))}
          {!filteredTrades.length ? <p>{t('noEntries')}</p> : null}
        </section>

        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={!filteredTrades.length} onClick={() => exportPrintable(true)} type="button" variant="secondary">
            {language === 'he' ? 'ייצוא PDF / הדפסה' : 'PDF / print export'}
          </Button>
          <Button disabled={!filteredTrades.length} onClick={() => exportPrintable(false)} type="button">
            {language === 'he' ? 'פתיחת דוח ניתן להדפסה' : 'Open printable journal'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function buildPrintableHtml({
  dir,
  language,
  title,
  labels,
  trades,
  strategyLabelById,
  adherenceLabelById,
  violationLabelById,
  t,
}: {
  dir: 'ltr' | 'rtl';
  language: string;
  title: string;
  labels: Record<string, string>;
  trades: Trade[];
  strategyLabelById: Record<string, string>;
  adherenceLabelById: Record<string, string>;
  violationLabelById: Record<string, string>;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  const wins = trades.filter((trade) => trade.result === 'win').length;
  const losses = trades.filter((trade) => trade.result === 'loss').length;
  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const rrValues = trades.map((trade) => trade.rr ?? 0).filter((value) => Number.isFinite(value));
  const disciplineValues = trades.map((trade) => trade.disciplineScore).filter((value) => Number.isFinite(value));
  const averageRr = rrValues.length ? rrValues.reduce((sum, value) => sum + value, 0) / rrValues.length : 0;
  const averageDiscipline = disciplineValues.length
    ? disciplineValues.reduce((sum, value) => sum + value, 0) / disciplineValues.length
    : 0;
  const winRate = trades.length ? wins / trades.length : 0;

  return `<!doctype html>
<html lang="${escapeHtml(language)}" dir="${dir}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 28px; font-family: Arial, sans-serif; color: #111827; background: #ffffff; }
      h1 { margin: 0 0 8px; font-size: 28px; }
      h2 { margin: 28px 0 12px; font-size: 18px; }
      .meta { color: #667085; margin-bottom: 20px; }
      .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 20px 0; }
      .metric { border: 1px solid #d0d5dd; border-radius: 8px; padding: 12px; background: #f9fafb; }
      .metric-label { color: #667085; font-size: 12px; font-weight: 700; text-transform: uppercase; }
      .metric-value { margin-top: 4px; font-size: 18px; font-weight: 800; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
      thead { display: table-header-group; background: #eef2f7; }
      th, td { border: 1px solid #d0d5dd; padding: 6px 7px; vertical-align: top; overflow-wrap: anywhere; }
      th { color: #344054; font-size: 10px; text-align: start; text-transform: uppercase; }
      tbody tr { break-inside: avoid; page-break-inside: avoid; }
      .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .profit { color: #047857; font-weight: 800; }
      .loss { color: #b42318; font-weight: 800; }
      .muted { color: #667085; }
      .details { color: #344054; font-size: 10px; line-height: 1.35; white-space: pre-wrap; }
      @media screen and (prefers-color-scheme: dark) {
        body { color: #e5e7eb; background: #111827; }
        .meta, .metric-label, .muted { color: #9ca3af; }
        .metric { border-color: #374151; background: #1f2937; }
        thead { background: #263244; }
        th, td { border-color: #374151; }
        th, .details { color: #d1d5db; }
        .profit { color: #34d399; }
        .loss { color: #f87171; }
      }
      @media print {
        @page { size: A4; margin: 12mm; }
        body { padding: 0; }
        h1 { font-size: 22px; }
        h2 { margin-top: 18px; }
        .summary { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
        .metric { padding: 8px; }
        .metric-value { font-size: 13px; }
      }
      @media (max-width: 720px) { .summary { grid-template-columns: 1fr; } table { font-size: 10px; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${escapeHtml(new Date().toLocaleString())}</div>
    <h2>${escapeHtml(labels.summary)}</h2>
    <section class="summary">
      ${metric(labels.totalTrades, String(trades.length))}
      ${metric(labels.winsLosses, `${wins} / ${losses}`)}
      ${metric(labels.winRate, formatPercent(winRate))}
      ${metric(labels.totalPnl, formatCurrency(totalPnl))}
      ${metric(labels.averageRr, formatNumber(averageRr))}
      ${metric(labels.averageDiscipline, formatPercentValue(averageDiscipline))}
    </section>
    <h2>${escapeHtml(t('trades'))}</h2>
    ${tradesTableHtml({
      trades,
      labels,
      strategyLabelById,
      adherenceLabelById,
      violationLabelById,
      t,
    })}
  </body>
</html>`;
}

function tradesTableHtml({
  trades,
  labels,
  strategyLabelById,
  adherenceLabelById,
  violationLabelById,
  t,
}: {
  trades: Trade[];
  labels: Record<string, string>;
  strategyLabelById: Record<string, string>;
  adherenceLabelById: Record<string, string>;
  violationLabelById: Record<string, string>;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  return `<table>
    <colgroup>
      <col style="width: 10%" />
      <col style="width: 8%" />
      <col style="width: 11%" />
      <col style="width: 8%" />
      <col style="width: 9%" />
      <col style="width: 12%" />
      <col style="width: 8%" />
      <col style="width: 8%" />
      <col style="width: 7%" />
      <col style="width: 19%" />
    </colgroup>
    <thead>
      <tr>
        <th>${escapeHtml(labels.entryDate)}</th>
        <th>${escapeHtml(labels.entryTime)}</th>
        <th>${escapeHtml(labels.symbol)}</th>
        <th>${escapeHtml(labels.mode)}</th>
        <th>${escapeHtml(labels.assetType)}</th>
        <th>${escapeHtml(labels.strategy)}</th>
        <th>${escapeHtml(labels.result)}</th>
        <th class="num">${escapeHtml(labels.pnl)}</th>
        <th class="num">${escapeHtml(labels.rr)}</th>
        <th>${escapeHtml(labels.notes)}</th>
      </tr>
    </thead>
    <tbody>
      ${trades.map((trade) => tradeRowHtml({ trade, labels, strategyLabelById, adherenceLabelById, violationLabelById, t })).join('')}
    </tbody>
  </table>`;
}

function tradeRowHtml({
  trade,
  labels,
  strategyLabelById,
  adherenceLabelById,
  violationLabelById,
  t,
}: {
  trade: Trade;
  labels: Record<string, string>;
  strategyLabelById: Record<string, string>;
  adherenceLabelById: Record<string, string>;
  violationLabelById: Record<string, string>;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  const violations = trade.ruleViolations
    .map((violation) => violationLabelById[violation] ?? violation.replace(/_/g, ' '))
    .join(', ');
  const details = [
    `${labels.disciplineScore}: ${formatPercentValue(trade.disciplineScore)}`,
    `${labels.adherence}: ${adherenceLabelById[trade.adherence] ?? trade.adherence}`,
    violations ? `${labels.violations}: ${violations}` : '',
    trade.notes ? `${labels.notes}: ${trade.notes}` : '',
    trade.improvements ? `${labels.improvements}: ${trade.improvements}` : '',
    trade.preservationPoints ? `${labels.preservation}: ${trade.preservationPoints}` : '',
  ].filter(Boolean).join('\n');

  return `<tr>
    <td>${escapeHtml(trade.entryDate)}<div class="muted">${escapeHtml(trade.exitDate || '')}</div></td>
    <td>${escapeHtml(trade.entryTime)}<div class="muted">${escapeHtml(trade.exitTime || '')}</div></td>
    <td><strong>${escapeHtml(trade.coin)}</strong><div class="muted">${escapeHtml(t(trade.direction))}</div></td>
    <td>${escapeHtml(t(trade.mode === 'live' ? 'liveTrade' : 'backtesting'))}</td>
    <td>${escapeHtml(getAssetTypeLabel(trade.assetType, labels.notSet))}</td>
    <td>${escapeHtml(strategyLabelById[trade.strategyId ?? ''] ?? trade.strategyId ?? labels.notSet)}</td>
    <td>${escapeHtml(`${t(trade.result)} / ${trade.status === 'open' ? t('openTrade') : t('closed')}`)}</td>
    <td class="num ${trade.pnl < 0 ? 'loss' : 'profit'}">${escapeHtml(formatCurrency(trade.pnl))}</td>
    <td class="num">${escapeHtml(formatNumber(trade.rr ?? 0))}</td>
    <td class="details">${escapeHtml(details || labels.notSet)}</td>
  </tr>`;
}

function getAssetTypeLabel(value: Trade['assetType'], fallback: string) {
  if (value === 'crypto') return 'Crypto';
  if (value === 'forex') return 'Forex';
  if (value === 'stock') return 'Stock';
  return fallback;
}

function buildExportSymbolOptions({
  allTrades,
  assetTypeBySymbol,
  assetTypeFilter,
  symbolOptions,
}: {
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

  return Array.from(symbols).sort();
}

// Kept only for older saved printable windows that may still reference the legacy card layout during hot reload.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function tradeHtml({
  trade,
  labels,
  strategyLabelById,
  adherenceLabelById,
  violationLabelById,
  t,
}: {
  trade: Trade;
  labels: Record<string, string>;
  strategyLabelById: Record<string, string>;
  adherenceLabelById: Record<string, string>;
  violationLabelById: Record<string, string>;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  const violations = trade.ruleViolations
    .map((violation) => violationLabelById[violation] ?? violation.replace(/_/g, ' '))
    .join(', ');
  const screenshots = trade.screenshots
    .filter((slot) => slot.description || slot.uploadPlaceholder)
    .map((slot) => `${slot.timeframe}: ${slot.description || slot.uploadPlaceholder || ''}`)
    .join('\n');

  return `<section class="trade">
    <div class="trade-title">
      <span>${escapeHtml(trade.coin)} · ${escapeHtml(t(trade.direction))}</span>
      <span>${escapeHtml(formatCurrency(trade.pnl))}</span>
    </div>
    <div class="grid">
      ${field(labels.entryDate, trade.entryDate)}
      ${field(labels.entryTime, trade.entryTime)}
      ${field(labels.exitTime, trade.exitTime || labels.notSet)}
      ${field(labels.symbol, trade.coin)}
      ${field(labels.strategy, strategyLabelById[trade.strategyId ?? ''] ?? trade.strategyId ?? labels.notSet)}
      ${field(labels.result, `${t(trade.result)} / ${trade.status === 'open' ? t('openTrade') : t('closed')}`)}
      ${field(labels.pnl, formatCurrency(trade.pnl))}
      ${field(labels.rr, formatNumber(trade.rr ?? 0))}
      ${field(labels.disciplineScore, formatPercentValue(trade.disciplineScore))}
      ${field(labels.emotions, `${trade.emotion_before}${trade.emotion_after ? ` / ${trade.emotion_after}` : ''}`)}
      ${field(labels.adherence, adherenceLabelById[trade.adherence] ?? trade.adherence)}
      ${field(labels.violations, violations || labels.notSet)}
      ${field(labels.notes, trade.notes || labels.notSet, true)}
      ${field(labels.preservation, trade.preservationPoints || labels.notSet, true)}
      ${field(labels.improvements, trade.improvements || labels.notSet, true)}
      ${field(labels.screenshots, screenshots || labels.notSet, true)}
    </div>
  </section>`;
}

function metric(label: string, value: string) {
  return `<div class="metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div></div>`;
}

function field(label: string, value: string, wide = false) {
  return `<div class="${wide ? 'wide' : ''}"><div class="field-label">${escapeHtml(label)}</div><div class="field-value">${escapeHtml(value)}</div></div>`;
}

function mapTranslatedOptions<T extends string>(
  options: OptionDefinition<T>[],
  t: (key: OptionDefinition<T>['labelKey']) => string,
) {
  return options.map((option) => ({ value: option.value, label: t(option.labelKey) }));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatPercentValue(value: number) {
  return `${Number.isInteger(value) ? String(value) : value.toFixed(1)}%`;
}

function formatCurrency(value: number) {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;
}

function formatNumber(value: number) {
  return value.toFixed(2);
}
