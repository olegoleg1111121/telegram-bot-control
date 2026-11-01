import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Globe2, Loader2 } from 'lucide-react';
import type { Profile, WebState } from './types';

export default function WebSettings({
  language,
  profile,
  directory,
}: {
  language: 'ru' | 'en';
  profile: Profile | null;
  directory?: string;
}) {
  const [status, setStatus] = useState<WebState>({ running: false });
  const [port, setPort] = useState(() => {
    const value = Number(localStorage.getItem('web-listen-port'));
    return Number.isInteger(value) && value > 0 && value <= 65535 ? value : 8765;
  });
  const [host, setHost] = useState(
    localStorage.getItem('web-listen-host') === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const ru = language === 'ru';
  const acceptStatus = (value: WebState) => {
    setStatus(value);
    if (value.running && value.port && value.host) {
      setPort(value.port);
      setHost(value.host);
      localStorage.setItem('web-listen-port', String(value.port));
      localStorage.setItem('web-listen-host', value.host);
    }
  };
  useEffect(() => {
    let active = true;
    const load = () =>
      window.botControl
        .webStatus()
        .then((value) => {
          if (active) acceptStatus(value);
        })
        .catch(() => {});
    void load();
    const timer = setInterval(() => {
      if (!busy) void load();
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [busy, profile?.mode, profile?.host]);
  const remote = profile?.mode === 'ssh';
  const dataDirectory = profile?.dataDir || directory || '';
  const quotedDirectory =
    remote || !navigator.platform.startsWith('Win')
      ? "'" + dataDirectory.replaceAll("'", "'\\''") + "'"
      : "'" + dataDirectory.replaceAll("'", "''") + "'";
  const remoteLoopback = remote && status.host === '127.0.0.1';
  const url =
    remote && status.host === '0.0.0.0'
      ? `http://${profile.host.includes(':') ? '[' + profile.host + ']' : profile.host}:${status.port}`
      : status.url;
  return (
    <section className="panel settings-panel web-settings">
      <div className="panel-heading">
        <div>
          <h2>
            <Globe2 size={17} />
            {ru ? 'Веб-панель' : 'Web dashboard'}
          </h2>
          <p>
            {ru
              ? 'Дополнительный доступ через браузер. По умолчанию выключен.'
              : 'Optional browser access. Disabled by default.'}
          </p>
        </div>
        <span className={status.running ? 'web-running' : 'muted'}>
          {status.running ? (ru ? 'Включена' : 'Running') : ru ? 'Выключена' : 'Off'}
        </span>
      </div>
      <div className="form-grid">
        <label>
          {ru ? 'Порт' : 'Port'}
          <input
            data-testid="web-port"
            type="number"
            min="1"
            max="65535"
            disabled={status.running || busy}
            value={port}
            onChange={(event) => setPort(Number(event.target.value))}
          />
        </label>
        <label>
          {ru ? 'Доступ' : 'Access'}
          <select
            disabled={status.running || busy}
            value={host}
            onChange={(event) => setHost(event.target.value)}
          >
            <option value="127.0.0.1">
              {ru ? 'Только на этом устройстве' : 'This device only'}
            </option>
            <option value="0.0.0.0">
              {ru ? 'Другие устройства в сети' : 'Other devices on the network'}
            </option>
          </select>
        </label>
      </div>
      <p className="form-note">
        {ru
          ? 'Скрытие окна в трей сохраняет веб-доступ. Полный выход из настольной панели выключает этот веб-сервер. Для Termux используйте самостоятельную команду ниже.'
          : 'Hiding to the tray keeps web access running. Quitting the desktop stops this listener. Use the independent command below for Termux.'}
      </p>
      {host === '0.0.0.0' && (
        <p className="form-note">
          {ru
            ? 'Доступ по HTTP защищён ключом входа. Для доступа через интернет используйте SSH-туннель или HTTPS-прокси.'
            : 'HTTP access requires an access key. Use an SSH tunnel or HTTPS proxy for Internet access.'}
        </p>
      )}
      {status.running && (
        <div className="web-status">
          <code>{url}</code>
          {remoteLoopback && (
            <small>
              {ru
                ? 'Адрес относится к серверу; для локального браузера нужен SSH-туннель.'
                : 'This is the server loopback address; a local browser needs an SSH tunnel.'}
            </small>
          )}
          <label>
            {ru ? 'Ключ веб-доступа' : 'Web access key'}
            <div>
              <input type="password" readOnly value={status.key || ''} />
              <button
                aria-label={ru ? 'Копировать ключ' : 'Copy key'}
                onClick={async () => {
                  try {
                    await window.botControl.copyText(status.key || '');
                    setCopied(true);
                  } catch {
                    setError(ru ? 'Не удалось скопировать ключ' : 'Could not copy the key');
                  }
                }}
              >
                <Copy size={16} />
                {copied ? (ru ? 'Скопировано' : 'Copied') : ''}
              </button>
            </div>
          </label>
          {!remoteLoopback && (
            <button className="text-button" onClick={() => window.botControl.openWebPanel()}>
              <ExternalLink size={14} />
              {ru ? 'Открыть в браузере' : 'Open in browser'}
            </button>
          )}
        </div>
      )}
      <div className="form-footer">
        <code>
          tgbots web --port {port}
          {dataDirectory ? ' --data-dir ' + quotedDirectory : ''}
          {host === '0.0.0.0' ? ' --host 0.0.0.0' : ''}
        </code>
        <button
          data-testid="web-toggle"
          className="primary-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            setCopied(false);
            try {
              acceptStatus(
                status.running
                  ? await window.botControl.stopWeb()
                  : await window.botControl.startWeb({ host, port }),
              );
            } catch {
              setError(
                ru
                  ? 'Не удалось запустить: проверьте порт и наличие файлов веб-панели.'
                  : 'Could not start: check the port and web assets.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 size={14} className="spin" />}
          {status.running ? (ru ? 'Выключить' : 'Stop') : ru ? 'Включить' : 'Start'}
        </button>
      </div>
      {error && (
        <p className="web-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
