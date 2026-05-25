import type {
  AssetType,
  Category,
  RuleAdherence,
  ScreenshotSlotType,
  ScreenshotTimeframe,
  TradeDirection,
  TradeMode,
  TradeResult,
} from '@/models/journal';
import type { TranslationKey } from '@/lib/i18n/translations';

export type OptionDefinition<T extends string = string> = {
  value: T;
  labelKey: TranslationKey;
  color?: string;
  isCustom?: boolean;
};

export const defaultSymbolOptions = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
export const defaultAssetTypeBySymbol: Record<string, AssetType> = {
  BTCUSDT: 'crypto',
  ETHUSDT: 'crypto',
  SOLUSDT: 'crypto',
};

export const tradeResultOptions: OptionDefinition<TradeResult>[] = [
  { value: 'win', labelKey: 'win', color: '#16A34A' },
  { value: 'loss', labelKey: 'loss', color: '#DC2626' },
  { value: 'breakeven', labelKey: 'breakeven', color: '#667085' },
];

export const tradeModeOptions: OptionDefinition<TradeMode>[] = [
  { value: 'live', labelKey: 'liveTrade' },
  { value: 'backtesting', labelKey: 'backtesting' },
];

export const tradeDirectionOptions: OptionDefinition<TradeDirection>[] = [
  { value: 'long', labelKey: 'long' },
  { value: 'short', labelKey: 'short' },
];

export const adherenceOptions: OptionDefinition<RuleAdherence>[] = [
  { value: 'followed', labelKey: 'followed', color: '#16A34A' },
  { value: 'partial', labelKey: 'partial', color: '#D97706' },
  { value: 'broken', labelKey: 'broken', color: '#DC2626' },
  { value: 'not_applicable', labelKey: 'notApplicable', color: '#667085' },
];

export const emotionOptions: OptionDefinition[] = [
  { value: 'calm', labelKey: 'calm' },
  { value: 'focused', labelKey: 'focused' },
  { value: 'stressed', labelKey: 'stressed' },
  { value: 'anxious', labelKey: 'anxious' },
  { value: 'frustrated', labelKey: 'frustrated' },
  { value: 'greedy', labelKey: 'greedy' },
  { value: 'fearful', labelKey: 'fearful' },
  { value: 'confident', labelKey: 'confident' },
  { value: 'tired', labelKey: 'tired' },
];

export const strategyOptions: OptionDefinition[] = [
  { value: 'breakout', labelKey: 'breakout' },
  { value: 'pullback', labelKey: 'pullback' },
  { value: 'reversal', labelKey: 'reversal' },
  { value: 'trend_continuation', labelKey: 'trendContinuation' },
  { value: 'range_trade', labelKey: 'rangeTrade' },
  { value: 'news_trade', labelKey: 'newsTrade' },
];

export const ruleViolationOptions: OptionDefinition[] = [
  { value: 'plan_ignored', labelKey: 'planIgnored' },
  { value: 'chased_entry', labelKey: 'chasedEntry' },
  { value: 'moved_stop', labelKey: 'movedStop' },
  { value: 'oversized_position', labelKey: 'oversizedPosition' },
  { value: 'early_exit', labelKey: 'earlyExit' },
  { value: 'late_exit', labelKey: 'lateExit' },
];

export const taskTypeOptions: OptionDefinition[] = [
  { value: 'journal_review', labelKey: 'journalReview' },
  { value: 'market_prep', labelKey: 'marketPrep' },
  { value: 'study', labelKey: 'study' },
  { value: 'admin', labelKey: 'admin' },
  { value: 'personal', labelKey: 'personal' },
];

export const categories: Category[] = [
  { id: 'trading', labelKey: 'trading', type: 'trade', color: '#2563EB' },
  { id: 'backtesting', labelKey: 'backtestingCategory', type: 'trade', color: '#7C3AED' },
  { id: 'learning', labelKey: 'learning', type: 'learning', color: '#0891B2' },
  { id: 'personal_tasks', labelKey: 'personalTasks', type: 'task', color: '#64748B' },
  { id: 'psychology_review', labelKey: 'psychologyReviewCategory', type: 'review', color: '#D97706' },
];

export const getCategory = (categoryId?: string) =>
  categories.find((category) => category.id === categoryId);

export const timeOptions: OptionDefinition[] = Array.from({ length: 96 }, (_, index) => {
  const hours = String(Math.floor(index / 4)).padStart(2, '0');
  const minutes = String((index % 4) * 15).padStart(2, '0');
  const value = `${hours}:${minutes}`;

  return { value, labelKey: 'timeOption', isCustom: false };
});

export const screenshotTimeframeOptions: OptionDefinition<ScreenshotTimeframe>[] = [
  { value: '1m', labelKey: 'tf1m' },
  { value: '5m', labelKey: 'tf5m' },
  { value: '15m', labelKey: 'tf15m' },
  { value: '1h', labelKey: 'tf1h' },
  { value: '4h', labelKey: 'tf4h' },
  { value: '1D', labelKey: 'tf1D' },
];

export const defaultScreenshotTimeframes = screenshotTimeframeOptions.map((option) => option.value);

export const screenshotSlotOptions: OptionDefinition<ScreenshotSlotType>[] = [
  { value: 'actual_entry_timeframe', labelKey: 'actualEntryTimeframe' },
  { value: 'higher_timeframe_context', labelKey: 'higherTimeframeContext' },
  { value: 'exit_result', labelKey: 'exitResultScreenshot' },
  { value: 'custom_timeframe', labelKey: 'customTimeframe' },
];
