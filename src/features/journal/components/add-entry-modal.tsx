'use client';

import { ChangeEvent, ClipboardEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AccountValueMode } from '../data/journal-repository';

import { Button } from '@/components/ui/button';
import { FormSection } from '@/components/ui/form-section';
import { Textarea, TextInput } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useLanguage } from '@/lib/i18n/language-provider';
import type {
  EntryType,
  AssetType,
  RuleAdherence,
  ScreenshotSlot,
  ScreenshotSlotType,
  ScreenshotTimeframe,
  SpotPosition,
  SpotStatus,
  Task,
  Trade,
  TradeDirection,
  TradeMode,
  TradeResult,
} from '@/models/journal';

import {
  adherenceOptions,
  categories,
  emotionOptions,
  ruleViolationOptions,
  screenshotSlotOptions,
  strategyOptions,
  taskTypeOptions,
  timeOptions,
  tradeDirectionOptions,
  tradeModeOptions,
  tradeResultOptions,
  type OptionDefinition,
} from '../config/journal-options';
import { useJournalStore } from '../store/journal-store';
import { formatAccountValue, formatSignedMoney, getAccountValueForDate } from '../utils/account-value';
import { getAllowedTradeModes, getPrimaryTradeMode, isTradeModeAllowed } from '../utils/journal-scope';
import { formatSpotHoldingDuration } from '../utils/spot-values';
import { getSpotRemainingQuantity, isSpotOpen } from '../utils/spot-status';

type AddEntryModalProps = {
  date: string;
  closeExitDate?: string;
  initialEntryType?: EntryType;
  isOpen: boolean;
  onClose: () => void;
  onOpenAccountSettings?: (mode?: AccountValueMode) => void;
  taskToEdit?: Task;
  tradeToEdit?: Trade;
  spotToEdit?: SpotPosition;
};

type ScreenshotDraftItem = {
  id: string;
  slotType: ScreenshotSlotType;
  timeframe: ScreenshotTimeframe;
  description: string;
  localPreviewUrl?: string;
  cloudUrl?: string;
  uploadedAt?: string;
  order: number;
  uploadPlaceholder?: string;
  aiAnalysisStatus?: ScreenshotSlot['aiAnalysisStatus'];
  aiNotes?: string;
  detectedTimeframe?: string;
  detectedPattern?: string;
  userCorrection?: string;
};

type ScreenshotDraft = Record<ScreenshotSlotType, ScreenshotDraftItem>;

const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim().length > 0 ? parsed : undefined;
};

const createScreenshotDraft = (): ScreenshotDraft => ({
  actual_entry_timeframe: createScreenshotDraftItem('actual_entry_timeframe', '5m', 0),
  higher_timeframe_context: createScreenshotDraftItem('higher_timeframe_context', '1h', 1),
  exit_result: createScreenshotDraftItem('exit_result', '5m', 2),
  custom_timeframe: createScreenshotDraftItem('custom_timeframe', '15m', 3),
});

const createScreenshotDraftItem = (
  slotType: ScreenshotSlotType,
  timeframe: ScreenshotTimeframe,
  order: number,
): ScreenshotDraftItem => ({
  id: slotType,
  slotType,
  timeframe,
  description: '',
  order,
  uploadPlaceholder: 'pending',
  aiAnalysisStatus: 'not_started',
});

const createScreenshotDraftFromTrade = (trade: Trade): ScreenshotDraft => {
  const draft = createScreenshotDraft();

  trade.screenshots.forEach((slot) => {
    const slotType = getScreenshotSlotType(slot);
    draft[slotType] = {
      ...draft[slotType],
      id: slot.id || slotType,
      slotType,
      timeframe: slot.timeframe,
      description: '',
      order: slot.order ?? draft[slotType].order,
      uploadPlaceholder: 'pending',
      aiAnalysisStatus: 'not_started',
    };
  });

  return draft;
};

const getScreenshotSlotType = (slot: Pick<ScreenshotSlot, 'id'> & Partial<Pick<ScreenshotSlot, 'slotType'>>) =>
  (slot.slotType ?? slot.id) as ScreenshotSlotType;

const assetTypeOptions = [
  { value: 'crypto' as const, labelKey: 'crypto' as const },
  { value: 'stock' as const, labelKey: 'stock' as const },
  { value: 'forex' as const, labelKey: 'forex' as const },
];

