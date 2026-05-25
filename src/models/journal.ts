import type { TranslationKey } from '@/lib/i18n/translations';

export type EntryType = 'task' | 'trade' | 'spot';
export type TradeResult = 'win' | 'loss' | 'breakeven';
export type DayResult = 'profitable' | 'losing' | 'neutral';
export type TradeMode = 'live' | 'backtesting' | 'simulation';
export type JournalType = 'liveOnly' | 'backtestingOnly' | 'spotOnly' | 'combined';
export type AssetType = 'crypto' | 'stock' | 'forex';
export type TradeDirection = 'long' | 'short';
export type TradeStatus = 'open' | 'closed';
export type SpotStatus = 'open' | 'partially_sold' | 'closed';
export type RuleAdherence = 'followed' | 'partial' | 'broken' | 'not_applicable';
export type CategoryType = 'trade' | 'task' | 'review' | 'learning';
export type ScreenshotSlotType =
  | 'actual_entry_timeframe'
  | 'higher_timeframe_context'
  | 'exit_result'
  | 'custom_timeframe';
export type ScreenshotTimeframe = string;
export type JournalEventType =
  | 'trade_created'
  | 'trade_opened'
  | 'trade_closed'
  | 'trade_edited'
  | 'task_created'
  | 'settings_changed'
  | 'preset_added'
  | 'language_changed'
  | 'export_created';

export type NotificationType =
  | 'trade_opened'
  | 'trade_closed'
  | 'spot_opened'
  | 'spot_partially_sold'
  | 'spot_closed'
  | 'discipline_warning'
  | 'rule_violation'
  | 'export_created'
  | 'sync_error'
  | 'open_trade_reminder';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface JournalEvent {
  id: string;
  timestamp: string;
  workspaceId: string;
  type: JournalEventType;
  tradeId?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface JournalNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  relatedTradeId?: string;
  relatedSpotId?: string;
  severity: NotificationSeverity;
  actionTarget?: string;
  aiGenerated?: boolean;
  aiReason?: string;
  suggestedAction?: string;
  priorityScore?: number;
}

export interface DisciplineScoreHistoryItem {
  timestamp: string;
  score: number;
  reason: 'created' | 'edited' | 'recalculated';
}

export interface Category {
  id: string;
  labelKey: TranslationKey;
  type: CategoryType;
  color: string;
  icon?: string;
  isCustom?: boolean;
}

export interface User {
  id: string;
  displayName: string;
  email?: string;
  activeWorkspaceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  workspaceId: string;
  dayId: string;
  title: string;
  startTime?: string;
  endTime?: string;
  taskType?: string;
  categoryId?: string;
  notes?: string;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  workspaceId: string;
  dayId: string;
  title?: string;
  status: TradeStatus;
  result: TradeResult;
  mode: TradeMode;
  entryDate: string;
  entryTime: string;
  exitDate?: string;
  exitTime?: string;
  stopPercentage?: number;
  riskDollars: number;
  coin: string;
  assetName: string;
  assetType?: AssetType;
  strategyId?: string;
  direction: TradeDirection;
  adherence: RuleAdherence;
  ruleViolations: string[];
  categoryId?: string;
  emotion_before: string;
  emotion_after?: string;
  rr?: number;
  pnl: number;
  numericPnl: number;
  pnlInput: number;
  closeDate?: string;
  notes?: string;
  improvements?: string;
  preservationPoints?: string;
  sharpeningNeeded?: string;
  screenshots: ScreenshotSlot[];
  disciplineScore: number;
  openedAt?: string;
  closedAt?: string;
  lastEditedAt?: string;
  editCount?: number;
  totalOpenDuration?: number;
  disciplineScoreHistory?: DisciplineScoreHistoryItem[];
  emotionalFlags?: string[];
  editableUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpotSell {
  id: string;
  sellDate: string;
  sellTime?: string;
  sellPrice: number;
  quantitySold: number;
  actualAmountReceived: number;
  reasonForExit?: string;
  notes?: string;
  screenshots: ScreenshotSlot[];
  expectedSellValue: number;
  sellFeesSlippage: number;
  costBasisSold: number;
  netPnl: number;
  holdingDurationMs?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SpotPosition {
  id: string;
  workspaceId: string;
  dayId: string;
  status: SpotStatus;
  assetName: string;
  assetType: AssetType;
  buyDate: string;
  buyTime?: string;
  buyPrice: number;
  quantityBought: number;
  actualAmountPaid: number;
  currentPortfolioValue?: number;
  targetPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  reasonForEntry?: string;
  notes?: string;
  screenshots: ScreenshotSlot[];
  sells: SpotSell[];
  expectedBuyCost: number;
  buyFeesSlippage: number;
  realizedPnl: number;
  quantitySold: number;
  remainingQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScreenshotSlot {
  id: string;
  tradeId?: string;
  slotType: ScreenshotSlotType;
  timeframe: ScreenshotTimeframe;
  description?: string;
  localPreviewUrl?: string;
  cloudUrl?: string;
  uploadedAt?: string;
  order: number;
  uploadPlaceholder?: string;
  aiAnalysisStatus?: 'not_started' | 'pending' | 'complete' | 'failed';
  aiNotes?: string;
  detectedTimeframe?: string;
  detectedPattern?: string;
  userCorrection?: string;
}

export interface DayMetadata {
  tradeCount: number;
  taskCount: number;
  spotCount: number;
  openSpotCount: number;
  closedSpotCount: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  liveTradeCount: number;
  backtestingTradeCount: number;
  reviewTradeCount: number;
  result: DayResult;
  pnl?: number;
  adherenceScore?: number;
  categoryIds: string[];
}

export interface Day {
  id: string;
  workspaceId: string;
  date: string;
  taskIds: string[];
  tradeIds: string[];
  spotIds: string[];
  result: DayResult;
  metadata: DayMetadata;
  createdAt: string;
  updatedAt: string;
}
