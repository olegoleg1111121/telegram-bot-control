import { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  Loader2,
  Play,
  RotateCw,
  Settings2,
  Square,
  Terminal,
  TriangleAlert,
} from 'lucide-react';
import type { Bot, LaunchProfile, RestartPolicy } from './types';
import { processErrors, processText } from './process-i18n';

export default function ProcessPanel({
  bot,
  language,
  changed,
}: {
  bot: Bot;
  language: 'ru' | 'en';
  changed: () => void;
}) {
  const text = processText[language];
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [detected, setDetected] = useState(false);
  const [command, setCommand] = useState('[]');
  const [pre, setPre] = useState('[]');
  const [environment, setEnvironment] = useState('{}');
  const [cwd, setCwd] = useState(bot.directory);
  const [envFile, setEnvFile] = useState('');
  const [required, setRequired] = useState('');
  const [restart, setRestart] = useState<RestartPolicy>({
    enabled: false,
    max_restarts: 5,
    delay_seconds: 2,
    max_delay_seconds: 60,
    reset_after_seconds: 300,
  });
  const ru = language === 'ru';
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [force, setForce] = useState<'stop' | 'restart' | null>(null);
  const explain = (value: unknown) => {
    const code = String(value).replace(/^.*Error: /, '');
    const [key, detail] = code.split(':');
    return (processErrors[language][key] || code) + (detail ? `: ${detail}` : '');
  };
  useEffect(() => {
    let active = true;
    window.botControl
      .launchProfile(bot.bot_id)
      .then((info) => {
        if (!active) return;
        const profile = info.profile;
        setConfigured(info.configured);
        setDetected(Boolean(profile));
        if (profile) {
          setCommand(JSON.stringify(profile.command, null, 2));
          setPre(JSON.stringify(profile.pre_start, null, 2));
          setEnvironment(JSON.stringify(profile.environment, null, 2));
          setCwd(profile.cwd);
          setEnvFile(profile.env_file);
          setRequired(profile.required_env.join(', '));
          if (profile.restart) setRestart(profile.restart);
        } else setCommand(JSON.stringify([bot.interpreter, bot.entrypoint], null, 2));
      })
      .catch((error) => {
        if (active) setMessage(explain(error));
      });
    return () => {
      active = false;
    };
  }, [bot.bot_id]);
  async function save() {
    let profile: LaunchProfile;
    try {
      profile = {
        command: JSON.parse(command),
        pre_start: JSON.parse(pre),
        environment: JSON.parse(environment),
        cwd,
        env_file: envFile,
        required_env: required
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        restart,
      };
    } catch {
      setMessage(text.badJson);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await window.botControl.saveLaunchProfile(bot.bot_id, profile);
      setConfigured(true);
      setDetected(true);
      setMessage(text.saved);
      changed();
    } catch (error) {
      setMessage(explain(error));
    } finally {
      setBusy(false);
    }
  }
  async function act(action: 'start' | 'stop' | 'restart', forced = false) {
    setBusy(true);
    setMessage('');
    try {
      const result = await window.botControl.controlBot(bot.bot_id, action, forced);
      if (result.status === 'needs_force') setForce(action === 'restart' ? 'restart' : 'stop');
      else {
        setForce(null);
        setMessage(result.status === 'stopped' ? text.stopped : text.accepted);
      }
      changed();
    } catch (error) {
      setMessage(explain(error));
      changed();
    } finally {
      setBusy(false);
    }
  }
  const control = bot.control;
  const runStatus = control?.run?.status as keyof typeof text | undefined;
  return (
    <section className="panel process-panel" data-testid="process-panel">
      <div className="process-toolbar">
        <div>
          <h2>
            <Terminal size={17} />
            {text.title}
          </h2>
          <p>{configured ? text.configured : detected ? text.detected : text.missing}</p>
        </div>
        <div className="process-buttons">
          <button
            data-testid="bot-start"
            disabled={busy || !control?.can_start}
            onClick={() => act('start')}
          >
            <Play size={14} />
            {text.start}
          </button>
          <button
            data-testid="bot-stop"
            disabled={busy || !control?.can_stop}
            onClick={() => act('stop')}
          >
            <Square size={13} />
            {text.stop}
          </button>
          <button
            data-testid="bot-restart"
            disabled={busy || !control?.can_stop || !control.profile_available}
            onClick={() => act('restart')}
          >
            <RotateCw size={14} />
            {text.restart}
          </button>
          <button
            className="configure-launch"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            <Settings2 size={14} />
            {text.configure}
            <ChevronDown size={12} />
          </button>
        </div>
      </div>
      {control?.reason && <p className="process-note">{explain(control.reason)}</p>}
      {control?.run && (
        <div className={`launch-state ${control.run.status === 'failed' ? 'launch-failed' : ''}`}>
          <span>{text.latest}:</span>
          <strong>{(runStatus && text[runStatus]) || control.run.status}</strong>
          {!!control.run.restarts && (
            <span>
              {ru ? 'Автоперезапусков' : 'Automatic restarts'}: {control.run.restarts}
            </span>
          )}
          {control.run.next_retry_at && (
            <span>
              {ru ? 'Следующая попытка' : 'Next attempt'}:{' '}
              {new Date(control.run.next_retry_at * 1000).toLocaleTimeString(
                ru ? 'ru-RU' : 'en-GB',
              )}
            </span>
          )}
          {control.run.error && (
            <span>
              {explain(control.run.error)}
              {control.run.exit_code !== null ? ` (${control.run.exit_code})` : ''}
            </span>
          )}
        </div>
      )}
      {control?.run && (control.run.diagnostics || control.run.status === 'failed') && (
        <details
          className="launch-diagnostics"
          data-testid="launch-diagnostics"
          open={control.run.status === 'failed' || undefined}
        >
          <summary>{ru ? 'Вывод команды запуска' : 'Launch command output'}</summary>
          {control.run.diagnostics ? (
            <>
              <pre data-testid="launch-output">{control.run.diagnostics}</pre>
              <button
                onClick={() =>
                  void window.botControl
                    .copyText(control.run!.diagnostics!)
                    .catch((error) => setMessage(explain(error)))
                }
              >
                {ru ? 'Копировать подробности' : 'Copy details'}
              </button>
            </>
          ) : (
            <p>
              {ru
                ? 'Для этого старого запуска вывод не сохранялся. Повторите запуск, чтобы увидеть подробную причину.'
                : 'Output was not retained for this older launch. Start again to see the detailed cause.'}
            </p>
          )}
        </details>
      )}
      {busy && (
        <p className="process-note">
          <Loader2 size={13} className="spin" />
          {text.working}
        </p>
      )}
      {message && (
        <div className="process-message" role="status">
          {message}
        </div>
      )}
      {open && (
        <div className="launch-editor">
          <div className="form-grid">
            <label className="wide">
              {text.command}
              <textarea
                data-testid="launch-command"
                rows={5}
                value={command}
                onChange={(event) => setCommand(event.target.value)}
              />
              <small>{text.commandHint}</small>
            </label>
            <label className="wide">
              {text.cwd}
              <input value={cwd} onChange={(event) => setCwd(event.target.value)} />
            </label>
            <label className="wide">
              {text.pre}
              <textarea rows={4} value={pre} onChange={(event) => setPre(event.target.value)} />
              <small>{text.preHint}</small>
            </label>
            <label className="wide">
              {text.envFile}
              <input value={envFile} onChange={(event) => setEnvFile(event.target.value)} />
              <small>{text.envHint}</small>
            </label>
            <label>
              {text.environment}
              <textarea
                rows={4}
                value={environment}
                onChange={(event) => setEnvironment(event.target.value)}
              />
              <small>{text.environmentHint}</small>
            </label>
            <label>
              {text.required}
              <input
                data-testid="launch-required-env"
                value={required}
                onChange={(event) => setRequired(event.target.value)}
              />
              <small>{text.requiredHint}</small>
            </label>
          </div>
          <div className="restart-policy">
            <label>
              <input
                data-testid="restart-enabled"
                type="checkbox"
                checked={restart.enabled}
                onChange={(e) => setRestart({ ...restart, enabled: e.target.checked })}
              />
              {ru ? 'Перезапускать при завершении с ошибкой' : 'Restart after an error exit'}
            </label>
            <p>
              {ru
                ? 'Применяется со следующего запуска из панели. При коде 0 и после ручной остановки бот не перезапускается. Подготовительные команды повторяются при каждой попытке.'
                : 'Applies on the next start from the dashboard. Exit code 0 and manual stops do not trigger a restart. Preparation commands repeat on each attempt.'}
            </p>
            {restart.enabled && (
              <div className="form-grid">
                {(
                  [
                    ['max_restarts', ru ? 'Лимит повторных попыток' : 'Retry limit', 1, 50],
                    ['delay_seconds', ru ? 'Начальная задержка, с' : 'Initial delay, s', 1, 300],
                    [
                      'max_delay_seconds',
                      ru ? 'Максимальная задержка, с' : 'Maximum delay, s',
                      restart.delay_seconds,
                      3600,
                    ],
                    [
                      'reset_after_seconds',
                      ru
                        ? 'Сброс лимита после стабильной работы, с'
                        : 'Reset limit after stable operation, s',
                      30,
                      86400,
                    ],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min={min}
                      max={max}
                      value={restart[key]}
                      onChange={(e) => setRestart({ ...restart, [key]: Number(e.target.value) })}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="form-footer">
            <span>{text.title}</span>
            <button className="primary-button" disabled={busy} onClick={save}>
              <Check size={15} />
              {text.save}
            </button>
          </div>
        </div>
      )}
      {force && (
        <div className="modal-backdrop">
          <div className="confirm-modal" role="dialog" aria-modal="true">
            <div className="modal-icon">
              <TriangleAlert size={25} />
            </div>
            <h2>{text.forceTitle}</h2>
            <p>{text.forceHint}</p>
            <div className="modal-actions">
              <button onClick={() => setForce(null)}>{text.cancel}</button>
              <button className="danger-button" onClick={() => act(force, true)}>
                {force === 'restart' ? text.forceRestart : text.forceStop}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
