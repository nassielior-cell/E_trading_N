'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useLanguage } from '@/lib/i18n/language-provider';
import { officialPublicUrl } from '@/lib/public-url';

import type { SharePermission } from '../data/firebase-journal-repository';
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
  const currentShareCode = useJournalStore((state) => state.shareCode);
  const sharedOwnerId = useJournalStore((state) => state.sharedOwnerId);
  const createShareLink = useJournalStore((state) => state.createShareLink);
  const createEmptyTemplateSnapshot = useJournalStore((state) => state.createEmptyTemplateSnapshot);
  const [copyMessage, setCopyMessage] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [sharePermission, setSharePermission] = useState<SharePermission>('view');
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [templateCode, setTemplateCode] = useState('');
  const [templateMessage, setTemplateMessage] = useState('');
  const isHebrew = language === 'he';

  const buildShareUrl = (shareCode: string) => {
    const url = new URL('/', officialPublicUrl);
    url.pathname = '/';
    url.searchParams.set('shareCode', shareCode);
    return url.toString();
  };

  const createLink = async () => {
    if (accessMode !== 'owner') {
      setCopyMessage(isHebrew ? 'רק בעל היומן יכול ליצור קישור שיתוף.' : 'Only the journal owner can create a share link.');
      return '';
    }

    setIsCreatingShare(true);
    try {
      const share = await createShareLink(sharePermission);
      const nextLink = buildShareUrl(share.shareCode);
      setShareLink(nextLink);
      setCopyMessage(isHebrew ? 'קישור שיתוף נוצר.' : 'Share link created.');
      return nextLink;
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : isHebrew ? 'לא ניתן ליצור קישור כרגע.' : 'Could not create a share link right now.');
      return '';
    } finally {
      setIsCreatingShare(false);
    }
  };

  const copyLink = async () => {
    const linkToCopy = await createLink();
    if (!linkToCopy) return;

    try {
      await navigator.clipboard.writeText(linkToCopy);
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

  const displayedShareLink = shareLink || (currentShareCode ? buildShareUrl(currentShareCode) : '-');

  return (
    <Modal closeLabel={t('close')} isOpen={isOpen} onClose={onClose} title={isHebrew ? 'שיתוף' : 'Sharing'}>
      <div className="grid gap-4">
        <section className="grid gap-3 rounded-md border border-border bg-muted p-3 text-sm">
          <Info label={isHebrew ? 'קישור שיתוף בפועל' : 'Actual share link'} value={displayedShareLink} />
          <Info label={isHebrew ? 'יומן' : 'Journal'} value={sharedOwnerId ? `${sharedOwnerId}/${workspaceId}` : workspaceId} />
          <Info label={isHebrew ? 'הרשאה' : 'Permission'} value={sharePermission === 'edit' ? (isHebrew ? 'עריכה' : 'Edit') : (isHebrew ? 'צפייה בלבד' : 'View only')} />
          <p className="text-sm font-semibold text-subtle">
            {isHebrew
              ? 'הקישור כולל קוד שיתוף אמיתי, ולכן הוא פותח את היומן של הבעלים המקורי ולא את היומן האישי של הצופה.'
              : 'The link contains a real share code, so it opens the original owner journal while the receiver stays signed in to their own account.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={isCreatingShare || accessMode !== 'owner'} onClick={createLink} type="button" variant="secondary">{isHebrew ? 'יצירת קישור' : 'Create link'}</Button>
            <Button disabled={isCreatingShare || accessMode !== 'owner'} onClick={copyLink} type="button" variant="secondary">{isHebrew ? 'העתקת קישור' : 'Copy link'}</Button>
            <Button disabled={accessMode !== 'owner'} onClick={() => setSharePermission('view')} type="button" variant={sharePermission === 'view' ? 'primary' : 'secondary'}>{isHebrew ? 'צפייה בלבד' : 'View only'}</Button>
            <Button disabled={accessMode !== 'owner'} onClick={() => setSharePermission('edit')} type="button" variant={sharePermission === 'edit' ? 'primary' : 'secondary'}>{isHebrew ? 'עריכה' : 'Edit'}</Button>
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
