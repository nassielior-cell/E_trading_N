'use client';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useLanguage } from '@/lib/i18n/language-provider';

type HelpPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function HelpPanel({ isOpen, onClose }: HelpPanelProps) {
  const { language, t } = useLanguage();
  const isHebrew = language === 'he';
  const sections = isHebrew
    ? [
        ['הוספת טרייד', 'לחץ הוספת רשומה, בחר טרייד, מלא מטבע/נכס, סוג נכס, כיוון, אסטרטגיה, סיכון, סטופ, זמן כניסה וצילומי מסך נדרשים.'],
        ['פיוצרס / בק-טסטינג', 'פיוצרס הוא ביצוע אמיתי. בק-טסטינג הוא אימון על עבר ולכן אין בו רגשות ביצוע.'],
        ['פתיחה בלבד מול פתיחה + סגירה', 'פתיחה בלבד שומרת טרייד פתוח. פתיחה + סגירה שומרת גם תוצאה, יציאה, רווח/הפסד וצילום יציאה.'],
        ['ציון משמעת', 'הציון מתחיל מ-100 ונחתך לפי עמידה בכללים, טעויות שנבחרו ורגשות שליליים, בהתאם להגדרות.'],
        ['ייצוא', 'הייצוא הראשי פותח דוח יומן קריא להדפסה או שמירה כ-PDF, לפי טווח תאריכים ופילטרים. JSON נמצא בגיבוי מתקדם בלבד.'],
        ['שיתוף', 'הקישור מיועד כברירת מחדל לצפייה בלבד. העתק אותו ושלח למי שצריך לפתוח בדפדפן. עריכה דרך קישור כבויה עד שיהיה אימות משתמשים.'],
        ['שכפול יומן', 'קוד תבנית מיועד ליצירת יומן נקי עם אותו מבנה: פריסטים, קטגוריות והגדרות. הוא לא מעתיק טריידים.'],
        ['הגדרות', 'בהגדרות מנהלים פריסטים, ציון משמעת, שווי חשבון, יומנים נפרדים, גיבוי מתקדם ושדה אימייל עתידי.'],
        ['סטטיסטיקות', 'עמוד הסטטיסטיקות מציג ביצועים לפי שעות כניסה/יציאה, שילובי זמנים, סטופ, כיוון ואסטרטגיה.'],
        ['שינוי שווי חשבון', 'הזן שווי חשבון בדולרים מתאריך מסוים. השינוי חל מאותו תאריך קדימה בלבד ולא משנה נתוני עבר.'],
      ]
    : [
        ['Add a trade', 'Click Add Entry, choose Trade, then fill coin/asset, asset type, direction, strategy, risk, stop, entry time, and required screenshots.'],
        ['Futures / Backtesting', 'Futures is real execution. Backtesting is training on past market data, so execution emotions are hidden.'],
        ['Open only vs Open + Close', 'Open only saves an active trade. Open + Close also records result, exit, P/L, and the exit screenshot.'],
        ['Discipline score', 'The score starts at 100 and deductions apply for adherence issues, selected mistakes, and negative emotions based on your settings.'],
        ['Export', 'Main export opens a readable journal report for printing or saving as PDF, using the date range and filters. JSON lives under Advanced backup only.'],
        ['Sharing', 'The share link defaults to view-only. Copy it and send it to someone to open in a browser. Edit access is disabled until authentication exists.'],
        ['Clone journal', 'Template code is for a clean journal copy with the same structure: presets, categories, and settings. It does not copy trades.'],
        ['Settings', 'Settings manage presets, discipline score, account value changes, separate journals, advanced backup, and the future email field.'],
        ['Statistics', 'Statistics rank performance by entry/exit times, time combinations, stop size, direction, and strategy.'],
        ['Account value changes', 'Enter account value in dollars from a selected date. The change applies from that date forward and does not rewrite past data.'],
      ];

  return (
    <Modal closeLabel={t('close')} isOpen={isOpen} onClose={onClose} title={isHebrew ? 'עזרה' : 'Help'}>
      <div className="grid gap-3">
        {sections.map(([title, body]) => (
          <section className="rounded-md border border-border bg-muted p-3" key={title}>
            <h3 className="text-sm font-bold text-ink">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-subtle">{body}</p>
          </section>
        ))}
        <div className="flex justify-end">
          <Button onClick={onClose} type="button" variant="secondary">
            {t('close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
