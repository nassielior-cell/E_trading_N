'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useLanguage } from '@/lib/i18n/language-provider';
import { officialPublicUrl } from '@/lib/public-url';

import { useJournalStore } from '../store/journal-store';

type SharingPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

type EmptyTemplateSnapshot = ReturnType<ReturnType<(typeof useJournalStore)['getState']>['createEmptyTemplateSnapshot']>;

export function SharingPanel({ isOpen, onClose }: SharingPanelProps) {
  const { language, t } = useLanguage();
  const workspaceId = useJournalStore((state) => state.workspaceId);
  const accessMode = useJournalStore((state) => state.accessMode);
  const setAccessMode = useJournalStore((state) => state.setAccessMode);
  const createEmptyTemplateSnapshot = useJournalStore((state) => state.createEmptyTemplateSnapshot);
  const [copyMessage, setCopyMessage] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [templateMessage, setTemplateMessage] = useState('');
  const isHebrew = language === 'he';
  const shareLink = useMemo(() => {
    const url = new URL('/', officialPublicUrl);
    url.pathname = '/';
    url.searchParams.set('mode', 'viewer');
    url.searchParams.set('workspace', workspaceId);
    return url.toString();
  }, [workspaceId]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyMessage(isHebrew ? 'הקישור הועתק' : 'Link copied');
    } catch {
      setCopyMessage(isHebrew ? 'לא ניתן להעתיק כרגע' : 'Could not copy link');
    }
  };

  const generateTemplateCode = () => {
    const template = buildEmptyTemplateExport(createEmptyTemplateSnapshot());
    console.info('[journal-template-clone]', 'empty template snapshot prepared', {
      symbols: template.symbolOptions.length,
      timeframes: template.screenshotTimeframes.length,
      includesTrades: false,
    });
    setTemplateCode(`TRD-${randomCodePart()}-${randomCodePart()}`);
    setTemplateMessage(isHebrew ? 'תבנית נקייה נוצרה. אין בה טריידים, משימות, הערות או צילומי מסך.' : 'Clean template created. It contains no trades, tasks, notes, or screenshots.');
  };

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildEmptyTemplateExport(createEmptyTemplateSnapshot()), null, 2));
      setTemplateMessage(isHebrew ? 'תבנית היומן הריקה הועתקה.' : 'Empty journal template copied.');
    } catch {
      setTemplateMessage(isHebrew ? 'לא ניתן להעתיק כרגע.' : 'Could not copy right now.');
    }
  };

  const downloadTemplate = () => {
    const payload = JSON.stringify(buildEmptyTemplateExport(createEmptyTemplateSnapshot()), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'empty-trading-journal-template.json';
    link.click();
    URL.revokeObjectURL(url);
    setTemplateMessage(isHebrew ? 'קובץ תבנית ריק נוצר להורדה.' : 'Empty template file is ready.');
  };

  return (
    <Modal closeLabel={t('close')} isOpen={isOpen} onClose={onClose} title={isHebrew ? 'שיתוף' : 'Sharing'}>
      <div className="grid gap-4">
        <section className="grid gap-3 rounded-md border border-border bg-muted p-3 text-sm">
          <Info label={isHebrew ? 'קישור שיתוף בפועל' : 'Actual share link'} value={shareLink || '-'} />
          <Info label={isHebrew ? 'מצב' : 'Mode'} value={accessMode === 'viewer' ? (isHebrew ? 'צפייה בלבד' : 'View only') : (isHebrew ? 'בעלים' : 'Owner')} />
          <p className="text-sm font-semibold text-subtle">
            {isHebrew
              ? 'העתק את הקישור ושלח אותו. המקבל פותח את הקישור בדפדפן ויכול לצפות בלבד. עריכה דרך קישור כבויה עד שיהיה אימות והרשאות.'
              : 'Test instructions: copy the link, open it in a private window or another browser, and confirm view-only mode is visible. The receiver sees this journal by workspace id. Edit access by link stays disabled until authentication and permissions exist.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={copyLink} type="button" variant="secondary">{isHebrew ? 'העתקת קישור' : 'Copy link'}</Button>
            <Button onClick={() => setAccessMode('viewer')} type="button" variant={accessMode === 'viewer' ? 'primary' : 'secondary'}>{isHebrew ? 'ברירת מחדל: צפייה בלבד' : 'Default: view only'}</Button>
            <Button disabled type="button" variant="secondary">{isHebrew ? 'עריכה כבויה כרגע' : 'Edit mode disabled'}</Button>
          </div>
          {copyMessage ? <p className="text-sm font-bold text-ink">{copyMessage}</p> : null}
        </section>

        <section className="grid gap-3 rounded-md border border-border bg-white p-3">
          <p className="text-sm font-bold text-ink">{isHebrew ? 'קוד תבנית ליומן נקי' : 'Template code for a clean journal copy'}</p>
          <p className="text-sm text-subtle">
            {isHebrew
              ? 'הקוד מיועד ליצירת יומן ריק עם אותו מבנה: פריסטים, קטגוריות והגדרות. הוא לא מעתיק טריידים, משימות, הערות או צילומי מסך.'
              : 'This export sends a blank journal template that is fully disconnected from the original journal/workspace. It includes presets, categories, and settings only: no trades, tasks, notes, screenshots, workspace history, or sync state.'}
          </p>
          <div className="rounded-md bg-muted p-3 text-lg font-bold text-ink">{templateCode || 'TRD-XXXX-XXXX'}</div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={generateTemplateCode} type="button" variant="secondary">{isHebrew ? 'יצירת קוד תבנית' : 'Generate template code'}</Button>
            <Button onClick={copyTemplate} type="button" variant="secondary">{isHebrew ? 'העתקת תבנית ריקה' : 'Copy empty template'}</Button>
            <Button onClick={downloadTemplate} type="button">{isHebrew ? 'ייצוא תבנית ריקה' : 'Export empty template'}</Button>
          </div>
          {templateMessage ? <p className="text-sm font-bold text-ink">{templateMessage}</p> : null}
        </section>
      </div>
    </Modal>
  );
}

function randomCodePart() {
  return Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(4, 'X');
}

function buildEmptyTemplateExport(template: EmptyTemplateSnapshot) {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    journalName: 'Empty Trading Journal Template',
    workspaceId: `template_${Date.now().toString(36)}`,
    days: {},
    tasks: {},
    trades: {},
    accountValueResets: [],
    notifications: [],
    journals: [],
    exportEmail: '',
    ...template,
  };
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs font-bold uppercase text-subtle">{label}</p>
      <p className="break-words font-semibold text-ink">{value}</p>
    </div>
  );
}