export function AddEntryModal({ closeExitDate, date, initialEntryType = 'trade', isOpen, onClose, onOpenAccountSettings, taskToEdit, tradeToEdit, spotToEdit }: AddEntryModalProps) {
  const { language, t } = useLanguage();
  const addTask = useJournalStore((state) => state.addTask);
  const addTrade = useJournalStore((state) => state.addTrade);
  const addSpot = useJournalStore((state) => state.addSpot);
  const updateSpot = useJournalStore((state) => state.updateSpot);
  const addSpotSell = useJournalStore((state) => state.addSpotSell);
  const updateTask = useJournalStore((state) => state.updateTask);
  const updateTrade = useJournalStore((state) => state.updateTrade);
  const symbolOptions = useJournalStore((state) => state.symbolOptions);
  const assetTypeBySymbol = useJournalStore((state) => state.assetTypeBySymbol);
  const screenshotTimeframes = useJournalStore((state) => state.screenshotTimeframes);
  const addSymbolOption = useJournalStore((state) => state.addSymbolOption);
  const addScreenshotTimeframe = useJournalStore((state) => state.addScreenshotTimeframe);
  const isViewOnly = useJournalStore((state) => state.isViewOnly);
  const customEmotionOptions = useJournalStore((state) => state.customEmotionOptions);
  const customRuleViolationOptions = useJournalStore((state) => state.customRuleViolationOptions);
  const customStrategyOptions = useJournalStore((state) => state.customStrategyOptions);
  const tradesById = useJournalStore((state) => state.trades);
  const accountValueResets = useJournalStore((state) => state.accountValueResets);
  const journalType = useJournalStore((state) => state.journalType);
  const [entryType, setEntryType] = useState<EntryType>(journalType === 'spotOnly' ? 'spot' : 'trade');
  const [tradeEntryMode, setTradeEntryMode] = useState<'openOnly' | 'openClose'>('openOnly');
  const [isAdvancedDetailsOpen, setIsAdvancedDetailsOpen] = useState(false);
  const [isScreenshotsOpen, setIsScreenshotsOpen] = useState(false);
  const [isSpotSellDetailsOpen, setIsSpotSellDetailsOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [result, setResult] = useState<TradeResult>('win');
  const [mode, setMode] = useState<TradeMode>('live');
  const [direction, setDirection] = useState<TradeDirection>('long');
  const [adherence, setAdherence] = useState<RuleAdherence>('followed');
  const [symbol, setSymbol] = useState(getFirstSymbolForAssetType(symbolOptions, assetTypeBySymbol, 'crypto'));
  const [assetType, setAssetType] = useState<AssetType>('crypto');
  const [strategyId, setStrategyId] = useState(strategyOptions[0].value);
  const [categoryId, setCategoryId] = useState('trading');
  const [taskType, setTaskType] = useState(taskTypeOptions[0].value);
  const [emotionBefore, setEmotionBefore] = useState(emotionOptions[0].value);
  const [emotionAfter, setEmotionAfter] = useState('');
  const [entryDate, setEntryDate] = useState(date);
  const [entryTime, setEntryTime] = useState('09:30');
  const [exitDate, setExitDate] = useState(date);
  const [exitTime, setExitTime] = useState('');
  const [taskEndTime, setTaskEndTime] = useState('10:00');
  const [pnlInput, setPnlInput] = useState('');
  const [stopPercentage, setStopPercentage] = useState('');
  const [riskDollars, setRiskDollars] = useState('');
  const [notes, setNotes] = useState('');
  const [improvements, setImprovements] = useState('');
  const [preservationPoints, setPreservationPoints] = useState('');
  const [sharpeningNeeded, setSharpeningNeeded] = useState('');
  const [ruleViolations, setRuleViolations] = useState<string[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotDraft>(createScreenshotDraft);
  const [newSymbol, setNewSymbol] = useState('');
  const [newTimeframeAmount, setNewTimeframeAmount] = useState('');
  const [newTimeframeUnit, setNewTimeframeUnit] = useState<'m' | 'h' | 'D'>('h');
  const [previewScreenshot, setPreviewScreenshot] = useState<ScreenshotDraftItem | null>(null);
  const [spotAssetName, setSpotAssetName] = useState('');
  const [spotBuyPrice, setSpotBuyPrice] = useState('');
  const [spotQuantityBought, setSpotQuantityBought] = useState('');
  const [spotCurrentPortfolioValue, setSpotCurrentPortfolioValue] = useState('');
  const [spotTargetPrice, setSpotTargetPrice] = useState('');
  const [spotStopLoss, setSpotStopLoss] = useState('');
  const [spotTakeProfit, setSpotTakeProfit] = useState('');
  const [spotReasonEntry, setSpotReasonEntry] = useState('');
  const [spotSellDate, setSpotSellDate] = useState(date);
  const [spotSellTime, setSpotSellTime] = useState('');
  const [spotSellPrice, setSpotSellPrice] = useState('');
  const [spotQuantitySold, setSpotQuantitySold] = useState('');
  const [spotActualReceived, setSpotActualReceived] = useState('');
  const [spotReasonExit, setSpotReasonExit] = useState('');
  const [didTrySubmit, setDidTrySubmit] = useState(false);
  const uploadInputRefs = useRef<Partial<Record<ScreenshotSlotType, HTMLInputElement | null>>>({});
  const allTrades = useMemo(() => Object.values(tradesById), [tradesById]);
  const allowedTradeModes = useMemo(() => getAllowedTradeModes(journalType), [journalType]);
  const defaultTradeMode = useMemo(() => getPrimaryTradeMode(journalType), [journalType]);
  const lastTrade = useMemo(
    () => [...allTrades].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    [allTrades],
  );
  const lastBacktestingTrade = useMemo(
    () => [...allTrades].filter((trade) => trade.mode === 'backtesting').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    [allTrades],
  );

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ value: category.id, label: t(category.labelKey) })),
    [t],
  );
  const mapOptions = <T extends string>(options: OptionDefinition<T>[]) =>
    options.map((option) => ({ value: option.value, label: t(option.labelKey), color: option.color }));
  const customOptions = (values: string[]) => values.map((value) => ({ value, label: value.replace(/_/g, ' ') }));
  const emotionSelectOptions = [...mapOptions(emotionOptions), ...customOptions(customEmotionOptions)];
  const strategySelectOptions = [...mapOptions(strategyOptions), ...customOptions(customStrategyOptions)];
  const ruleViolationSelectOptions = [
    ...ruleViolationOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })),
    ...customRuleViolationOptions.map((value) => ({ value, label: value.replace(/_/g, ' ') })),
  ];
  const timeSelectOptions = timeOptions.map((option) => ({ value: option.value, label: option.value }));
  const filteredSymbolOptions = useMemo(
    () => buildAssetNameOptions(symbolOptions, assetTypeBySymbol, assetType, symbol, tradeToEdit?.assetType),
    [assetType, assetTypeBySymbol, symbol, symbolOptions, tradeToEdit?.assetType],
  );
  const filteredSpotAssetOptions = useMemo(
    () => buildAssetNameOptions(symbolOptions, assetTypeBySymbol, assetType, spotAssetName, spotToEdit?.assetType),
    [assetType, assetTypeBySymbol, spotAssetName, spotToEdit?.assetType, symbolOptions],
  );
  const assetTypeSelectOptions = assetTypeOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }));
  const timeframeSelectOptions = screenshotTimeframes.map((option) => ({ value: option, label: option }));
  const riskValue = toNumber(riskDollars);
  const absolutePnlValue = result === 'breakeven' ? 0 : toNumber(pnlInput);
  const signedPnl =
    result === 'breakeven' ? 0 : result === 'loss' ? -(absolutePnlValue ?? 0) : (absolutePnlValue ?? 0);
  const calculatedRr = riskValue && riskValue > 0 ? signedPnl / riskValue : undefined;
  const isLiveTradeMode = mode === 'live';
  const isBacktestingMode = mode === 'backtesting';
  const isCompletedTradeFlow = !isLiveTradeMode || tradeEntryMode === 'openClose';
  const accountValueReferenceDate = isCompletedTradeFlow && exitDate ? exitDate : entryDate;
  const accountValueForEntryDate = getAccountValueForDate(accountValueResets, allTrades, accountValueReferenceDate, mode);
  const isMissingModeAccountValue = !tradeToEdit && !accountValueForEntryDate;
  const isMissingLiveAccountValue = isMissingModeAccountValue && mode === 'live';
  const isMissingSimulatedAccountValue = isMissingModeAccountValue && mode !== 'live';
  const shouldShowCapitalPrompt = mode === 'live' || journalType === 'combined';
  const requiresEmotionFields = !isBacktestingMode;
  const isExitDateBeforeEntry = Boolean(entryDate && exitDate && exitDate < entryDate);
  const isExitTimeBeforeEntry = Boolean(entryDate && exitDate && entryTime && exitTime && exitDate === entryDate && exitTime < entryTime);
  const isExitDateTimeValid = !isCompletedTradeFlow || (!isExitDateBeforeEntry && !isExitTimeBeforeEntry);
  const exitTimeSelectOptions =
    exitDate && entryDate && exitDate === entryDate
      ? [{ value: '', label: '-' }, ...timeSelectOptions.filter((option) => option.value >= entryTime)]
      : [{ value: '', label: '-' }, ...timeSelectOptions];
  const hasRequiredStop = toNumber(stopPercentage) !== undefined;
  const hasRequiredActualEntryScreenshot = hasScreenshotContent(screenshots.actual_entry_timeframe);
  const hasRequiredExitScreenshot = Boolean(
    hasScreenshotContent(screenshots.exit_result) && screenshots.exit_result.description.trim(),
  );
  const tradeDuration = useMemo(
    () => calculateTradeDuration(entryDate, entryTime, exitDate, exitTime),
    [entryDate, entryTime, exitDate, exitTime],
  );
  const isLockedLiveTrade = Boolean(
    tradeToEdit?.status === 'closed' &&
      tradeToEdit?.mode === 'live' &&
      getClosedTradeEditableUntil(tradeToEdit) !== undefined &&
      new Date(getClosedTradeEditableUntil(tradeToEdit) as string).getTime() < Date.now(),
  );
  const canOpenTrade = Boolean(
    mode &&
      entryDate &&
      entryTime &&
      symbol.trim() &&
      isAssetNameAllowedForType(symbol, assetType, assetTypeBySymbol, tradeToEdit?.assetType) &&
      direction &&
      assetType &&
      riskValue &&
      riskValue > 0 &&
      hasRequiredStop &&
      (!requiresEmotionFields || emotionBefore) &&
      adherence &&
      strategyId &&
      !isMissingLiveAccountValue &&
      hasRequiredActualEntryScreenshot,
  );
  const canSaveTrade = Boolean(
    canOpenTrade &&
      result &&
      absolutePnlValue !== undefined &&
      exitDate &&
      exitTime &&
      isExitDateTimeValid &&
      (!requiresEmotionFields || emotionAfter) &&
      hasRequiredActualEntryScreenshot &&
      hasRequiredExitScreenshot,
  );
  const canCloseTrade = canSaveTrade;
  const missingClass = 'rounded-md bg-dangerSoft/40 p-2 ring-1 ring-dangerSoft';
  const missingFieldClass = (missing: boolean) => (didTrySubmit && missing ? missingClass : '');
  const spotBuyPriceValue = toNumber(spotBuyPrice);
  const spotQuantityBoughtValue = toNumber(spotQuantityBought);
  const spotCurrentPortfolioValueNumber = toNumber(spotCurrentPortfolioValue);
  const spotExpectedBuyCost =
    spotBuyPriceValue !== undefined && spotQuantityBoughtValue !== undefined
      ? spotBuyPriceValue * spotQuantityBoughtValue
      : undefined;
  const spotSellPriceValue = toNumber(spotSellPrice);
  const spotQuantitySoldValue = toNumber(spotQuantitySold);
  const spotActualReceivedValue = toNumber(spotActualReceived);
  const spotExpectedSellValue =
    spotSellPriceValue !== undefined && spotQuantitySoldValue !== undefined
      ? spotSellPriceValue * spotQuantitySoldValue
      : undefined;
  const spotSellFeesSlippage =
    spotExpectedSellValue !== undefined && spotActualReceivedValue !== undefined
      ? spotExpectedSellValue - spotActualReceivedValue
      : undefined;
  const spotCostBasisSold =
    spotBuyPriceValue !== undefined && spotQuantitySoldValue !== undefined
      ? spotBuyPriceValue * spotQuantitySoldValue
      : undefined;
  const spotNetPnl =
    spotExpectedSellValue !== undefined && spotCostBasisSold !== undefined
      ? (spotActualReceivedValue ?? spotExpectedSellValue) - spotCostBasisSold
      : undefined;
  const spotRemainingAfterSell =
    spotToEdit && spotQuantitySoldValue !== undefined
      ? Math.max(0, getSpotRemainingQuantity(spotToEdit) - spotQuantitySoldValue)
      : spotQuantityBoughtValue !== undefined && spotQuantitySoldValue !== undefined
        ? Math.max(0, spotQuantityBoughtValue - spotQuantitySoldValue)
        : spotToEdit ? getSpotRemainingQuantity(spotToEdit) : spotQuantityBoughtValue;
  const spotRoi =
    spotNetPnl !== undefined && spotCostBasisSold !== undefined && spotCostBasisSold > 0
      ? (spotNetPnl / spotCostBasisSold) * 100
      : undefined;
  const hasSpotSellDraft = Boolean(
    spotSellTime ||
      spotSellPrice.trim() ||
      spotQuantitySold.trim() ||
      spotActualReceived.trim() ||
      spotReasonExit.trim() ||
      hasScreenshotContent(screenshots.exit_result),
  );
  const isSpotClosedForEditing = Boolean(spotToEdit && !isSpotOpen(spotToEdit));
  const spotSellMaxQuantity = spotToEdit ? getSpotRemainingQuantity(spotToEdit) : spotQuantityBoughtValue;
  const isSpotQuantitySoldValid = Boolean(
    spotQuantitySoldValue !== undefined &&
      spotQuantitySoldValue > 0 &&
      (spotSellMaxQuantity === undefined || spotQuantitySoldValue <= spotSellMaxQuantity),
  );
  const canSaveSpotBuyDetails = Boolean(
    spotAssetName.trim() &&
      assetType &&
      isAssetNameAllowedForType(spotAssetName, assetType, assetTypeBySymbol, spotToEdit?.assetType) &&
      entryDate &&
      spotBuyPriceValue !== undefined &&
      spotBuyPriceValue > 0 &&
      spotQuantityBoughtValue !== undefined &&
      spotQuantityBoughtValue > 0,
  );
  const canSellSpot = Boolean(
    spotSellDate &&
      spotSellPriceValue !== undefined &&
      isSpotQuantitySoldValid,
  );
  const canSaveSpot = canSaveSpotBuyDetails && (!hasSpotSellDraft || canSellSpot);
  const hasMinimumRequiredFields =
    (entryType === 'trade'
      ? (isCompletedTradeFlow ? canCloseTrade : canOpenTrade)
      : entryType === 'spot'
        ? canSaveSpot
        : Boolean(title.trim())) ||
    isLockedLiveTrade;

  useEffect(() => {
    if (!isTradeModeAllowed(journalType, mode)) {
      setMode(defaultTradeMode);
      setTradeEntryMode(defaultTradeMode === 'live' ? 'openOnly' : 'openClose');
    }
  }, [defaultTradeMode, journalType, mode]);

  useEffect(() => {
    if (!isLiveTradeMode && tradeEntryMode !== 'openClose') {
      setTradeEntryMode('openClose');
    }
  }, [isLiveTradeMode, tradeEntryMode]);

  useEffect(() => {
    if (!isOpen || tradeToEdit) return;

    if (mode === 'live') {
      setEntryDate(date);
      setEntryTime('');
      if (!isCompletedTradeFlow) {
        setExitDate('');
        setExitTime('');
      }
      return;
    }

    if (mode === 'backtesting') {
      setEntryDate(lastBacktestingTrade?.entryDate ?? '');
      setExitDate(lastBacktestingTrade?.exitDate ?? '');
      setEntryTime('');
      setExitTime('');
    }
  }, [date, isCompletedTradeFlow, isOpen, lastBacktestingTrade?.entryDate, lastBacktestingTrade?.exitDate, mode, tradeToEdit]);

  useEffect(() => {
    if (!isCompletedTradeFlow || !entryDate || !exitDate) return;

    if (exitDate < entryDate) {
      setExitDate(entryDate);
      return;
    }

    if (exitDate === entryDate && entryTime && exitTime && exitTime < entryTime) {
      setExitTime(entryTime);
    }
  }, [entryDate, entryTime, exitDate, exitTime, isCompletedTradeFlow]);

  useEffect(() => {
    if (mode === 'backtesting') {
      setEmotionBefore('');
      setEmotionAfter('');
    }
  }, [mode]);

  useEffect(() => {
    if (symbol && !isAssetNameAllowedForType(symbol, assetType, assetTypeBySymbol, tradeToEdit?.assetType)) {
      setSymbol('');
    }
  }, [assetType, assetTypeBySymbol, symbol, tradeToEdit?.assetType]);

  useEffect(() => {
    if (spotAssetName && !isAssetNameAllowedForType(spotAssetName, assetType, assetTypeBySymbol, spotToEdit?.assetType)) {
      setSpotAssetName('');
    }
  }, [assetType, assetTypeBySymbol, spotAssetName, spotToEdit?.assetType]);

  useEffect(() => {
    if (isOpen && isCompletedTradeFlow) {
      setIsScreenshotsOpen(true);
    }
  }, [isCompletedTradeFlow, isOpen]);

  useEffect(() => {
    if (didTrySubmit) {
      setIsScreenshotsOpen(true);
    }
  }, [didTrySubmit]);

  const reset = useCallback(() => {
    const nextMode = lastTrade?.mode && isTradeModeAllowed(journalType, lastTrade.mode) ? lastTrade.mode : defaultTradeMode;
    setEntryType(journalType === 'spotOnly' ? 'spot' : initialEntryType);
    setTradeEntryMode(nextMode === 'live' ? 'openOnly' : 'openClose');
    setDidTrySubmit(false);
    setIsAdvancedDetailsOpen(false);
    setIsScreenshotsOpen(false);
    setIsSpotSellDetailsOpen(false);
    setIsNotesOpen(false);
    setTitle('');
    setResult('win');
    setMode(nextMode);
    setDirection(lastTrade?.direction ?? 'long');
    setAdherence('followed');
    const nextAssetType = lastTrade?.assetType ?? 'crypto';
    setAssetType(nextAssetType);
    setSymbol(lastTrade?.coin ?? getFirstSymbolForAssetType(symbolOptions, assetTypeBySymbol, nextAssetType));
    setStrategyId(lastTrade?.strategyId ?? strategyOptions[0].value);
    setCategoryId(lastTrade?.categoryId ?? 'trading');
    setTaskType(taskTypeOptions[0].value);
    setEmotionBefore(emotionOptions[0].value);
    setEmotionAfter('');
    setEntryDate(nextMode === 'backtesting' ? lastBacktestingTrade?.entryDate ?? '' : date);
    setEntryTime('');
    setExitDate(nextMode === 'backtesting' ? lastBacktestingTrade?.exitDate ?? '' : date);
    setExitTime('');
    setTaskEndTime('10:00');
    setPnlInput('');
    setStopPercentage('');
    setRiskDollars('');
    setNotes('');
    setImprovements('');
    setPreservationPoints('');
    setSharpeningNeeded('');
    setRuleViolations([]);
    setScreenshots(lastTrade ? createScreenshotDraftFromTrade(lastTrade) : createScreenshotDraft());
    setNewSymbol('');
    setNewTimeframeAmount('');
    setNewTimeframeUnit('h');
    setSpotAssetName('');
    setSpotBuyPrice('');
    setSpotQuantityBought('');
    setSpotCurrentPortfolioValue('');
    setSpotTargetPrice('');
    setSpotStopLoss('');
    setSpotTakeProfit('');
    setSpotReasonEntry('');
    setSpotSellDate('');
    setSpotSellTime('');
    setSpotSellPrice('');
    setSpotQuantitySold('');
    setSpotActualReceived('');
    setSpotReasonExit('');
  }, [assetTypeBySymbol, date, defaultTradeMode, initialEntryType, journalType, lastBacktestingTrade?.entryDate, lastBacktestingTrade?.exitDate, lastTrade, symbolOptions]);

  useEffect(() => {
    if (!isOpen) return;

    if (spotToEdit) {
      setEntryType('spot');
      setDidTrySubmit(false);
      setIsAdvancedDetailsOpen(true);
      setIsScreenshotsOpen(false);
      setIsSpotSellDetailsOpen(isSpotOpen(spotToEdit));
      setIsNotesOpen(true);
      setSpotAssetName(spotToEdit.assetName);
      setAssetType(spotToEdit.assetType);
      setEntryDate(spotToEdit.buyDate);
      setEntryTime(spotToEdit.buyTime ?? '');
      setSpotBuyPrice(String(spotToEdit.buyPrice));
      setSpotQuantityBought(String(spotToEdit.quantityBought));
      setSpotCurrentPortfolioValue(spotToEdit.currentPortfolioValue === undefined ? '' : String(spotToEdit.currentPortfolioValue));
      setSpotTargetPrice(spotToEdit.targetPrice ? String(spotToEdit.targetPrice) : '');
      setSpotStopLoss(spotToEdit.stopLoss ? String(spotToEdit.stopLoss) : '');
      setSpotTakeProfit(spotToEdit.takeProfit ? String(spotToEdit.takeProfit) : '');
      setSpotReasonEntry(spotToEdit.reasonForEntry ?? '');
      setNotes(spotToEdit.notes ?? '');
      setSpotSellDate(closeExitDate ?? '');
      setSpotSellTime('');
      setSpotSellPrice('');
      setSpotQuantitySold('');
      setSpotActualReceived('');
      setSpotReasonExit('');
      return;
    }

    if (tradeToEdit) {
      setEntryType('trade');
      setDidTrySubmit(false);
      setTradeEntryMode('openClose');
      setIsAdvancedDetailsOpen(true);
      setIsScreenshotsOpen(false);
      setIsNotesOpen(false);
      setTitle(tradeToEdit.title ?? '');
      setResult(tradeToEdit.result);
      setMode(tradeToEdit.mode);
      setDirection(tradeToEdit.direction);
      setAdherence(tradeToEdit.adherence);
      setSymbol(tradeToEdit.coin);
      setAssetType(tradeToEdit.assetType ?? 'crypto');
      setStrategyId(tradeToEdit.strategyId ?? strategyOptions[0].value);
      setCategoryId(tradeToEdit.categoryId ?? 'trading');
      setEmotionBefore(tradeToEdit.emotion_before);
      setEmotionAfter(tradeToEdit.emotion_after ?? '');
      setEntryDate(tradeToEdit.entryDate);
      setEntryTime(tradeToEdit.entryTime);
      setExitDate(closeExitDate ?? tradeToEdit.exitDate ?? tradeToEdit.entryDate);
      setExitTime(tradeToEdit.exitTime ?? '');
      setPnlInput(String(tradeToEdit.pnlInput));
      setStopPercentage(tradeToEdit.stopPercentage ? String(tradeToEdit.stopPercentage) : '');
      setRiskDollars(String(tradeToEdit.riskDollars));
      setNotes(tradeToEdit.notes ?? '');
      setImprovements(tradeToEdit.improvements ?? '');
      setPreservationPoints(tradeToEdit.preservationPoints ?? '');
      setSharpeningNeeded(tradeToEdit.sharpeningNeeded ?? '');
      setRuleViolations(tradeToEdit.ruleViolations);
      setScreenshots(() => {
        const draft = createScreenshotDraft();
        tradeToEdit.screenshots.forEach((slot) => {
          const slotType = getScreenshotSlotType(slot);
          draft[slotType] = {
            ...draft[slotType],
            ...slot,
            id: slot.id || slotType,
            slotType,
            description: slot.description ?? '',
            order: slot.order ?? draft[slotType].order,
            uploadPlaceholder: slot.uploadPlaceholder ?? 'pending',
            aiAnalysisStatus: slot.aiAnalysisStatus ?? 'not_started',
          };
        });
        return draft;
      });
      return;
    }

    if (taskToEdit) {
      setEntryType('task');
      setTitle(taskToEdit.title);
      setTaskType(taskToEdit.taskType ?? taskTypeOptions[0].value);
      setCategoryId(taskToEdit.categoryId ?? 'personal_tasks');
      setEntryTime(taskToEdit.startTime ?? '09:30');
      setTaskEndTime(taskToEdit.endTime ?? '10:00');
      setNotes(taskToEdit.notes ?? '');
      return;
    }

    reset();
  }, [closeExitDate, date, isOpen, reset, spotToEdit, taskToEdit, tradeToEdit]);

  const close = () => {
    reset();
    onClose();
  };

  const toggleViolation = (value: string) => {
    setRuleViolations((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  };

  const updateScreenshot = (
    slot: ScreenshotSlotType,
    field: keyof ScreenshotDraft[ScreenshotSlotType],
    value: ScreenshotDraft[ScreenshotSlotType][keyof ScreenshotDraft[ScreenshotSlotType]],
  ) => {
    setScreenshots((current) => ({ ...current, [slot]: { ...current[slot], [field]: value } }));
  };

  const applyScreenshotFile = (slot: ScreenshotSlotType, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    const localPreviewUrl = URL.createObjectURL(file);
    setScreenshots((current) => ({
      ...current,
      [slot]: {
        ...current[slot],
        localPreviewUrl,
        uploadedAt: new Date().toISOString(),
        uploadPlaceholder: file.name,
      },
    }));
  };

  const uploadScreenshotPreview = (slot: ScreenshotSlotType, event: ChangeEvent<HTMLInputElement>) => {
    applyScreenshotFile(slot, event.target.files?.[0]);
    event.target.value = '';
  };

  const dropScreenshotPreview = (slot: ScreenshotSlotType, event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    applyScreenshotFile(slot, event.dataTransfer.files?.[0]);
  };

  const pasteScreenshotPreview = (slot: ScreenshotSlotType, event: ClipboardEvent<HTMLButtonElement>) => {
    const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith('image/'));
    applyScreenshotFile(slot, file);
  };

  const removeScreenshotPreview = (slot: ScreenshotSlotType) => {
    setScreenshots((current) => ({
      ...current,
      [slot]: {
        ...current[slot],
        localPreviewUrl: undefined,
        cloudUrl: undefined,
        uploadedAt: undefined,
        uploadPlaceholder: 'pending',
      },
    }));
  };

  const buildScreenshotSlots = (): ScreenshotSlot[] =>
    screenshotSlotOptions.map((slot, index) => {
      const draft = screenshots[slot.value];

      return {
        id: draft.id || slot.value,
        slotType: slot.value,
        timeframe: draft.timeframe,
        description: draft.description.trim(),
        localPreviewUrl: draft.localPreviewUrl,
        cloudUrl: draft.cloudUrl,
        uploadedAt: draft.uploadedAt,
        order: draft.order ?? index,
        uploadPlaceholder: draft.uploadPlaceholder ?? 'pending',
        aiAnalysisStatus: draft.aiAnalysisStatus ?? 'not_started',
        aiNotes: draft.aiNotes,
        detectedTimeframe: draft.detectedTimeframe,
        detectedPattern: draft.detectedPattern,
        userCorrection: draft.userCorrection,
      };
    });

  const addCurrentSymbol = () => {
    const normalized = newSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!normalized) return;

    addSymbolOption(normalized, assetType);
    if (entryType === 'spot') {
      setSpotAssetName(normalized);
    } else {
      setSymbol(normalized);
    }
    setNewSymbol('');
  };

  const addCurrentTimeframe = () => {
    if (!newTimeframeAmount) return;

    addScreenshotTimeframe(`${newTimeframeAmount}${newTimeframeUnit}`);
    const addedTimeframe = `${newTimeframeAmount}${newTimeframeUnit}`;
    setScreenshots((current) => ({
      ...current,
      actual_entry_timeframe: { ...current.actual_entry_timeframe, timeframe: addedTimeframe },
    }));
    setNewTimeframeAmount('');
    setNewTimeframeUnit('h');
  };

  const duplicateLastTrade = () => {
    if (!lastTrade || tradeToEdit || isViewOnly) return;

    setEntryType('trade');
    setTradeEntryMode(lastTrade.mode === 'live' ? 'openOnly' : 'openClose');
    setMode(lastTrade.mode);
    setDirection(lastTrade.direction);
    setAssetType(lastTrade.assetType ?? 'crypto');
    setSymbol(lastTrade.coin);
    setStrategyId(lastTrade.strategyId ?? strategyOptions[0].value);
    setCategoryId(lastTrade.categoryId ?? 'trading');
    setScreenshots(createScreenshotDraftFromTrade(lastTrade));
    setTitle('');
    setResult('win');
    setEntryDate(date);
    setEntryTime('');
    setExitDate(date);
    setExitTime('');
    setPnlInput('');
    setRiskDollars('');
    setStopPercentage('');
    setNotes('');
    setImprovements('');
    setPreservationPoints('');
    setSharpeningNeeded('');
    setRuleViolations([]);
    setEmotionAfter('');
  };

  const handleTradeSubmit = (nextStatus: 'open' | 'closed') => {
    if (isViewOnly) return;

    const canSubmitTrade =
      nextStatus === 'open' ? canOpenTrade : canSaveTrade;

    if (!canSubmitTrade) {
      setDidTrySubmit(true);
      setTimeout(() => document.querySelector('[data-missing="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
      return;
    }

    const input = {
        date,
        title,
        status: nextStatus,
        result,
        mode,
        entryDate,
        entryTime,
        exitDate: nextStatus === 'closed' ? exitDate : undefined,
        exitTime: nextStatus === 'closed' ? exitTime : undefined,
        pnl: signedPnl,
        pnlInput: absolutePnlValue ?? 0,
        rr: calculatedRr ?? 0,
        stopPercentage: toNumber(stopPercentage),
        riskDollars: riskValue ?? 0,
        coin: symbol,
        assetType,
        strategyId,
        direction,
        adherence,
        emotionBefore,
        emotionAfter: emotionAfter || undefined,
        ruleViolations,
        categoryId,
        notes,
        improvements,
        preservationPoints,
        sharpeningNeeded,
        screenshots: buildScreenshotSlots(),
      };
      if (tradeToEdit) {
        updateTrade(tradeToEdit.id, input);
      } else {
        addTrade(input);
      }
    close();
  };

  const handleSpotSubmit = () => {
    if (isViewOnly) return;

    if (!canSaveSpot || !spotBuyPriceValue || !spotQuantityBoughtValue) {
      setDidTrySubmit(true);
      if (hasSpotSellDraft) setIsSpotSellDetailsOpen(true);
      setTimeout(() => document.querySelector('[data-missing="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
      return;
    }

    const sellInput =
      hasSpotSellDraft && canSellSpot && spotSellPriceValue && spotQuantitySoldValue
        ? {
            sellDate: spotSellDate,
            sellTime: spotSellTime || undefined,
            sellPrice: spotSellPriceValue,
            quantitySold: spotQuantitySoldValue,
            actualAmountReceived: spotActualReceivedValue ?? spotSellPriceValue * spotQuantitySoldValue,
            reasonForExit: spotReasonExit,
            notes,
            screenshots: [screenshots.exit_result]
              .filter(hasScreenshotContent)
              .map((slot) => ({ ...slot, description: slot.description.trim() })),
          }
        : undefined;

    const input = {
      date: entryDate,
      assetName: spotAssetName,
      assetType,
      buyDate: entryDate,
      buyTime: entryTime || undefined,
      buyPrice: spotBuyPriceValue,
      quantityBought: spotQuantityBoughtValue,
      actualAmountPaid: spotBuyPriceValue * spotQuantityBoughtValue,
      currentPortfolioValue: spotCurrentPortfolioValueNumber,
      targetPrice: toNumber(spotTargetPrice),
      stopLoss: toNumber(spotStopLoss),
      takeProfit: toNumber(spotTakeProfit),
      reasonForEntry: spotReasonEntry,
      notes,
      screenshots: buildScreenshotSlots()
        .filter((slot) => slot.slotType !== 'exit_result')
        .filter((slot) => hasScreenshotContent(slot as ScreenshotDraftItem)),
      sell: sellInput,
    };

    if (spotToEdit) {
      updateSpot(spotToEdit.id, input);
      if (sellInput) {
        addSpotSell(spotToEdit.id, sellInput);
      }
    } else {
      addSpot(input);
    }
    close();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isViewOnly) return;

    if (entryType === 'trade') {
      if (!isLiveTradeMode) {
        handleTradeSubmit('closed');
      }
      return;
    }

    if (entryType === 'spot') {
      handleSpotSubmit();
      return;
    } else {
      if (!title.trim()) {
        setDidTrySubmit(true);
        setTimeout(() => document.querySelector('[data-missing="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
        return;
      }

      const input = {
        date,
        title,
        startTime: entryTime,
        endTime: taskEndTime,
        taskType,
        categoryId,
        notes,
      };
      if (taskToEdit) {
        updateTask(taskToEdit.id, input);
      } else {
        addTask(input);
      }
    }

    close();
  };

  return (
    <Modal
      closeLabel={t('close')}
      isOpen={isOpen}
      onClose={close}
      title={taskToEdit || tradeToEdit ? t('editEntry') : t('addEntry')}
    >
      <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
        {isLockedLiveTrade ? (
          <p className="rounded-md bg-dangerSoft p-3 text-sm font-bold text-danger">{t('lockedViewOnly')}</p>
        ) : null}
        {tradeToEdit?.status === 'closed' && tradeToEdit.mode === 'live' ? (
          <p className="rounded-md bg-muted p-3 text-sm font-semibold text-subtle">
            {t('lockedAfter12Hours')} {getClosedTradeEditableUntil(tradeToEdit) ? `${t('editableUntil')}: ${new Date(getClosedTradeEditableUntil(tradeToEdit) as string).toLocaleString()}` : ''}
          </p>
        ) : null}
        {isViewOnly ? (
          <p className="rounded-md bg-muted p-3 text-sm font-bold text-subtle">{t('lockedViewOnly')}</p>
        ) : null}
        <SegmentedControl
          onChange={setEntryType}
          options={[
            ...(journalType === 'spotOnly' ? [] : [{ value: 'trade' as const, label: t('trade') }]),
            ...(journalType === 'liveOnly' || journalType === 'backtestingOnly' ? [] : [{ value: 'spot' as const, label: language === 'he' ? 'ספוט' : 'Spot' }]),
            { value: 'task' as const, label: t('task') },
          ]}
          value={entryType}
        />
        {entryType === 'trade' ? (
          <div className="grid gap-2 rounded-md border border-border bg-surface p-3 shadow-soft">
            {!tradeToEdit ? (
              <Button
                className="justify-self-start border border-primary bg-primary/10 text-primary hover:bg-primary hover:text-white"
                disabled={!lastTrade || isViewOnly}
                onClick={duplicateLastTrade}
                title={language === 'he' ? 'מעתיק מטבע, כיוון, אסטרטגיה, זהות ומבנה. לא מעתיק תוצאה, רווח/הפסד, הערות או זמנים.' : 'Copies coin, direction, strategy, identity, and structure. It does not copy result, P/L, notes, or times.'}
                type="button"
                variant="secondary"
              >
                {language === 'he' ? 'שכפל טרייד אחרון' : 'Duplicate Last Trade'}
              </Button>
            ) : null}
          </div>
        ) : null}

        {entryType === 'trade' ? (
          <>
            <FormSection required title={t('tradeIdentity')}>
              <SegmentedControl
                onChange={(value) => {
                  setMode(value);
                  if (value !== 'live') setTradeEntryMode('openClose');
                }}
                options={mapOptions(tradeModeOptions).filter((option) => allowedTradeModes.includes(option.value))}
                value={mode}
              />
              {isLiveTradeMode ? (
                <SegmentedControl
                  onChange={setTradeEntryMode}
                  options={[
                    { value: 'openOnly', label: language === 'he' ? 'פתיחה בלבד' : 'Open only' },
                    { value: 'openClose', label: language === 'he' ? 'פתיחה + סגירה' : 'Open + Close' },
                  ]}
                  value={tradeEntryMode}
                />
              ) : null}
              {shouldShowCapitalPrompt ? <div className={`grid gap-2 rounded-md p-3 text-sm font-bold ${isMissingLiveAccountValue ? 'bg-dangerSoft text-danger' : isMissingSimulatedAccountValue ? 'bg-yellow-100 text-ink' : 'bg-muted text-ink'}`}>
                  <span>
                    {isMissingLiveAccountValue
                      ? language === 'he'
                        ? 'יש להגדיר שווי תיק עבור מצב זה לפני הוספת טרייד.'
                        : 'Set capital for this mode before adding a trade.'
                      : isMissingSimulatedAccountValue
                        ? language === 'he'
                          ? 'מומלץ להגדיר הון מדומה למצב זה. אפשר להמשיך ולהוסיף טרייד.'
                          : 'Recommended: set Backtesting capital for this mode. You can still add the trade.'
                      : `${language === 'he' ? 'שווי תיק למצב זה' : 'Capital for this mode'}: ${formatAccountValue(accountValueForEntryDate?.value)} (${accountValueForEntryDate?.date})`}
                  </span>
                  {isMissingModeAccountValue && typeof onOpenAccountSettings === 'function' ? (
                    <Button
                      className="justify-self-start"
                      onClick={() => {
                        close();
                        onOpenAccountSettings(mode);
                      }}
                      type="button"
                      variant="secondary"
                    >
                      {language === 'he' ? 'הגדר שווי תיק עבור מצב זה' : 'Set capital for this mode'}
                    </Button>
                  ) : null}
              </div> : null}
            </FormSection>

            <FormSection title={t('entryDate')}>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className={missingFieldClass(!entryDate)} data-missing={didTrySubmit && !entryDate ? 'true' : undefined}>
                  <TextInput disabled={isLockedLiveTrade || isViewOnly} label={t('entryDate')} onChange={(event) => setEntryDate(event.target.value)} required type="date" value={entryDate} />
                </div>
                <div className={missingFieldClass(!entryTime)} data-missing={didTrySubmit && !entryTime ? 'true' : undefined}>
                  <Select disabled={isLockedLiveTrade || isViewOnly} label={t('entryTime')} onValueChange={setEntryTime} options={[{ value: '', label: '-' }, ...timeSelectOptions]} required value={entryTime} />
                </div>
                {isCompletedTradeFlow ? (
                  <>
                    <div className={missingFieldClass(!exitDate || isExitDateBeforeEntry)} data-missing={didTrySubmit && (!exitDate || isExitDateBeforeEntry) ? 'true' : undefined}>
                      <TextInput disabled={isLockedLiveTrade || isViewOnly} label={language === 'he' ? 'תאריך יציאה' : 'Exit date'} onChange={(event) => setExitDate(event.target.value)} required type="date" value={exitDate} />
                    </div>
                    <div className={missingFieldClass(!exitTime || isExitTimeBeforeEntry)} data-missing={didTrySubmit && (!exitTime || isExitTimeBeforeEntry) ? 'true' : undefined}>
                      <Select disabled={isLockedLiveTrade || isViewOnly} label={t('exitTime')} onValueChange={setExitTime} options={exitTimeSelectOptions} required value={exitTime} />
                    </div>
                  </>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className={missingFieldClass(!assetType)} data-missing={didTrySubmit && !assetType ? 'true' : undefined}>
                  <Select disabled={isLockedLiveTrade || isViewOnly} label={t('assetType')} onValueChange={setAssetType} options={assetTypeSelectOptions} required value={assetType} />
                </div>
                <div className={missingFieldClass(!symbol.trim())} data-missing={didTrySubmit && !symbol.trim() ? 'true' : undefined}>
                  <Select
                    disabled={isLockedLiveTrade || isViewOnly}
                    label={t('symbol')}
                    onValueChange={setSymbol}
                    options={[{ value: '', label: '-' }, ...filteredSymbolOptions]}
                    required
                    value={symbol}
                  />
                </div>
                <div className={missingFieldClass(!strategyId)} data-missing={didTrySubmit && !strategyId ? 'true' : undefined}>
                  <Select disabled={isLockedLiveTrade || isViewOnly} label={t('strategy')} onValueChange={setStrategyId} options={strategySelectOptions} required value={strategyId} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className={missingFieldClass(!riskValue || riskValue <= 0)} data-missing={didTrySubmit && (!riskValue || riskValue <= 0) ? 'true' : undefined}>
                  <TextInput disabled={isLockedLiveTrade || isViewOnly} inputMode="decimal" label={t('riskDollars')} min="0" onChange={(event) => setRiskDollars(event.target.value)} required step="0.01" type="number" value={riskDollars} />
                </div>
                <div className={missingFieldClass(!hasRequiredStop)} data-missing={didTrySubmit && !hasRequiredStop ? 'true' : undefined}>
                  <TextInput disabled={isLockedLiveTrade || isViewOnly} inputMode="decimal" label={t('stopPercentage')} min="0" onChange={(event) => setStopPercentage(event.target.value)} required step="0.01" type="number" value={stopPercentage} />
                </div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <TextInput
                  disabled={isLockedLiveTrade || isViewOnly}
                  label={t('newSymbol')}
                  onChange={(event) => setNewSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder={t('symbolExamples')}
                  value={newSymbol}
                />
                <Button className="self-end" disabled={isLockedLiveTrade || isViewOnly || !newSymbol} onClick={addCurrentSymbol} type="button" variant="secondary">{t('addSymbol')}</Button>
              </div>
            </FormSection>

            <FormSection title={t('trade')}>
              <div className="grid gap-3">
                <QuickChips required label={t('direction')} options={mapOptions(tradeDirectionOptions)} onSelect={setDirection} value={direction} />
                {isCompletedTradeFlow ? (
                  <QuickChips
                    required
                    label={t('result')}
                    options={mapOptions(tradeResultOptions)}
                    onSelect={(value) => {
                      setResult(value);
                      if (value === 'breakeven') setPnlInput('0');
                    }}
                    value={result}
                  />
                ) : null}
                <QuickChips required label={t('adherence')} options={mapOptions(adherenceOptions)} onSelect={setAdherence} value={adherence} />
                {!isBacktestingMode ? (
                  <QuickChips required label={t('emotionBefore')} options={emotionSelectOptions.slice(0, 8)} onSelect={setEmotionBefore} value={emotionBefore} />
                ) : null}
              </div>
            </FormSection>

            {isCompletedTradeFlow ? (
            <FormSection title={t('pnl')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className={missingFieldClass(absolutePnlValue === undefined)} data-missing={didTrySubmit && absolutePnlValue === undefined ? 'true' : undefined}>
                  <TextInput disabled={isLockedLiveTrade || isViewOnly || result === 'breakeven'} inputMode="decimal" label={t('absolutePnl')} min="0" onChange={(event) => setPnlInput(event.target.value)} required step="0.01" type="number" value={result === 'breakeven' ? '0' : pnlInput} />
                </div>
              </div>
              <div className="grid gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:grid-cols-2">
                <span>{t('signedPnl')}: {formatSignedMoney(signedPnl)}</span>
                <span>{t('calculatedRr')}: {calculatedRr === undefined ? '-' : calculatedRr.toFixed(2)}</span>
              </div>
            </FormSection>
            ) : null}
            {isCompletedTradeFlow ? (
              <div className="rounded-md bg-muted p-3 text-sm font-bold text-ink">
                {language === 'he' ? 'משך העסקה' : 'Trade duration'}: {tradeDuration}
              </div>
            ) : null}
            {!isExitDateTimeValid ? (
              <p className="rounded-md bg-dangerSoft p-3 text-sm font-bold text-danger">
                {language === 'he' ? 'תאריך/שעת יציאה לא יכולים להיות לפני הכניסה.' : 'Exit date/time cannot be before the entry.'}
              </p>
            ) : null}

            {isCompletedTradeFlow ? (
              <CollapsibleSection
                isOpen={isAdvancedDetailsOpen}
                onToggle={() => setIsAdvancedDetailsOpen((current) => !current)}
                title={language === 'he' ? 'פרטים מתקדמים' : 'Advanced Details'}
              >
                <TextInput
                  disabled={isLockedLiveTrade || isViewOnly}
                  label={t('optionalTitle')}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t('optionalTitle')}
                  value={title}
                />
                <Select disabled={isLockedLiveTrade || isViewOnly} label={t('category')} onValueChange={setCategoryId} options={categoryOptions} value={categoryId} />
              </CollapsibleSection>
            ) : null}

            {isCompletedTradeFlow && !isBacktestingMode ? (
            <FormSection title={t('psychologyReview')}>
              <div className={missingFieldClass(!emotionAfter)} data-missing={didTrySubmit && !emotionAfter ? 'true' : undefined}>
                <Select disabled={isLockedLiveTrade || isViewOnly} label={t('emotionAfter')} onValueChange={setEmotionAfter} options={[{ value: '', label: '-' }, ...emotionSelectOptions]} required value={emotionAfter} />
              </div>
              <div className="grid gap-2 text-sm font-semibold text-ink">
                {t('ruleViolations')}
                <div className="grid gap-2 sm:grid-cols-2">
                  {ruleViolationSelectOptions.map((option) => (
                    <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 font-normal" key={option.value}>
                      <input checked={ruleViolations.includes(option.value)} disabled={isLockedLiveTrade || isViewOnly} onChange={() => toggleViolation(option.value)} type="checkbox" />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
            </FormSection>
            ) : null}

            <CollapsibleSection isOpen={isScreenshotsOpen} onToggle={() => setIsScreenshotsOpen((current) => !current)} title={t('timeframeScreenshots')}>
              <div className="flex flex-col gap-2 rounded-md bg-muted p-3 sm:flex-row sm:items-end">
                <TextInput disabled={isLockedLiveTrade || isViewOnly} inputMode="numeric" label={t('timeframeAmount')} min="1" onChange={(event) => setNewTimeframeAmount(event.target.value.replace(/\D/g, ''))} placeholder="8" type="number" value={newTimeframeAmount} />
                <Select
                  disabled={isLockedLiveTrade || isViewOnly}
                  label={t('timeframe')}
                  onValueChange={setNewTimeframeUnit}
                  options={[
                    { value: 'm', label: t('minutesUnit') },
                    { value: 'h', label: t('hoursUnit') },
                    { value: 'D', label: t('daysUnit') },
                  ]}
                  value={newTimeframeUnit}
                />
                <Button disabled={isLockedLiveTrade || isViewOnly || !newTimeframeAmount} onClick={addCurrentTimeframe} type="button" variant="secondary">{t('addTimeframe')}</Button>
              </div>
              <div className="grid gap-3">
                {screenshotSlotOptions.map((slot) => {
                  const isRequiredScreenshot =
                    slot.value === 'actual_entry_timeframe' ||
                    (isCompletedTradeFlow && slot.value === 'exit_result');
                  if (!isCompletedTradeFlow && slot.value === 'exit_result') return null;
                  const screenshot = screenshots[slot.value];
                  const previewUrl = screenshot.localPreviewUrl || screenshot.cloudUrl;
                  const isMissingScreenshot = didTrySubmit && isRequiredScreenshot && !hasScreenshotContent(screenshot);
                  const isMissingExitDescription = didTrySubmit && slot.value === 'exit_result' && isCompletedTradeFlow && !screenshot.description.trim();

                  return (
                    <div className={`grid gap-4 rounded-md border p-4 ${isMissingScreenshot || isMissingExitDescription ? 'border-dangerSoft bg-dangerSoft/40' : 'border-border bg-background'}`} data-missing={isMissingScreenshot || isMissingExitDescription ? 'true' : undefined} key={slot.value}>
                      <div className={`text-sm font-bold ${isMissingScreenshot || isMissingExitDescription ? 'text-danger' : 'text-ink'}`}>
                        {t(slot.labelKey)}
                        {isRequiredScreenshot ? <span className="ms-1 text-danger" aria-hidden="true">*</span> : null}
                      </div>
                      <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_180px]">
                        <Select disabled={isLockedLiveTrade || isViewOnly} label={t('timeframe')} onValueChange={(value) => updateScreenshot(slot.value, 'timeframe', value)} options={timeframeSelectOptions} required={isRequiredScreenshot} value={screenshots[slot.value].timeframe} />
                        <Textarea className={`min-h-28 ${isMissingExitDescription ? 'bg-dangerSoft/40 font-bold' : ''}`} disabled={isLockedLiveTrade || isViewOnly} label={t('description')} onChange={(event) => updateScreenshot(slot.value, 'description', event.target.value)} required={isRequiredScreenshot} value={screenshots[slot.value].description} />
                        <div className="grid gap-2 text-sm font-semibold text-ink">
                          <span>
                            {language === 'he' ? 'צילום מסך' : 'Screenshot'}
                            {isRequiredScreenshot ? <span className="ms-1 text-danger" aria-hidden="true">*</span> : null}
                          </span>
                          <button
                            className="grid min-h-36 place-items-center overflow-hidden rounded-md border border-dashed border-border bg-muted px-3 py-2 text-center text-sm font-semibold text-subtle transition hover:border-primary hover:bg-background"
                            disabled={isLockedLiveTrade || isViewOnly}
                            onClick={() => (previewUrl ? setPreviewScreenshot(screenshot) : uploadInputRefs.current[slot.value]?.click())}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => dropScreenshotPreview(slot.value, event)}
                            onPaste={(event) => pasteScreenshotPreview(slot.value, event)}
                            type="button"
                          >
                            {previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img alt={t(slot.labelKey)} className="max-h-32 w-full rounded object-contain" src={previewUrl} />
                            ) : (
                              <span>{language === 'he' ? 'לחץ להעלאה, גרור תמונה, או הדבק מהלוח' : 'Click to upload, drag an image, or paste from clipboard'}</span>
                            )}
                          </button>
                          <input
                            accept="image/*"
                            className="hidden"
                            disabled={isLockedLiveTrade || isViewOnly}
                            onChange={(event) => uploadScreenshotPreview(slot.value, event)}
                            ref={(element) => {
                              uploadInputRefs.current[slot.value] = element;
                            }}
                            type="file"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Button disabled={isLockedLiveTrade || isViewOnly} onClick={() => uploadInputRefs.current[slot.value]?.click()} type="button" variant="secondary">
                              {previewUrl ? (language === 'he' ? 'החלפה' : 'Replace') : (language === 'he' ? 'העלאה' : 'Upload')}
                            </Button>
                            <Button disabled={isLockedLiveTrade || isViewOnly || !previewUrl} onClick={() => removeScreenshotPreview(slot.value)} type="button" variant="secondary">
                              {language === 'he' ? 'הסרה' : 'Remove'}
                            </Button>
                          </div>
                          <p className="break-words text-xs font-semibold text-subtle">
                            {screenshot.uploadPlaceholder && screenshot.uploadPlaceholder !== 'pending'
                              ? screenshot.uploadPlaceholder
                              : language === 'he'
                                ? 'תצוגה מקומית, העלאה לענן בהמשך'
                                : 'Local preview, cloud upload later'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>

            {isCompletedTradeFlow ? (
            <CollapsibleSection isOpen={isNotesOpen} onToggle={() => setIsNotesOpen((current) => !current)} title={t('notes')}>
              <Textarea disabled={isLockedLiveTrade || isViewOnly} label={t('notes')} onChange={(event) => setNotes(event.target.value)} value={notes} />
              <Textarea disabled={isLockedLiveTrade || isViewOnly} label={t('improvements')} onChange={(event) => setImprovements(event.target.value)} value={improvements} />
              <Textarea disabled={isLockedLiveTrade || isViewOnly} label={t('preservationPoints')} onChange={(event) => setPreservationPoints(event.target.value)} value={preservationPoints} />
              <Textarea disabled={isLockedLiveTrade || isViewOnly} label={t('sharpeningNeeded')} onChange={(event) => setSharpeningNeeded(event.target.value)} value={sharpeningNeeded} />
            </CollapsibleSection>
            ) : null}
          </>
        ) : entryType === 'spot' ? (
          <>
            <FormSection required title={language === 'he' ? 'פוזיציית ספוט' : 'Spot Position'}>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink">
                <span>{language === 'he' ? 'שווי תיק ספוט נשמר בנפרד מפיוצרס ובק-טסטינג.' : 'Spot portfolio value is tracked separately from Futures and Backtesting.'}</span>
                {typeof onOpenAccountSettings === 'function' ? (
                  <Button
                    disabled={isViewOnly}
                    onClick={() => {
                      close();
                      onOpenAccountSettings('spot');
                    }}
                    type="button"
                    variant="secondary"
                  >
                    {language === 'he' ? 'עדכון שווי תיק' : 'Update portfolio value'}
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select disabled={isViewOnly} label={t('assetType')} onValueChange={setAssetType} options={assetTypeSelectOptions} value={assetType} />
                <div className={missingFieldClass(!spotAssetName.trim())} data-missing={didTrySubmit && !spotAssetName.trim() ? 'true' : undefined}>
                  <Select
                    disabled={isViewOnly}
                    label={language === 'he' ? 'שם נכס' : 'Asset Name'}
                    onValueChange={setSpotAssetName}
                    options={[{ value: '', label: '-' }, ...filteredSpotAssetOptions]}
                    required
                    value={spotAssetName}
                  />
                </div>
                <div className={missingFieldClass(!entryDate)} data-missing={didTrySubmit && !entryDate ? 'true' : undefined}>
                  <TextInput disabled={isViewOnly} label={language === 'he' ? 'תאריך קנייה' : 'Buy Date'} onChange={(event) => setEntryDate(event.target.value)} required type="date" value={entryDate} />
                </div>
                <Select disabled={isViewOnly} label={language === 'he' ? 'שעת קנייה' : 'Buy Time'} onValueChange={setEntryTime} options={[{ value: '', label: '-' }, ...timeSelectOptions]} value={entryTime} />
                <div className={missingFieldClass(spotBuyPriceValue === undefined)} data-missing={didTrySubmit && spotBuyPriceValue === undefined ? 'true' : undefined}>
                  <TextInput disabled={isViewOnly} inputMode="decimal" label={language === 'he' ? 'מחיר קנייה' : 'Buy Price'} onChange={(event) => setSpotBuyPrice(event.target.value)} required step="0.00000001" type="number" value={spotBuyPrice} />
                </div>
                <div className={missingFieldClass(spotQuantityBoughtValue === undefined)} data-missing={didTrySubmit && spotQuantityBoughtValue === undefined ? 'true' : undefined}>
                  <TextInput disabled={isViewOnly} inputMode="decimal" label={language === 'he' ? 'כמות שנקנתה' : 'Quantity Bought'} onChange={(event) => setSpotQuantityBought(event.target.value)} required step="0.00000001" type="number" value={spotQuantityBought} />
                </div>
                <TextInput disabled={isViewOnly} inputMode="decimal" label={language === 'he' ? 'שווי תיק נוכחי ($)' : 'Current portfolio value ($)'} onChange={(event) => setSpotCurrentPortfolioValue(event.target.value)} step="0.01" type="number" value={spotCurrentPortfolioValue} />
              </div>
              <div className="grid gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:grid-cols-3">
                <span>{language === 'he' ? 'סכום מושקע' : 'Invested amount'}: {formatAccountValue(spotExpectedBuyCost)}</span>
                <span>{language === 'he' ? 'כמות שנותרה' : 'Remaining quantity'}: {spotRemainingAfterSell ?? '-'}</span>
                <span>{language === 'he' ? 'רווח/הפסד ממומש' : 'Realized P/L'}: {formatSignedMoney(spotToEdit?.realizedPnl)}</span>
              </div>
            </FormSection>

            <CollapsibleSection isOpen={isSpotSellDetailsOpen} onToggle={() => setIsSpotSellDetailsOpen((current) => !current)} title={language === 'he' ? 'פרטי מכירה / סגירה' : 'Sell / Close Details'}>
              <div className="grid gap-4">
                <div className="grid gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:grid-cols-3">
                  <span>
                    {language === 'he' ? 'סטטוס' : 'Status'}:{' '}
                    <span className={getSpotStatusToneClass(getPreviewSpotStatus(spotQuantityBoughtValue, spotToEdit?.quantitySold ?? 0, spotQuantitySoldValue))}>
                      {getSpotStatusLabel(getPreviewSpotStatus(spotQuantityBoughtValue, spotToEdit?.quantitySold ?? 0, spotQuantitySoldValue), language)}
                    </span>
                  </span>
                  <span>{language === 'he' ? 'נשאר' : 'Remaining'}: {spotToEdit ? getSpotRemainingQuantity(spotToEdit) : spotQuantityBoughtValue ?? '-'}</span>
                  <span>{language === 'he' ? 'רווח/הפסד ממומש' : 'Realized P/L'}: {formatSignedMoney(spotToEdit?.realizedPnl)}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className={missingFieldClass(hasSpotSellDraft && !spotSellDate)} data-missing={didTrySubmit && hasSpotSellDraft && !spotSellDate ? 'true' : undefined}>
                    <TextInput disabled={isViewOnly || isSpotClosedForEditing} label={language === 'he' ? 'תאריך מכירה' : 'Sell Date'} onChange={(event) => setSpotSellDate(event.target.value)} required={hasSpotSellDraft} type="date" value={spotSellDate} />
                  </div>
                  <Select disabled={isViewOnly || isSpotClosedForEditing} label={language === 'he' ? 'שעת מכירה' : 'Sell Time'} onValueChange={setSpotSellTime} options={[{ value: '', label: '-' }, ...timeSelectOptions]} value={spotSellTime} />
                  <div className={missingFieldClass(hasSpotSellDraft && spotSellPriceValue === undefined)} data-missing={didTrySubmit && hasSpotSellDraft && spotSellPriceValue === undefined ? 'true' : undefined}>
                    <TextInput disabled={isViewOnly || isSpotClosedForEditing} inputMode="decimal" label={language === 'he' ? 'מחיר מכירה' : 'Sell Price'} onChange={(event) => setSpotSellPrice(event.target.value)} required={hasSpotSellDraft} step="0.00000001" type="number" value={spotSellPrice} />
                  </div>
                  <div className={missingFieldClass(hasSpotSellDraft && !isSpotQuantitySoldValid)} data-missing={didTrySubmit && hasSpotSellDraft && !isSpotQuantitySoldValid ? 'true' : undefined}>
                    <TextInput disabled={isViewOnly || isSpotClosedForEditing} inputMode="decimal" label={language === 'he' ? 'כמות שנמכרה' : 'Quantity Sold'} max={spotSellMaxQuantity} onChange={(event) => setSpotQuantitySold(event.target.value)} required={hasSpotSellDraft} step="0.00000001" type="number" value={spotQuantitySold} />
                  </div>
                  <TextInput disabled={isViewOnly || isSpotClosedForEditing} inputMode="decimal" label={language === 'he' ? 'סכום שהתקבל בפועל - אופציונלי' : 'Actual Amount Received - optional'} onChange={(event) => setSpotActualReceived(event.target.value)} step="0.01" type="number" value={spotActualReceived} />
                  <TextInput disabled={isViewOnly || isSpotClosedForEditing} label={language === 'he' ? 'סיבת יציאה' : 'Exit reason'} onChange={(event) => setSpotReasonExit(event.target.value)} value={spotReasonExit} />
                </div>
                <div className="grid gap-2 text-sm font-semibold text-ink">
                  <span>{language === 'he' ? 'צילום מכירה' : 'Sell screenshot'}</span>
                  <button
                    className="grid min-h-36 place-items-center overflow-hidden rounded-md border border-dashed border-border bg-muted px-3 py-2 text-center text-sm font-semibold text-subtle transition hover:border-primary hover:bg-background"
                    disabled={isViewOnly || isSpotClosedForEditing}
                    onClick={() => (screenshots.exit_result.localPreviewUrl || screenshots.exit_result.cloudUrl ? setPreviewScreenshot(screenshots.exit_result) : uploadInputRefs.current.exit_result?.click())}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropScreenshotPreview('exit_result', event)}
                    onPaste={(event) => pasteScreenshotPreview('exit_result', event)}
                    type="button"
                  >
                    {screenshots.exit_result.localPreviewUrl || screenshots.exit_result.cloudUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt={language === 'he' ? 'צילום מכירה' : 'Sell screenshot'} className="max-h-32 w-full rounded object-contain" src={screenshots.exit_result.localPreviewUrl || screenshots.exit_result.cloudUrl} />
                    ) : (
                      <span>{language === 'he' ? 'לחץ להעלאה, גרור תמונה, או הדבק מהלוח' : 'Click to upload, drag an image, or paste from clipboard'}</span>
                    )}
                  </button>
                  <input
                    accept="image/*"
                    className="hidden"
                    disabled={isViewOnly || isSpotClosedForEditing}
                    onChange={(event) => uploadScreenshotPreview('exit_result', event)}
                    ref={(element) => {
                      uploadInputRefs.current.exit_result = element;
                    }}
                    type="file"
                  />
                </div>
                <div className="grid gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:grid-cols-3">
                  <span>{language === 'he' ? 'סכום מכירה' : 'Sold amount'}: {formatAccountValue(spotExpectedSellValue)}</span>
                  <span>{language === 'he' ? 'התקבל בפועל' : 'Actual received'}: {formatAccountValue(spotActualReceivedValue ?? spotExpectedSellValue)}</span>
                  <span>{language === 'he' ? 'עמלות/סליפג׳ משוערות' : 'Estimated fees/slippage'}: {spotSellFeesSlippage === undefined ? '-' : formatSignedMoney(spotSellFeesSlippage)}</span>
                  <span>{language === 'he' ? 'בסיס עלות' : 'Cost basis sold'}: {formatAccountValue(spotCostBasisSold)}</span>
                  <span>{language === 'he' ? 'רווח/הפסד ממומש' : 'Realized P/L'}: {formatSignedMoney(spotNetPnl)}</span>
                  <span>{language === 'he' ? 'כמות שנותרה' : 'Remaining quantity'}: {spotRemainingAfterSell ?? '-'}</span>
                  <span>{language === 'he' ? 'ROI' : 'ROI'}: {spotRoi === undefined ? '-' : `${spotRoi.toFixed(2)}%`}</span>
                  <span>{language === 'he' ? 'משך החזקה' : 'Holding duration'}: {formatSpotHoldingDuration(getPreviewHoldingDuration(entryDate, entryTime, spotSellDate, spotSellTime))}</span>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection isOpen={isAdvancedDetailsOpen} onToggle={() => setIsAdvancedDetailsOpen((current) => !current)} title={language === 'he' ? 'פרטים אופציונליים' : 'Optional Details'}>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextInput disabled={isViewOnly} inputMode="decimal" label={language === 'he' ? 'מחיר יעד' : 'Target Price'} onChange={(event) => setSpotTargetPrice(event.target.value)} type="number" value={spotTargetPrice} />
                <TextInput disabled={isViewOnly} inputMode="decimal" label={language === 'he' ? 'סטופ לוס' : 'Stop Loss'} onChange={(event) => setSpotStopLoss(event.target.value)} type="number" value={spotStopLoss} />
                <TextInput disabled={isViewOnly} inputMode="decimal" label={language === 'he' ? 'טייק פרופיט' : 'Take Profit'} onChange={(event) => setSpotTakeProfit(event.target.value)} type="number" value={spotTakeProfit} />
              </div>
              <Textarea disabled={isViewOnly} label={language === 'he' ? 'סיבת כניסה' : 'Reason for Entry'} onChange={(event) => setSpotReasonEntry(event.target.value)} value={spotReasonEntry} />
              <Textarea disabled={isViewOnly} label={t('notes')} onChange={(event) => setNotes(event.target.value)} value={notes} />
            </CollapsibleSection>
          </>
        ) : (
          <>
            <FormSection title={t('title')}>
              <div className={missingFieldClass(!title.trim())} data-missing={didTrySubmit && !title.trim() ? 'true' : undefined}>
                <TextInput disabled={isViewOnly} label={t('taskTitle')} onChange={(event) => setTitle(event.target.value)} placeholder={t('journalReview')} required value={title} />
              </div>
              <Select disabled={isViewOnly} label={t('category')} onValueChange={setCategoryId} options={categoryOptions} value={categoryId} />
            </FormSection>
            <FormSection title={t('task')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select disabled={isViewOnly} label={t('startTime')} onValueChange={setEntryTime} options={timeSelectOptions} value={entryTime} />
                <Select disabled={isViewOnly} label={t('endTime')} onValueChange={setTaskEndTime} options={timeSelectOptions} value={taskEndTime} />
              </div>
              <Select disabled={isViewOnly} label={t('taskType')} onValueChange={setTaskType} options={mapOptions(taskTypeOptions)} value={taskType} />
              <Textarea disabled={isViewOnly} label={t('notes')} onChange={(event) => setNotes(event.target.value)} placeholder={t('optionalNotes')} value={notes} />
            </FormSection>
          </>
        )}

        {didTrySubmit && !hasMinimumRequiredFields ? <p className="text-sm font-semibold text-danger">{t('requiredFieldsMissing')}</p> : null}

        <div className="sticky bottom-0 -mx-4 flex justify-end gap-3 border-t border-border bg-background px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:p-0">
          <Button onClick={close} type="button" variant="secondary">{t('cancel')}</Button>
          {entryType === 'trade' ? (
            !isCompletedTradeFlow ? (
              <Button disabled={isLockedLiveTrade || isViewOnly} onClick={() => handleTradeSubmit('open')} type="button" variant="secondary">{t('openedTrade')}</Button>
            ) : isLiveTradeMode ? (
              <>
                <Button disabled={isLockedLiveTrade || isViewOnly} onClick={() => handleTradeSubmit('closed')} type="button">{t('closedTrade')}</Button>
              </>
            ) : (
              <Button disabled={isViewOnly} type="submit">{t('save')}</Button>
            )
          ) : (
            <Button disabled={isViewOnly} type="submit">{t('save')}</Button>
          )}
        </div>
      </form>
      <ScreenshotPreviewModal
        context={title || symbol}
        isOpen={Boolean(previewScreenshot)}
        onClose={() => setPreviewScreenshot(null)}
        screenshot={previewScreenshot}
        title={previewScreenshot ? t(previewScreenshot.slotType === 'actual_entry_timeframe' ? 'actualEntryTimeframe' : previewScreenshot.slotType === 'exit_result' ? 'exitResultScreenshot' : previewScreenshot.slotType === 'higher_timeframe_context' ? 'higherTimeframeContext' : 'customTimeframe') : t('screenshots')}
      />
    </Modal>
  );
}

function ScreenshotPreviewModal({
  context,
  isOpen,
  onClose,
  screenshot,
  title,
}: {
  context: string;
  isOpen: boolean;
  onClose: () => void;
  screenshot: ScreenshotDraftItem | null;
  title: string;
}) {
  const { language, t } = useLanguage();
  const previewUrl = screenshot?.localPreviewUrl || screenshot?.cloudUrl;

  return (
    <Modal closeLabel={t('close')} isOpen={isOpen} onClose={onClose} title={title}>
      <div className="grid gap-4">
        <div className="grid gap-2 rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:grid-cols-3">
          <span>{language === 'he' ? 'הקשר' : 'Context'}: {context || '-'}</span>
          <span>{t('timeframe')}: {screenshot?.timeframe ?? '-'}</span>
          <span>{language === 'he' ? 'סטטוס AI' : 'AI status'}: {screenshot?.aiAnalysisStatus ?? 'not_started'}</span>
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

function QuickChips<T extends string>({
  label,
  options,
  required,
  value,
  onSelect,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  required?: boolean;
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-bold uppercase text-subtle">
        {label}
        {required ? <span className="ms-1 text-danger" aria-hidden="true">*</span> : null}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            className={`min-h-10 rounded-md border px-3 py-2 text-sm font-bold transition ${
              value === option.value
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-background text-ink hover:bg-muted'
            }`}
            key={option.value}
            onClick={() => onSelect(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 rounded-md border border-border bg-white p-4">
      <button className="flex items-center justify-between gap-3 text-start" onClick={onToggle} type="button">
        <h3 className="text-sm font-bold uppercase text-subtle">{title}</h3>
        <span className="rounded bg-muted px-2 py-1 text-xs font-bold text-subtle">{isOpen ? '-' : '+'}</span>
      </button>
      {isOpen ? <div className="grid gap-4">{children}</div> : null}
    </section>
  );
}

function hasScreenshotContent(screenshot: ScreenshotDraftItem) {
  return Boolean(
    screenshot.timeframe &&
      (screenshot.localPreviewUrl || screenshot.cloudUrl || (screenshot.uploadPlaceholder && screenshot.uploadPlaceholder !== 'pending')),
  );
}

function getPreviewSpotStatus(quantityBought?: number, existingQuantitySold = 0, draftQuantitySold?: number): SpotStatus {
  const totalQuantitySold = existingQuantitySold + (draftQuantitySold && draftQuantitySold > 0 ? draftQuantitySold : 0);

  if (!totalQuantitySold) return 'open';
  if (quantityBought !== undefined && totalQuantitySold >= quantityBought) return 'closed';
  return 'partially_sold';
}

function getSpotStatusLabel(status: SpotStatus, language: string) {
  if (language !== 'he') {
    if (status === 'partially_sold') return 'Partially Sold';
    if (status === 'closed') return 'Closed';
    return 'Open';
  }

  if (status === 'partially_sold') return 'נמכר חלקית';
  if (status === 'closed') return 'סגור';
  return 'פתוח';
}

function getSpotStatusToneClass(status: SpotStatus) {
  if (status === 'closed') return 'font-bold text-success';
  if (status === 'partially_sold') return 'font-bold text-yellow-700';
  return 'font-bold text-orange-600';
}

function getClosedTradeEditableUntil(trade?: Trade) {
  if (!trade || trade.status !== 'closed' || trade.mode !== 'live') return undefined;
  if (trade.editableUntil) return trade.editableUntil;
  if (trade.closedAt) return new Date(new Date(trade.closedAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
  return new Date(new Date(trade.updatedAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
}

function calculateTradeDuration(entryDate: string, entryTime: string, exitDate: string, exitTime: string) {
  if (!entryDate || !entryTime || !exitDate || !exitTime) {
    return '-';
  }

  const start = new Date(`${entryDate}T${entryTime}:00`);
  const end = new Date(`${exitDate}T${exitTime}:00`);
  const diffMs = end.getTime() - start.getTime();

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return '-';
  }

  const totalMinutes = Math.round(diffMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function getPreviewHoldingDuration(buyDate: string, buyTime: string, sellDate: string, sellTime: string) {
  if (!buyDate || !sellDate) return undefined;
  const start = new Date(`${buyDate}T${buyTime || '00:00'}:00`);
  const end = new Date(`${sellDate}T${sellTime || '23:59'}:00`);
  const diffMs = end.getTime() - start.getTime();
  return Number.isFinite(diffMs) && diffMs >= 0 ? diffMs : undefined;
}

function buildAssetNameOptions(
  symbolOptions: string[],
  assetTypeBySymbol: Record<string, AssetType>,
  assetType: AssetType,
  currentValue?: string,
  currentValueAssetType?: AssetType,
) {
  const normalizedCurrent = normalizeSymbolInput(currentValue ?? '');
  const options = symbolOptions
    .map(normalizeSymbolInput)
    .filter(Boolean)
    .filter((symbol, index, symbols) => symbols.indexOf(symbol) === index)
    .filter((symbol) => assetTypeBySymbol[symbol] === assetType);

  if (
    normalizedCurrent &&
    currentValueAssetType === assetType &&
    !options.includes(normalizedCurrent)
  ) {
    options.push(normalizedCurrent);
  }

  return options.map((symbol) => ({ value: symbol, label: symbol }));
}

function getFirstSymbolForAssetType(
  symbolOptions: string[],
  assetTypeBySymbol: Record<string, AssetType>,
  assetType: AssetType,
) {
  return symbolOptions.map(normalizeSymbolInput).find((symbol) => assetTypeBySymbol[symbol] === assetType) ?? '';
}

function isAssetNameAllowedForType(
  assetName: string,
  assetType: AssetType,
  assetTypeBySymbol: Record<string, AssetType>,
  currentValueAssetType?: AssetType,
) {
  const normalized = normalizeSymbolInput(assetName);
  if (!normalized) return false;
  return assetTypeBySymbol[normalized] === assetType || currentValueAssetType === assetType;
}

function normalizeSymbolInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
