'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea, TextInput } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/auth-provider';
import { getTodayDateKey } from '@/lib/dates';
import { useLanguage } from '@/lib/i18n/language-provider';
import type { AssetType, JournalType, RuleAdherence } from '@/models/journal';
import type { AccountValueMode } from '../data/journal-repository';

import { useJournalStore } from '../store/journal-store';
import { adherenceOptions } from '../config/journal-options';
import { formatAccountValue, getCurrentAccountValue, getSortedAccountValueHistory } from '../utils/account-value';
import { getAllowedTradeModes, getJournalTypeLabel, isTradeModeAllowed } from '../utils/journal-scope';

type SettingsPanelProps = {
  isOpen: boolean;
  isReadOnly?: boolean;
  initialSection?: string | null;
  initialAccountMode?: AccountValueMode;
  onClose: () => void;
  onDeletedCurrentJournal?: () => void;
  onOpenExport: () => void;
  onOpenHelp: () => void;
  onOpenSharing: () => void;
};

export function SettingsPanel({
  isOpen,
  isReadOnly = false,
  initialSection = null,
  initialAccountMode,
  onClose,
  onDeletedCurrentJournal,
  onOpenExport,
  onOpenHelp,
  onOpenSharing,
}: SettingsPanelProps) {
  const { language, setLanguage, setTheme, t, theme } = useLanguage();
  const { error: authError, isLoading: isAuthLoading, signOutUser, updateCurrentEmail, updateCurrentPassword, user } = useAuth();
  const addSymbolOption = useJournalStore((state) => state.addSymbolOption);
  const addScreenshotTimeframe = useJournalStore((state) => state.addScreenshotTimeframe);
  const addCustomEmotion = useJournalStore((state) => state.addCustomEmotion);
  const addCustomRuleViolation = useJournalStore((state) => state.addCustomRuleViolation);
  const addCustomStrategy = useJournalStore((state) => state.addCustomStrategy);
  const disciplineScoreSettings = useJournalStore((state) => state.disciplineScoreSettings);
  const updateDisciplineScoreSettings = useJournalStore((state) => state.updateDisciplineScoreSettings);
  const accountValueResets = useJournalStore((state) => state.accountValueResets);
  const trades = useJournalStore((state) => state.trades);
  const spots = useJournalStore((state) => state.spots);
  const addAccountValueChange = useJournalStore((state) => state.addAccountValueChange);
  const createNewJournal = useJournalStore((state) => state.createNewJournal);
  const deleteCurrentJournal = useJournalStore((state) => state.deleteCurrentJournal);
  const journals = useJournalStore((state) => state.journals);
  const journalName = useJournalStore((state) => state.journalName);
  const workspaceId = useJournalStore((state) => state.workspaceId);
  const switchJournal = useJournalStore((state) => state.switchJournal);
  const updateJournalName = useJournalStore((state) => state.updateJournalName);
  const journalType = useJournalStore((state) => state.journalType);
  const updateJournalType = useJournalStore((state) => state.updateJournalType);
  const clearLocalJournalData = useJournalStore((state) => state.clearLocalJournalData);
  const exportJournalJson = useJournalStore((state) => state.exportJournalJson);
  const importJournalJson = useJournalStore((state) => state.importJournalJson);
  const exportEmail = useJournalStore((state) => state.exportEmail);
  const updateExportEmail = useJournalStore((state) => state.updateExportEmail);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [assetTypeDraft, setAssetTypeDraft] = useState<AssetType>('crypto');
  const [importMessage, setImportMessage] = useState('');
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState<{ date: string; value: string; note: string; mode: AccountValueMode }>({ date: getTodayDateKey(), value: '', note: '', mode: 'live' });
  const [authDraft, setAuthDraft] = useState({ email: '', password: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [newJournalName, setNewJournalName] = useState('');
  const [newJournalType, setNewJournalType] = useState<JournalType | ''>('');
  const [journalTypeDraft, setJournalTypeDraft] = useState<JournalType>('combined');
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [openDangerAction, setOpenDangerAction] = useState<string | null>(null);
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useState(false);
  const [isCurrentJournalDangerOpen, setIsCurrentJournalDangerOpen] = useState(false);
  const [isDeletingJournal, setIsDeletingJournal] = useState(false);
  const [journalMessage, setJournalMessage] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const isHebrew = language === 'he';
  const allowedAccountModes = getAllowedAccountModes(journalType);
  const accountDraftMode = allowedAccountModes.includes(accountDraft.mode) ? accountDraft.mode : allowedAccountModes[0] ?? 'live';
  const accountHistoryForDraftMode = getSortedAccountValueHistory(accountValueResets, accountDraftMode);
  const isInitialAccountValue = accountHistoryForDraftMode.length === 0;
  const requiredCapitalModes = getRequiredCapitalModes(journalType);
  const missingRequiredCapitalModes = requiredCapitalModes.filter((mode) => getSortedAccountValueHistory(accountValueResets, mode).length === 0);
  const isMissingRequiredCapitalForDraftMode = missingRequiredCapitalModes.includes(accountDraftMode);
  const currentAccountValue = getCurrentAccountValue(accountValueResets, accountDraftMode === 'spot' ? Object.values(spots) : Object.values(trades), accountDraftMode);
  const sortedAccountHistory = getSortedAccountValueHistory(accountValueResets).filter((item) => allowedAccountModes.includes(item.mode)).reverse();

  useEffect(() => {
    if (isOpen && initialSection) {
      setOpenSection(initialSection);
    }
    if (isOpen && initialAccountMode) {
      setAccountDraft((current) => ({ ...current, mode: initialAccountMode }));
    }
  }, [initialAccountMode, initialSection, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setRenameDraft(journalName);
    setJournalTypeDraft(journalType);
    setJournalMessage('');
  }, [isOpen, journalName, journalType]);

  const setDraft = (key: string, value: string) => setDrafts((current) => ({ ...current, [key]: value }));
  const addPreset = (key: string, add: (value: string, assetType?: AssetType) => void, assetType?: AssetType) => {
    if (isReadOnly) return;
    add(drafts[key] ?? '', assetType);
    setDraft(key, '');
  };
  const resetJournalData = () => {
    if (isReadOnly) return;
    if (resetConfirmation.trim() !== 'RESET') return;

    clearLocalJournalData();
    setResetConfirmation('');
    setOpenDangerAction(null);
    setJournalMessage(isHebrew ? 'נתוני היומן אופסו. יש להגדיר הון מחדש לפני פיוצרס.' : 'Journal data reset. Set capital again before Futures.');
  };
  const exportData = () => {
    const blob = new Blob([exportJournalJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `e-trading-n-journal-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importData = (event: ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return;

    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (!window.confirm(t('clearLocalDataConfirm'))) {
          setImportMessage('');
          return;
        }

        importJournalJson(String(reader.result ?? ''));
        setImportMessage(t('importJournalSuccess'));
      } catch {
        setImportMessage(t('importJournalError'));
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };
  const updateAdherenceDeduction = (key: RuleAdherence, value: string) => {
    if (isReadOnly) return;

    updateDisciplineScoreSettings({
      ...disciplineScoreSettings,
      adherenceDeductions: {
        ...disciplineScoreSettings.adherenceDeductions,
        [key]: Number(value) || 0,
      },
    });
  };
  const updateNumberSetting = (key: 'negativeEmotionDeduction' | 'ruleViolationDeduction', value: string) => {
    if (isReadOnly) return;

    updateDisciplineScoreSettings({
      ...disciplineScoreSettings,
      [key]: Number(value) || 0,
    });
  };
  const updateNegativeEmotions = (value: string) => {
    if (isReadOnly) return;

    updateDisciplineScoreSettings({
      ...disciplineScoreSettings,
      negativeEmotions: value
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    });
  };
  const addAccountChange = () => {
    if (isReadOnly) return;

    const value = Number(accountDraft.value);
    if (!Number.isFinite(value) || (!isInitialAccountValue && !accountDraft.date)) return;

    addAccountValueChange({ date: accountDraft.date, value, mode: accountDraftMode, note: accountDraft.note });
    setAccountDraft((current) => ({ ...current, date: getTodayDateKey(), value: '', note: '' }));
  };
  const renameCurrentJournal = () => {
    if (isReadOnly || !renameDraft.trim()) return;
    updateJournalName(renameDraft);
    setJournalMessage(isHebrew ? 'שם היומן עודכן.' : 'Journal name updated.');
  };
  const changeCurrentJournalType = () => {
    if (isReadOnly || journalTypeDraft === journalType) return;

    const hasHiddenEntries = Object.values(trades).some((trade) => !isTradeModeAllowed(journalTypeDraft, trade.mode));
    if (hasHiddenEntries) {
      const ok = window.confirm(isHebrew
        ? 'שינוי סוג היומן יסתיר חלק מהטריידים מהתצוגה, אך לא ימחק אותם. להמשיך?'
        : 'Changing the journal type will hide some trades from this journal view, but will not delete them. Continue?');
      if (!ok) return;
    }

    updateJournalType(journalTypeDraft);
    setJournalMessage(isHebrew ? 'סוג היומן עודכן.' : 'Journal type updated.');
  };
  const deleteConfirmationMatches = deleteConfirmation.trim() === journalName || deleteConfirmation.trim() === 'DELETE';
  const confirmDeleteCurrentJournal = async () => {
    if (isReadOnly || !deleteConfirmationMatches || isDeletingJournal) return;

    setIsDeletingJournal(true);
    setJournalMessage('');

    try {
      await deleteCurrentJournal();
      setDeleteConfirmation('');
      setIsDeleteModalOpen(false);
      onDeletedCurrentJournal?.();
      onClose();
    } catch (deleteError) {
      setJournalMessage(deleteError instanceof Error ? deleteError.message : isHebrew ? 'לא ניתן למחוק את היומן כרגע.' : 'Could not delete this journal right now.');
    } finally {
      setIsDeletingJournal(false);
    }
  };
  const isPasswordProvider = Boolean(user?.providerData.some((provider) => provider.providerId === 'password'));
  const isGoogleProvider = Boolean(user?.providerData.some((provider) => provider.providerId === 'google.com'));
  const changeEmail = async () => {
    if (isReadOnly || !authDraft.email.trim()) return;
    const updated = await updateCurrentEmail(authDraft.email.trim());
    setAuthMessage(updated ? (isHebrew ? 'האימייל עודכן.' : 'Email updated.') : '');
  };
  const changePassword = async () => {
    if (isReadOnly || !authDraft.password) return;
    const updated = await updateCurrentPassword(authDraft.password);
    setAuthMessage(updated ? (isHebrew ? 'הסיסמה עודכנה.' : 'Password updated.') : '');
    if (updated) setAuthDraft((current) => ({ ...current, password: '' }));
  };

  return (
    <Modal closeLabel={t('close')} isOpen={isOpen} onClose={onClose} title={t('journalSettings')}>
      <div className="grid gap-4">
        {isReadOnly ? (
          <p className="rounded-md bg-muted p-3 text-sm font-bold text-subtle">{t('lockedViewOnly')}</p>
        ) : null}
        <section className="grid gap-2 rounded-md border border-border bg-surface p-3">
          <p className="text-sm font-bold text-ink">{isHebrew ? 'כלים' : 'Tools'}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={onOpenExport} type="button" variant="secondary">
              {isHebrew ? 'ייצוא' : 'Export'}
            </Button>
            <Button onClick={onOpenSharing} type="button" variant="secondary">
              {isHebrew ? 'שיתוף' : 'Sharing'}
            </Button>
          </div>
        </section>
        <AccordionSection
          isOpen={openSection === 'systemDisplay'}
          onToggle={() => setOpenSection(openSection === 'systemDisplay' ? null : 'systemDisplay')}
          title={isHebrew ? 'מערכת ותצוגה' : 'System & Display'}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Button onClick={() => setLanguage(language === 'he' ? 'en' : 'he')} type="button" variant="secondary">
              {isHebrew ? 'שפה: עברית' : 'Language: English'}
            </Button>
            <Button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} type="button" variant="secondary">
              {theme === 'dark' ? (isHebrew ? 'מצב: כהה' : 'Mode: Dark') : isHebrew ? 'מצב: בהיר' : 'Mode: Light'}
            </Button>
            <Button onClick={onOpenHelp} type="button" variant="secondary">
              {isHebrew ? 'עזרה' : 'Help'}
            </Button>
          </div>
        </AccordionSection>
        <AccordionSection
          isOpen={openSection === 'currentJournal'}
          onToggle={() => setOpenSection(openSection === 'currentJournal' ? null : 'currentJournal')}
          title={isHebrew ? 'שם היומן' : 'Journal Name'}
        >
          <div className="grid gap-3">
            <div className="grid gap-2 rounded-md border border-border bg-background p-3">
              <p className="text-sm font-bold text-ink">{isHebrew ? 'שינוי שם יומן' : 'Rename Journal'}</p>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <TextInput
                  disabled={isReadOnly}
                  label={isHebrew ? 'שם יומן' : 'Journal name'}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  value={renameDraft}
                />
                <Button disabled={isReadOnly || !renameDraft.trim() || renameDraft.trim() === journalName} onClick={renameCurrentJournal} type="button" variant="secondary">
                  {isHebrew ? 'שינוי שם יומן' : 'Rename Journal'}
                </Button>
              </div>
            </div>
            <div className="grid gap-2 rounded-md border border-border bg-background p-3">
              <p className="text-sm font-bold text-ink">{isHebrew ? 'סוג יומן' : 'Journal Type'}</p>
              <p className="text-sm font-semibold text-subtle">
                {isHebrew
                  ? 'שינוי סוג יומן מסתיר מצבים לא רלוונטיים מהתצוגה בלבד. טריידים לא נמחקים.'
                  : 'Changing journal type only hides irrelevant modes from the view. Trades are not deleted.'}
              </p>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Select
                  disabled={isReadOnly}
                  label={isHebrew ? 'סוג יומן' : 'Journal type'}
                  onValueChange={(value) => setJournalTypeDraft(value as JournalType)}
                  options={[
                    { value: 'liveOnly', label: getJournalTypeLabel('liveOnly', isHebrew) },
                    { value: 'backtestingOnly', label: getJournalTypeLabel('backtestingOnly', isHebrew) },
                    { value: 'spotOnly', label: getJournalTypeLabel('spotOnly', isHebrew) },
                    { value: 'combined', label: getJournalTypeLabel('combined', isHebrew) },
                  ]}
                  value={journalTypeDraft}
                />
                <Button disabled={isReadOnly || journalTypeDraft === journalType} onClick={changeCurrentJournalType} type="button" variant="secondary">
                  {isHebrew ? 'עדכון סוג יומן' : 'Update Type'}
                </Button>
              </div>
            </div>
            {journalMessage ? <p className="rounded-md bg-muted p-3 text-sm font-bold text-subtle">{journalMessage}</p> : null}
          </div>
        </AccordionSection>
        <AccordionSection
          isOpen={openSection === 'authAccount'}
          onToggle={() => setOpenSection(openSection === 'authAccount' ? null : 'authAccount')}
          title={isHebrew ? 'חשבון והתחברות' : 'Account and Login'}
        >
          <div className="grid gap-3">
            <div className="rounded-md bg-background p-3 text-sm font-semibold text-ink">
              <p>{isHebrew ? 'אימייל נוכחי' : 'Current email'}: {user?.email ?? '-'}</p>
              <p className="mt-1 text-subtle">
                {isGoogleProvider && !isPasswordProvider
                  ? isHebrew
                    ? 'החשבון מחובר דרך Google. שינוי אימייל/סיסמה עשוי להתנהל דרך Google אלא אם קישור Email/Password פעיל לחשבון.'
                    : 'This account is signed in with Google. Email/password changes may be managed by Google unless Email/Password is linked.'
                  : isHebrew
                    ? 'חשבון Email/Password יכול לשנות אימייל וסיסמה. ייתכן שתידרש התחברות מחדש.'
                    : 'Email/Password accounts can change email and password. A fresh login may be required.'}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <TextInput
                disabled={isReadOnly || isAuthLoading}
                label={isHebrew ? 'אימייל חדש' : 'New email'}
                onChange={(event) => setAuthDraft((current) => ({ ...current, email: event.target.value }))}
                type="email"
                value={authDraft.email}
              />
              <Button disabled={isReadOnly || isAuthLoading || !authDraft.email.trim()} onClick={() => void changeEmail()} type="button" variant="secondary">
                {isHebrew ? 'שנה אימייל' : 'Change Email'}
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <TextInput
                disabled={isReadOnly || isAuthLoading}
                label={isHebrew ? 'סיסמה חדשה' : 'New password'}
                onChange={(event) => setAuthDraft((current) => ({ ...current, password: event.target.value }))}
                type="password"
                value={authDraft.password}
              />
              <Button disabled={isReadOnly || isAuthLoading || authDraft.password.length < 6} onClick={() => void changePassword()} type="button" variant="secondary">
                {isHebrew ? 'שנה סיסמה' : 'Change Password'}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void signOutUser()} type="button" variant="secondary">
                {isHebrew ? 'התנתקות' : 'Logout'}
              </Button>
            </div>
            {authMessage ? <p className="rounded-md bg-successSoft p-3 text-sm font-bold text-success">{authMessage}</p> : null}
            {authError ? <p className="whitespace-pre-line rounded-md bg-dangerSoft p-3 text-sm font-bold text-danger">{authError}</p> : null}
          </div>
        </AccordionSection>
        <AccordionSection
          isOpen={openSection === 'categories'}
          onToggle={() => setOpenSection(openSection === 'categories' ? null : 'categories')}
          title={t('editCategories')}
        >
          <p className="text-sm text-subtle">{t('settingsPlaceholder')}</p>
          <div className="grid gap-3">
            <AssetSettingsGroup
              add={() => addPreset('coins', addSymbolOption, assetTypeDraft)}
              assetType={assetTypeDraft}
              isReadOnly={isReadOnly}
              label={t('symbol')}
              onAssetTypeChange={setAssetTypeDraft}
              onChange={(value) => setDraft('coins', value)}
              value={drafts.coins ?? ''}
            />
            <SettingsGroup add={() => addPreset('timeframes', addScreenshotTimeframe)} isReadOnly={isReadOnly} label={t('timeframe')} onChange={(value) => setDraft('timeframes', value)} value={drafts.timeframes ?? ''} />
            <SettingsGroup add={() => addPreset('emotions', addCustomEmotion)} isReadOnly={isReadOnly} label={t('emotionBefore')} onChange={(value) => setDraft('emotions', value)} value={drafts.emotions ?? ''} />
            <SettingsGroup add={() => addPreset('violations', addCustomRuleViolation)} isReadOnly={isReadOnly} label={t('ruleViolations')} onChange={(value) => setDraft('violations', value)} value={drafts.violations ?? ''} />
            <SettingsGroup add={() => addPreset('strategies', addCustomStrategy)} isReadOnly={isReadOnly} label={t('strategy')} onChange={(value) => setDraft('strategies', value)} value={drafts.strategies ?? ''} />
          </div>
        </AccordionSection>
        <AccordionSection
          isOpen={openSection === 'discipline'}
          onToggle={() => setOpenSection(openSection === 'discipline' ? null : 'discipline')}
          title={t('editDisciplineScores')}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {adherenceOptions.map((option) => (
              <TextInput
                disabled={isReadOnly}
                inputMode="numeric"
                key={option.value}
                label={`${getAdherenceLabel(option.value, t)} deduction`}
                onChange={(event) => updateAdherenceDeduction(option.value, event.target.value)}
                type="number"
                value={String(disciplineScoreSettings.adherenceDeductions[option.value] ?? 0)}
              />
            ))}
            <TextInput
              disabled={isReadOnly}
              inputMode="numeric"
              label={isHebrew ? 'ניכוי על רגשות שליליים' : 'Negative emotion deduction'}
              onChange={(event) => updateNumberSetting('negativeEmotionDeduction', event.target.value)}
              type="number"
              value={String(disciplineScoreSettings.negativeEmotionDeduction)}
            />
            <TextInput
              disabled={isReadOnly}
              inputMode="numeric"
              label={isHebrew ? 'ניכוי על הפרות כללים' : 'Rule violation deduction'}
              onChange={(event) => updateNumberSetting('ruleViolationDeduction', event.target.value)}
              type="number"
              value={String(disciplineScoreSettings.ruleViolationDeduction)}
            />
          </div>
          <Textarea
            disabled={isReadOnly}
            label={isHebrew ? 'רגשות שליליים לחישוב' : 'Negative emotions for scoring'}
            onChange={(event) => updateNegativeEmotions(event.target.value)}
            value={disciplineScoreSettings.negativeEmotions.join(', ')}
          />
        </AccordionSection>
        <AccordionSection
          isOpen={openSection === 'journals'}
          onToggle={() => setOpenSection(openSection === 'journals' ? null : 'journals')}
          title={isHebrew ? 'ניהול יומנים' : 'Journal Management'}
        >
          <div className="grid gap-3">
            {journals.length ? (
              <label className="grid gap-1 text-sm font-bold text-ink">
                {isHebrew ? 'בחירת יומן' : 'Journal selector'}
                <select
                  className="min-h-10 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-blue-100"
                  disabled={isReadOnly}
                  onChange={(event) => switchJournal(event.target.value)}
                  value={journals.some((journal) => journal.workspaceId === workspaceId) ? workspaceId : journals[0]?.workspaceId ?? ''}
                >
                  {journals.map((journal) => (
                    <option key={journal.workspaceId} value={journal.workspaceId}>
                      {journal.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="rounded-md bg-background p-3 text-sm font-bold text-subtle">
                {isHebrew ? 'אין יומנים קיימים. צור יומן חדש.' : 'No existing journals. Create a new journal.'}
              </p>
            )}
            <p className="break-all rounded-md bg-background p-3 text-xs font-semibold text-subtle">
              {isHebrew ? 'מזהה יומן נוכחי' : 'Current journal id'}: {workspaceId}
            </p>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-end">
              <TextInput disabled={isReadOnly} label={isHebrew ? 'שם יומן חדש' : 'New journal name'} onChange={(event) => setNewJournalName(event.target.value)} value={newJournalName} />
              <Select
                disabled={isReadOnly}
                label={isHebrew ? 'סוג יומן' : 'Journal type'}
                onValueChange={(value) => setNewJournalType(value as JournalType)}
                options={[
                  { value: '', label: isHebrew ? 'בחר סוג יומן' : 'Choose type' },
                  { value: 'liveOnly', label: getJournalTypeLabel('liveOnly', isHebrew) },
                  { value: 'backtestingOnly', label: getJournalTypeLabel('backtestingOnly', isHebrew) },
                  { value: 'spotOnly', label: getJournalTypeLabel('spotOnly', isHebrew) },
                  { value: 'combined', label: getJournalTypeLabel('combined', isHebrew) },
                ]}
                required
                value={newJournalType}
              />
              <Button
                disabled={isReadOnly || !newJournalType}
                onClick={() => {
                  if (!newJournalType) return;
                  createNewJournal(newJournalName, newJournalType);
                  setNewJournalName('');
                  setNewJournalType('');
                  setOpenSection(null);
                }}
                type="button"
                variant="secondary"
              >
                {t('createNewJournal')}
              </Button>
            </div>
          </div>
        </AccordionSection>
        <AccordionSection
          isOpen={openSection === 'account'}
          onToggle={() => setOpenSection(openSection === 'account' ? null : 'account')}
          title={<RequiredTitle isMissing={missingRequiredCapitalModes.length > 0} title={t('accountValueResets')} />}
        >
          <div className="grid gap-2 rounded-md bg-background p-3 text-sm font-semibold text-ink">
            {requiredCapitalModes.map((mode) => {
              const isMissing = missingRequiredCapitalModes.includes(mode);

              return (
                <div className="flex items-center justify-between gap-3" key={mode}>
                  <span>
                    {getModeLabel(mode, isHebrew)}
                    {isMissing ? <RequiredAsterisk /> : null}
                  </span>
                  <span className={isMissing ? 'text-danger' : 'text-success'}>
                    {isMissing ? (isHebrew ? 'נדרש הון התחלתי' : 'Initial capital required') : (isHebrew ? 'הוגדר' : 'Set')}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="rounded-md bg-background p-3 text-sm font-semibold text-subtle">
            {isInitialAccountValue
              ? isHebrew
                ? 'זהו ההון ההתחלתי למצב שנבחר. אין צורך בתאריך, והוא יחול על כל תאריכי היומן עד שינוי עתידי.'
                : 'This is the initial capital for the selected mode. Date is optional for tracking only, and it applies to every journal date until a later change.'
              : isHebrew
                ? 'השינוי חל רק מהתאריך שנבחר והלאה. נתוני עבר נשארים עם שווי החשבון שהיה תקף אז.'
                : 'The change applies only from the selected date forward. Past daily/monthly data keeps the account value that was active then.'}
          </p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <div className="rounded-md bg-muted p-3 text-sm font-semibold text-ink sm:col-span-4">
              {getModeLabel(accountDraft.mode, isHebrew)} · {isHebrew ? 'שווי תיק נוכחי' : 'Current capital'}: {formatAccountValue(currentAccountValue?.value)}
              {isMissingRequiredCapitalForDraftMode ? <RequiredAsterisk /> : null}
              {currentAccountValue?.date ? <span className="text-subtle"> ({currentAccountValue.date})</span> : null}
            </div>
            <Select disabled={isReadOnly} label={isHebrew ? 'מצב' : 'Mode'} onValueChange={(value) => setAccountDraft((current) => ({ ...current, mode: value as AccountValueMode }))} options={modeCapitalOptions(isHebrew, allowedAccountModes)} value={accountDraftMode} />
            <TextInput disabled={isReadOnly} label={t('entryDate')} onChange={(event) => setAccountDraft((current) => ({ ...current, date: event.target.value }))} required={!isInitialAccountValue} type="date" value={accountDraft.date} />
            <TextInput disabled={isReadOnly} inputMode="decimal" label={`${t('currentAccountValue')} ($)`} onChange={(event) => setAccountDraft((current) => ({ ...current, value: event.target.value }))} type="number" value={accountDraft.value} />
            <TextInput disabled={isReadOnly} label={t('notes')} onChange={(event) => setAccountDraft((current) => ({ ...current, note: event.target.value }))} value={accountDraft.note} />
            <Button disabled={isReadOnly || (!isInitialAccountValue && !accountDraft.date) || !accountDraft.value} onClick={addAccountChange} type="button" variant="secondary">
              {isHebrew ? 'שמירה' : 'Save'}
            </Button>
          </div>
          <div className="grid gap-2">
            {sortedAccountHistory.length ? (
              sortedAccountHistory.map((item) => (
                <div className="grid gap-1 rounded-md border border-border bg-background p-3 text-sm" key={item.id}>
                  <span className="font-bold text-ink">{getModeLabel(item.mode, isHebrew)} · {item.date || (isHebrew ? 'הון התחלתי' : 'Initial capital')} · {formatAccountValue(item.value)}</span>
                  {item.note ? <span className="text-subtle">{item.note}</span> : null}
                </div>
              ))
            ) : (
              <p className="rounded-md bg-muted p-3 text-sm font-semibold text-subtle">{t('noEntries')}</p>
            )}
          </div>
        </AccordionSection>
        <AccordionSection
          isOpen={openSection === 'email'}
          onToggle={() => setOpenSection(openSection === 'email' ? null : 'email')}
          title={isHebrew ? 'אימייל לייצוא עתידי' : 'Future export email'}
        >
          <TextInput disabled={isReadOnly} label={isHebrew ? 'אימייל לקבלת PDF בעתיד' : 'Optional email for future PDF export'} onChange={(event) => updateExportEmail(event.target.value)} type="email" value={exportEmail} />
          <p className="text-sm text-subtle">{isHebrew ? 'האפליקציה לא שולחת אימייל עדיין. זה נשמר כהכנה.' : 'No email is sent yet. This is stored as a future export setting.'}</p>
        </AccordionSection>
        <AccordionSection
          isOpen={openSection === 'advancedBackup'}
          onToggle={() => setOpenSection(openSection === 'advancedBackup' ? null : 'advancedBackup')}
          title={isHebrew ? 'גיבוי מתקדם' : 'Advanced backup'}
        >
          <div>
            <p className="text-sm font-bold text-ink">{isHebrew ? 'JSON טכני' : 'Technical JSON backup'}</p>
            <p className="mt-1 text-sm text-subtle">{isHebrew ? 'מיועד לגיבוי/שחזור טכני, לא לדוח קריא.' : 'Use this only for technical backup/restore, not as the readable journal export.'}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={exportData} type="button" variant="secondary">
              {t('exportJournalJson')}
            </Button>
            <Button disabled={isReadOnly} onClick={() => importInputRef.current?.click()} type="button" variant="secondary">
              {t('importJournalJson')}
            </Button>
          </div>
          <input accept="application/json" className="hidden" onChange={importData} ref={importInputRef} type="file" />
          {importMessage ? <p className="text-sm font-semibold text-subtle">{importMessage}</p> : null}
        </AccordionSection>
        <AccordionSection
          danger
          isOpen={isDangerZoneOpen}
          onToggle={() => setIsDangerZoneOpen((current) => !current)}
          title={t('dangerZone')}
        >
          <AccordionSection
            danger
            isOpen={isCurrentJournalDangerOpen}
            onToggle={() => setIsCurrentJournalDangerOpen((current) => !current)}
            title={isHebrew ? 'ניהול יומן נוכחי' : 'Current Journal Management'}
          >
            <div className="grid gap-3">
              <AccordionSection
                danger
                isOpen={openDangerAction === 'resetJournalData'}
                onToggle={() => setOpenDangerAction(openDangerAction === 'resetJournalData' ? null : 'resetJournalData')}
                title={isHebrew ? 'מחיקת נתוני יומן' : 'Delete Journal Data'}
              >
                <div className="grid gap-3 rounded-md border border-dangerSoft bg-dangerSoft/40 p-3">
                  <p className="text-sm font-semibold leading-6 text-danger">
                    {isHebrew
                      ? 'מאפס את תוכן היומן הנוכחי בלבד. היומן נשאר פתוח, אך טריידים, משימות, פריסטים, הגדרות יומן, הון ושווי חשבון בכל המצבים יימחקו.'
                      : 'Resets only the current journal content. The journal stays open, but trades, tasks, presets, journal settings, capital, and account value history for every mode are removed.'}
                  </p>
                  <TextInput
                    disabled={isReadOnly}
                    label={isHebrew ? 'הקלד RESET כדי לאפס נתונים' : 'Type RESET to reset data'}
                    onChange={(event) => setResetConfirmation(event.target.value)}
                    value={resetConfirmation}
                  />
                  <div className="flex justify-end">
                    <Button disabled={isReadOnly || resetConfirmation.trim() !== 'RESET'} onClick={resetJournalData} type="button" variant="secondary">
                      {isHebrew ? 'מחיקת נתוני יומן' : 'Delete Journal Data'}
                    </Button>
                  </div>
                </div>
              </AccordionSection>
              <AccordionSection
                danger
                isOpen={openDangerAction === 'deleteJournal'}
                onToggle={() => setOpenDangerAction(openDangerAction === 'deleteJournal' ? null : 'deleteJournal')}
                title={isHebrew ? 'מחיקת יומן' : 'Delete Journal'}
              >
                <div className="grid gap-3 rounded-md border border-dangerSoft bg-dangerSoft/40 p-3">
                  <p className="text-sm font-semibold leading-6 text-danger">
                    {isHebrew
                      ? 'מוחק את היומן הנוכחי עצמו. החשבון שלך ויומנים אחרים לא יימחקו.'
                      : 'Deletes the current journal itself. Your user account and other journals will not be deleted.'}
                  </p>
                  <div className="flex justify-end">
                    <Button disabled={isReadOnly} onClick={() => setIsDeleteModalOpen(true)} type="button" variant="secondary">
                      {isHebrew ? 'מחיקת יומן' : 'Delete Journal'}
                    </Button>
                  </div>
                </div>
              </AccordionSection>
              {journalMessage ? <p className="rounded-md bg-muted p-3 text-sm font-bold text-subtle">{journalMessage}</p> : null}
            </div>
          </AccordionSection>
        </AccordionSection>
        <div className="flex justify-end">
          <Button onClick={onClose} type="button" variant="secondary">
            {t('close')}
          </Button>
        </div>
      </div>
      <Modal
        closeLabel={t('close')}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (isDeletingJournal) return;
          setIsDeleteModalOpen(false);
          setDeleteConfirmation('');
        }}
        title={isHebrew ? 'מחיקת יומן' : 'Delete Journal'}
      >
        <div className="grid gap-4">
          <div className="grid gap-2 rounded-md border border-dangerSoft bg-dangerSoft/40 p-3 text-sm font-semibold leading-6 text-danger">
            <p className="font-bold">{isHebrew ? 'זו פעולה קבועה.' : 'This action is permanent.'}</p>
            <p>
              {isHebrew
                ? `היומן "${journalName}" יימחק, כולל טריידים, משימות, פריסטים והגדרות יומן. החשבון שלך ויומנים אחרים לא יימחקו.`
                : `The journal "${journalName}" will be deleted. This is different from Delete Journal Data, which only resets content. Your user account and other journals will not be deleted.`}
            </p>
          </div>
          <TextInput
            autoFocus
            disabled={isDeletingJournal}
            label={isHebrew ? 'הקלד את שם היומן או DELETE' : 'Type the journal name or DELETE'}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            value={deleteConfirmation}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={isDeletingJournal}
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeleteConfirmation('');
              }}
              type="button"
              variant="secondary"
            >
              {t('cancel')}
            </Button>
            <Button disabled={!deleteConfirmationMatches || isDeletingJournal} onClick={() => void confirmDeleteCurrentJournal()} type="button" variant="secondary">
              {isDeletingJournal ? (isHebrew ? 'מוחק...' : 'Deleting...') : isHebrew ? 'מחיקת יומן' : 'Delete Journal'}
            </Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}

function AccordionSection({
  children,
  danger = false,
  isOpen,
  onToggle,
  title,
}: {
  children: ReactNode;
  danger?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  title: ReactNode;
}) {
  return (
    <section className={`grid gap-3 rounded-md border p-3 ${danger ? 'border-dangerSoft bg-dangerSoft/40' : 'border-border bg-muted'}`}>
      <button className="flex items-center justify-between gap-3 text-start" onClick={onToggle} type="button">
        <span className={`text-sm font-bold ${danger ? 'text-danger' : 'text-ink'}`}>{title}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded bg-background text-sm font-bold ${danger ? 'text-danger' : 'text-ink'}`}>
          {isOpen ? '-' : '+'}
        </span>
      </button>
      {isOpen ? <div className="grid gap-3">{children}</div> : null}
    </section>
  );
}

function RequiredTitle({ isMissing, title }: { isMissing: boolean; title: string }) {
  return (
    <span>
      {title}
      {isMissing ? <RequiredAsterisk /> : null}
    </span>
  );
}

function RequiredAsterisk() {
  return <span className="ms-1 text-danger" aria-hidden="true">*</span>;
}

function getRequiredCapitalModes(journalType: JournalType): AccountValueMode[] {
  if (journalType === 'liveOnly') return ['live'];
  if (journalType === 'backtestingOnly') return ['backtesting'];
  if (journalType === 'spotOnly') return ['spot'];
  return ['live', 'backtesting', 'spot'];
}

function getAdherenceLabel(key: RuleAdherence, t: ReturnType<typeof useLanguage>['t']) {
  if (key === 'not_applicable') return t('notApplicable');
  return t(key);
}

function getAllowedAccountModes(journalType: JournalType): AccountValueMode[] {
  const modes: AccountValueMode[] = [...getAllowedTradeModes(journalType)];
  if (journalType === 'spotOnly' || journalType === 'combined') modes.push('spot');
  return modes;
}

function modeCapitalOptions(isHebrew: boolean, modes: AccountValueMode[]) {
  return modes.map((mode) => ({
    value: mode,
    label: getModeLabel(mode, isHebrew),
  }));
}

function getModeLabel(mode: AccountValueMode | undefined, isHebrew: boolean) {
  if (mode === 'spot') return isHebrew ? 'ספוט' : 'Spot';
  if (mode === 'backtesting') return isHebrew ? 'בק-טסטינג' : 'Backtesting';
  return isHebrew ? 'פיוצרס' : 'Futures';
}

function SettingsGroup({ label, value, onChange, add, isReadOnly }: { label: string; value: string; onChange: (value: string) => void; add: () => void; isReadOnly: boolean }) {
  const { language } = useLanguage();
  const isHebrew = language === 'he';

  return (
    <section className="rounded-md border border-border bg-white p-3">
      <p className="mb-2 text-xs font-semibold text-subtle">
        {isHebrew ? 'הוספה כאן תופיע מיד בבחירה בטופס הטרייד.' : 'Add here to make the option selectable immediately in the trade form.'}
      </p>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <TextInput disabled={isReadOnly} label={label} onChange={(event) => onChange(event.target.value)} value={value} />
        <Button disabled={isReadOnly || !value.trim()} onClick={add} type="button" variant="secondary">{isHebrew ? 'הוספה' : 'Add'}</Button>
      </div>
    </section>
  );
}

function AssetSettingsGroup({
  label,
  value,
  assetType,
  onChange,
  onAssetTypeChange,
  add,
  isReadOnly,
}: {
  label: string;
  value: string;
  assetType: AssetType;
  onChange: (value: string) => void;
  onAssetTypeChange: (value: AssetType) => void;
  add: () => void;
  isReadOnly: boolean;
}) {
  const { language } = useLanguage();
  const isHebrew = language === 'he';
  const assetTypeOptions = [
    { value: 'crypto' as const, label: isHebrew ? 'קריפטו' : 'Crypto' },
    { value: 'stock' as const, label: isHebrew ? 'מניה' : 'Stock' },
    { value: 'forex' as const, label: isHebrew ? 'מט"ח' : 'Forex' },
  ];

  return (
    <section className="rounded-md border border-border bg-white p-3">
      <p className="mb-2 text-xs font-semibold text-subtle">
        {isHebrew ? 'בחר סוג נכס כדי שהסימבול ישמש אחר כך בסינון ובסטטיסטיקות.' : 'Choose an asset type so this symbol can be used later in filters and statistics.'}
      </p>
      <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end">
        <Select disabled={isReadOnly} label={isHebrew ? 'סוג נכס' : 'Asset type'} onValueChange={onAssetTypeChange} options={assetTypeOptions} required value={assetType} />
        <TextInput disabled={isReadOnly} label={label} onChange={(event) => onChange(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} value={value} />
        <Button disabled={isReadOnly || !value.trim() || !assetType} onClick={add} type="button" variant="secondary">{isHebrew ? 'הוספה' : 'Add'}</Button>
      </div>
    </section>
  );
}
