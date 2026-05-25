'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-provider';
import type { JournalNotification, SpotPosition, Trade } from '@/models/journal';

import { useJournalStore } from '../store/journal-store';
import { isSpotOpen } from '../utils/spot-status';

type NotificationCenterProps = {
  spots?: SpotPosition[];
  trades: Trade[];
  onOpenSpot?: (spot: SpotPosition) => void;
  onOpenTrade: (trade: Trade) => void;
};

export function NotificationCenter({ spots = [], trades, onOpenSpot, onOpenTrade }: NotificationCenterProps) {
  const { language } = useLanguage();
  const notifications = useJournalStore((state) => state.notifications);
  const markNotificationRead = useJournalStore((state) => state.markNotificationRead);
  const markAllNotificationsRead = useJournalStore((state) => state.markAllNotificationsRead);
  const [isOpen, setIsOpen] = useState(false);
  const [dismissedReminderIds, setDismissedReminderIds] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const isHebrew = language === 'he';
  const reminderNotifications = useMemo(
    () => [
      ...buildOpenTradeReminders(trades, isHebrew),
      ...buildOpenSpotReminders(spots, isHebrew),
    ].filter((notification) => !dismissedReminderIds.includes(notification.id)),
    [dismissedReminderIds, isHebrew, spots, trades],
  );
  const mergedNotifications = useMemo(
    () =>
      [...reminderNotifications, ...notifications]
        .map((notification) => localizeNotification(notification, isHebrew))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [isHebrew, notifications, reminderNotifications],
  );
  const unreadCount = mergedNotifications.filter((notification) => !notification.read).length;

  const openNotification = (notification: JournalNotification) => {
    if (notification.relatedTradeId) {
      const trade = trades.find((item) => item.id === notification.relatedTradeId);
      if (trade) {
        onOpenTrade(trade);
      }
    }

    if (notification.relatedSpotId) {
      const spot = spots.find((item) => item.id === notification.relatedSpotId);
      if (spot) {
        onOpenSpot?.(spot);
      }
    }

    if (notification.id.startsWith('reminder_')) {
      setDismissedReminderIds((current) => [...current, notification.id]);
    } else {
      markNotificationRead(notification.id);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isOpen]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        aria-label={isHebrew ? 'התראות' : 'Notifications'}
        className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-md bg-muted px-3 py-2 text-sm font-bold text-ink transition hover:bg-border"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span aria-hidden="true">!</span>
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section className="absolute end-0 top-12 z-40 grid max-h-[70vh] w-[min(92vw,380px)] gap-3 overflow-y-auto rounded-lg border border-border bg-surface p-3 text-start shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-ink">{isHebrew ? 'התראות' : 'Notifications'}</p>
              <p className="text-xs font-semibold text-subtle">
                {unreadCount} {isHebrew ? 'לא נקראו' : 'unread'}
              </p>
            </div>
            <Button
              disabled={!notifications.some((notification) => !notification.read)}
              onClick={markAllNotificationsRead}
              type="button"
              variant="secondary"
            >
              {isHebrew ? 'סמן הכל' : 'Mark all'}
            </Button>
          </div>

          <div className="grid gap-2">
            {mergedNotifications.length ? (
              mergedNotifications.map((notification) => (
                <button
                  className={`grid gap-1 rounded-md border p-3 text-start transition hover:bg-muted ${getSeverityClass(notification.severity)} ${
                    notification.read ? 'opacity-70' : ''
                  }`}
                  key={notification.id}
                  onClick={() => openNotification(notification)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-ink">{notification.title}</span>
                    {!notification.read ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                  </div>
                  <span className="text-sm font-semibold text-subtle">{notification.message}</span>
                  {notification.suggestedAction ? (
                    <span className="text-xs font-bold text-ink">{notification.suggestedAction}</span>
                  ) : null}
                  <span className="text-[11px] font-semibold text-subtle">
                    {new Date(notification.createdAt).toLocaleString()}
                  </span>
                </button>
              ))
            ) : (
              <p className="rounded-md bg-muted p-3 text-sm font-semibold text-subtle">
                {isHebrew ? 'אין התראות כרגע' : 'No notifications yet'}
              </p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function buildOpenTradeReminders(trades: Trade[], isHebrew: boolean): JournalNotification[] {
  return trades
    .filter((trade) => trade.mode === 'live' && trade.status === 'open')
    .map((trade) => ({ trade, openDays: getFullAgeUnits(trade.entryDate, trade.entryTime, 1) }))
    .filter(({ openDays }) => openDays > 2)
    .map(({ trade, openDays }) => {
      const missingScreenshots = ['actual_entry_timeframe'].filter((slotType) =>
        !trade.screenshots.some(
          (screenshot) =>
            screenshot.slotType === slotType &&
            Boolean(screenshot.localPreviewUrl || screenshot.cloudUrl || screenshot.uploadPlaceholder !== 'pending'),
        ),
      );

      return createReminder({
        id: `reminder_open_trade_${trade.id}_${openDays}`,
        trade,
        title: isHebrew ? 'תזכורת פיוצרס פתוח' : 'Open Futures follow-up',
        message: isHebrew
          ? 'פוזיציית פיוצרס פתוחה מעל יומיים. בדוק אם צריך לסגור.'
          : `${trade.coin}: Futures position has been open for more than 2 days. Check whether it should be closed.`,
        severity: missingScreenshots.length ? 'warning' : 'info',
        suggestedAction: isHebrew ? 'לחיצה פותחת את הפוזיציה לעדכון.' : 'Click to open the position.',
        priorityScore: 90,
      });
    });
}

function buildOpenSpotReminders(spots: SpotPosition[], isHebrew: boolean): JournalNotification[] {
  return spots
    .filter(isSpotOpen)
    .map((spot) => ({ spot, openWeeks: getFullAgeUnits(spot.buyDate, spot.buyTime, 7) }))
    .filter(({ openWeeks }) => openWeeks >= 1)
    .map(({ spot, openWeeks }) => ({
      id: `reminder_open_spot_${spot.id}_${openWeeks}`,
      type: 'open_trade_reminder' as const,
      title: isHebrew ? 'תזכורת ספוט פתוח' : 'Open Spot follow-up',
      message: isHebrew
        ? 'פוזיציית ספוט פתוחה מעל שבוע. בדוק אם עדיין רלוונטית.'
        : `${spot.assetName}: Spot position has been open for more than 1 week. Check whether it is still relevant.`,
      createdAt: spot.updatedAt || spot.createdAt,
      read: false,
      relatedSpotId: spot.id,
      severity: 'warning' as const,
      actionTarget: `spot:${spot.id}`,
      aiGenerated: false,
      suggestedAction: isHebrew ? 'לחיצה פותחת את פוזיציית הספוט לעדכון.' : 'Click to open the Spot position.',
      priorityScore: 80,
    }));
}


function localizeNotification(notification: JournalNotification, isHebrew: boolean): JournalNotification {
  if (!isHebrew) return notification;

  if (notification.type === 'trade_opened') {
    return {
      ...notification,
      title: 'פיוצרס נפתח',
      message: 'פוזיציית פיוצרס פתוחה נשמרה. אפשר לחזור אליה לסגירה ועדכון פרטים.',
      suggestedAction: 'לחיצה פותחת את הפוזיציה.',
    };
  }

  if (notification.type === 'trade_closed') {
    return {
      ...notification,
      title: 'פיוצרס נסגר',
      message: 'פרטי הסגירה נשמרו ביומן.',
      suggestedAction: 'מומלץ לבדוק משמעת וצילומי מסך.',
    };
  }

  if (notification.type === 'spot_opened') {
    return {
      ...notification,
      title: 'ספוט נפתח',
      message: 'פוזיציית ספוט פתוחה נשמרה.',
      suggestedAction: 'לחיצה פותחת את פוזיציית הספוט.',
    };
  }

  if (notification.type === 'spot_partially_sold') {
    return {
      ...notification,
      title: 'ספוט נמכר חלקית',
      message: 'מכירת ספוט חלקית נשמרה ביומן.',
      suggestedAction: 'בדוק כמות שנותרה ויעדי המשך.',
    };
  }

  if (notification.type === 'spot_closed') {
    return {
      ...notification,
      title: 'ספוט נסגר',
      message: 'פוזיציית הספוט נסגרה ונשמרה ביומן.',
      suggestedAction: 'בדוק רווח/הפסד וסיבת יציאה.',
    };
  }

  if (notification.type === 'export_created') {
    return {
      ...notification,
      title: 'ייצוא נוצר',
      message: 'דוח היומן נפתח/נוצר לפי הפילטרים.',
      suggestedAction: 'אפשר להדפיס או לשמור כ-PDF.',
    };
  }

  if (notification.type === 'sync_error') {
    return {
      ...notification,
      title: 'שגיאת סנכרון ענן',
      message: 'היומן ממשיך לעבוד מגיבוי מקומי. בדוק הגדרות Firebase וחיבור.',
      suggestedAction: 'בדוק הגדרות Firebase.',
    };
  }

  if (notification.type === 'discipline_warning') {
    return {
      ...notification,
      title: 'אזהרת משמעת',
      message: 'זוהה ציון משמעת נמוך בטרייד.',
      suggestedAction: 'בדוק עמידה בכללים, רגשות והפרות.',
    };
  }

  if (notification.type === 'rule_violation') {
    return {
      ...notification,
      title: 'נוספה הפרת כלל',
      message: 'נוספה הפרת כלל לטרייד.',
      suggestedAction: 'בדוק את סעיף הכללים של הטרייד.',
    };
  }

  if (notification.type === 'open_trade_reminder' && notification.relatedSpotId) {
    return {
      ...notification,
      title: 'תזכורת ספוט פתוח',
      suggestedAction: 'לחיצה פותחת את פוזיציית הספוט לעדכון.',
    };
  }

  if (notification.type === 'open_trade_reminder') {
    return {
      ...notification,
      title: 'תזכורת פיוצרס פתוח',
      suggestedAction: 'לחיצה פותחת את הפוזיציה לעדכון.',
    };
  }

  return notification;
}

function createReminder({
  id,
  message,
  priorityScore,
  severity,
  suggestedAction,
  title,
  trade,
}: {
  id: string;
  message: string;
  priorityScore: number;
  severity: JournalNotification['severity'];
  suggestedAction: string;
  title: string;
  trade: Trade;
}): JournalNotification {
  return {
    id,
    type: 'open_trade_reminder',
    title,
    message,
    createdAt: trade.updatedAt,
    read: false,
    relatedTradeId: trade.id,
    severity,
    actionTarget: `trade:${trade.id}`,
    aiGenerated: false,
    suggestedAction,
    priorityScore,
  };
}

function getFullAgeUnits(date: string, time: string | undefined, daysPerUnit: number) {
  const startedAt = new Date(`${date}T${time || '00:00'}:00`).getTime();
  if (!Number.isFinite(startedAt)) return 0;
  return Math.floor((Date.now() - startedAt) / (daysPerUnit * 86_400_000));
}

function getSeverityClass(severity: JournalNotification['severity']) {
  if (severity === 'critical') return 'border-dangerSoft bg-dangerSoft/40';
  if (severity === 'warning') return 'border-yellow-200 bg-yellow-50';
  return 'border-border bg-background';
}
