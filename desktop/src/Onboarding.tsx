import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Copy,
  Monitor,
  Rocket,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import { en, ru } from './i18n';
import { guideEn, guideRu } from './guide-i18n';
import type { DesktopInfo, Profile, Snapshot } from './types';
import ConnectionForm from './ConnectionForm';

export default function Onboarding({
  language,
  setLanguage,
  profile,
  setProfile,
  connect,
  saving,
  snapshot,
  info,
  refresh,
  close,
  initialStep = 0,
}: {
  language: 'ru' | 'en';
  setLanguage: (next: 'ru' | 'en') => void;
  profile: Profile | null;
  setProfile: (next: Profile) => void;
  connect: () => Promise<boolean>;
  saving: boolean;
  snapshot: Snapshot | null;
  info: DesktopInfo;
  refresh: () => void;
  close: () => Promise<void>;
  initialStep?: number;
}) {
  const [step, setStep] = useState(initialStep);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [dismissError, setDismissError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const g = language === 'ru' ? guideRu : guideEn;
  const web = info.runtime === 'web';
  const t = (key: keyof typeof ru) => (language === 'ru' ? ru : en)[key];
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  const dismiss = async () => {
    try {
      await close();
    } catch (error) {
      setDismissError(String(error));
    }
  };
  const testConnection = async () => {
    try {
      const ok = await connect();
      setResult({ ok, message: ok ? '' : t('connectionHelp') });
      return ok;
    } catch (error) {
      setResult({ ok: false, message: String(error) });
      return false;
    }
  };
  const code = `from telegram_bot_control import start\n\nmonitor = start(\n    bot=bot,\n    dispatcher=dp,${profile?.dataDir ? `\n    data_dir=${JSON.stringify(profile.dataDir)},` : ''}\n)\ndp.update.outer_middleware(monitor.middleware())`;
  return (
    <dialog
      ref={dialog}
      className="guide-dialog"
      data-testid="guide"
      aria-labelledby="guide-title"
      onCancel={(event) => {
        event.preventDefault();
        void dismiss();
      }}
    >
      <header className="guide-header">
        <div className="guide-logo">
          <Rocket size={23} />
        </div>
        <div>
          <small>{g.label}</small>
          <strong>Telegram Bot Control</strong>
        </div>
        <div className="guide-language-control">
          <select
            data-testid="guide-language"
            aria-label={g.language}
            value={language}
            onChange={(e) => setLanguage(e.target.value === 'en' ? 'en' : 'ru')}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" className="guide-language-arrow" />
        </div>
        <button className="icon-button" onClick={() => void dismiss()} aria-label={g.close}>
          <X size={19} />
        </button>
      </header>
      <div className="guide-layout">
        <aside className="guide-progress" aria-label={g.label}>
          <p>{g.title}</p>
          <small>{g.subtitle}</small>
          <ol>
            {g.steps.map((name, index) => (
              <li
                key={name}
                aria-current={step === index ? 'step' : undefined}
                className={index === step ? 'current' : index < step ? 'done' : ''}
              >
                <span>{index < step ? <Check size={13} /> : index + 1}</span>
                {name}
              </li>
            ))}
          </ol>
          <div className="guide-private">
            <ShieldCheck size={17} />
            <small>{web ? t('webTransport') : t('connectionHint')}</small>
          </div>
        </aside>
        <div className="guide-content" data-testid="guide-step" data-step={step}>
          <h2 id="guide-title" ref={heading} tabIndex={-1}>
            {[g.welcome, g.connectionTitle, g.installTitle, g.verifyTitle, g.readyTitle][step]}
          </h2>
          {step === 0 && (
            <>
              <p>{g.welcomeBody}</p>
              <div className="guide-features">
                {[
                  [<Monitor size={23} />, g.featureStatus, g.featureStatusBody],
                  [<Activity size={23} />, g.featureActivity, g.featureActivityBody],
                  [<Bot size={23} />, g.featureControl, g.featureControlBody],
                ].map(([icon, title, body], index) => (
                  <div key={index}>
                    {icon}
                    <strong>{title}</strong>
                    <p>{body}</p>
                  </div>
                ))}
              </div>
              <div className="guide-callout">
                <Terminal size={20} />
                <p>{g.connectionPython}</p>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <p>{web ? g.webConnection : g.connectionBody}</p>
              {web && (
                <div className="guide-code">
                  <pre>
                    <code>{profile?.dataDir}</code>
                  </pre>
                </div>
              )}
              {profile && !web && (
                <ConnectionForm
                  profile={profile}
                  change={(next) => {
                    setProfile(next);
                    setResult(null);
                  }}
                  connect={testConnection}
                  saving={saving}
                  t={t}
                  directory={result?.ok ? snapshot?.meta.data_dir : undefined}
                />
              )}
              {!web && (
                <p
                  data-testid="connection-result"
                  className={`guide-result ${result ? (result.ok ? 'success' : 'error') : ''}`}
                  role={result && !result.ok ? 'alert' : 'status'}
                >
                  {result ? (result.ok ? g.connectionOk : result.message) : g.connectionIdle}
                </p>
              )}
              <p className="guide-note">{g.connectionPython}</p>
            </>
          )}
          {step === 2 && (
            <>
              <p>{g.installBody}</p>
              <CopyBlock title={g.installLabel} code={g.installCommand} language={language} />
              <p>{g.codeBody}</p>
              <CopyBlock title={g.codeLabel} code={code} language={language} testId="guide-code" />
              <p className="guide-note">{g.sameDirectory}</p>
            </>
          )}
          {step === 3 && (
            <>
              <p>{g.verifyBody}</p>
              <div className="guide-check">
                <span>
                  <CheckCircle2 size={28} />
                  <strong>{snapshot?.bots.length || 0}</strong>
                </span>
                <div>
                  <strong>{g.registered}</strong>
                  <p>
                    {snapshot?.bots.length
                      ? snapshot.bots.map((bot) => bot.name).join(', ')
                      : g.empty}
                  </p>
                </div>
              </div>
              <p>
                {snapshot?.bots.length
                  ? g.registeredBody
                  : snapshot
                    ? g.emptyBody
                    : g.verifyConnection}
              </p>
              <button className="primary-button" onClick={refresh}>
                {g.refresh}
              </button>
              <div className="guide-callout">
                <ShieldCheck size={20} />
                <p>{g.history}</p>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <div className="guide-finish-icon">
                <CheckCircle2 size={36} />
              </div>
              <div className="guide-tip">
                <strong>{g.featureControl}</strong>
                <p>{g.controls}</p>
              </div>
              <div className="guide-tip">
                <strong>{language === 'ru' ? 'Окно и трей' : 'Window and tray'}</strong>
                <p>{web ? g.webFinish : info.trayAvailable ? g.tray : g.trayUnavailable}</p>
              </div>
              <div className="guide-tip">
                <strong>{t('settings')}</strong>
                <p>{g.settings}</p>
              </div>
              <p className="guide-note">{g.reopen}</p>
            </>
          )}
        </div>
      </div>
      {dismissError && (
        <p className="guide-dismiss-error" role="alert">
          {dismissError}
        </p>
      )}
      <footer className="guide-footer">
        <button className="guide-later" onClick={() => void dismiss()}>
          {g.later}
        </button>
        <span>
          {step + 1} / {g.steps.length}
        </span>
        {step > 0 && (
          <button className="guide-back" onClick={() => setStep(step - 1)}>
            <ChevronLeft size={15} />
            {g.back}
          </button>
        )}
        <button
          data-testid={step === 4 ? 'guide-finish' : 'guide-next'}
          className="primary-button"
          onClick={() => (step === 4 ? void dismiss() : setStep(step + 1))}
        >
          {step === 4 ? g.finish : g.next}
          <ChevronRight size={15} />
        </button>
      </footer>
    </dialog>
  );
}

function CopyBlock({
  title,
  code,
  language,
  testId,
}: {
  title: string;
  code: string;
  language: 'ru' | 'en';
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const g = language === 'ru' ? guideRu : guideEn;
  useEffect(() => {
    setCopied(false);
    setError(false);
  }, [code]);
  return (
    <div className="guide-code">
      <div>
        <small>{title}</small>
        <button
          onClick={async () => {
            try {
              await window.botControl.copyText(code);
              setCopied(true);
              setError(false);
            } catch {
              setError(true);
            }
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? g.copied : g.copy}
        </button>
      </div>
      <pre data-testid={testId}>
        <code>{code}</code>
      </pre>
      {error && <p role="alert">{g.copyError}</p>}
    </div>
  );
}
