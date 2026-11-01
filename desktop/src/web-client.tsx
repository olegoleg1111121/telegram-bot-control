import { useEffect, useState } from 'react';
import { Bot, LogIn, ShieldCheck } from 'lucide-react';
import App from './App';
import type { Profile } from './types';

let unauthorized: () => void = () => {};
async function api(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Bot-Control': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') unauthorized();
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}
const rpc = async (method: string, params = {}) =>
  (await api('/api/rpc', { method, params })).result;
function webClient(version: string): Window['botControl'] {
  const unsupported = async () => {
    throw new Error('Manage the web listener from the server or desktop settings.');
  };
  return {
    desktopInfo: async () => ({
      version,
      runtime: 'web',
      autoGuide: true,
      trayAvailable: false,
      guideSeenVersion: Number(localStorage.getItem('web-guide-seen') || 0),
      language: localStorage.getItem('web-language') === 'en' ? 'en' : 'ru',
    }),
    saveDesktopPreferences: async (next) => {
      if (next.guideSeenVersion !== undefined)
        localStorage.setItem('web-guide-seen', String(next.guideSeenVersion));
      if (next.language) localStorage.setItem('web-language', next.language);
    },
    copyText: async (text) => {
      if (navigator.clipboard) return navigator.clipboard.writeText(text);
      const input = document.createElement('textarea');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      if (!copied) throw new Error('Select text manually to copy.');
    },
    onOpenGuide: () => () => {},
    snapshot: (params) => rpc('snapshot', params),
    logs: (params) => rpc('logs', params),
    inspectProject: (directory, entrypoint) => rpc('inspect_project', { directory, entrypoint }),
    registerProject: (params) => rpc('register_project', params),
    connection: async () => {
      const hello = await rpc('hello');
      return {
        mode: 'local',
        python: hello.python,
        dataDir: hello.data_dir,
        host: '',
        user: '',
        port: 22,
        keyPath: '',
      } as Profile;
    },
    connect: unsupported,
    previewRetention: (settings) => rpc('preview_retention', { settings }),
    saveSettings: (settings, confirmCleanup) =>
      rpc('save_settings', { settings, confirm_cleanup: confirmCleanup }),
    launchProfile: (botId) => rpc('launch_profile', { bot_id: botId }),
    saveLaunchProfile: (botId, profile) => rpc('save_launch_profile', { bot_id: botId, profile }),
    controlBot: (botId, action, force = false) =>
      rpc('control_bot', { bot_id: botId, action, force }),
    webStatus: unsupported,
    startWeb: unsupported,
    stopWeb: unsupported,
    openWebPanel: unsupported,
    logout: async () => {
      await api('/api/logout', {});
      unauthorized();
    },
  };
}

export default function WebRoot() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState(
    localStorage.getItem('web-language') === 'en' ? 'en' : 'ru',
  );
  const [version, setVersion] = useState('');
  useEffect(() => {
    let active = true;
    unauthorized = () => setAuthenticated(false);
    api('/api/session')
      .then((session) => {
        if (!active) return;
        setVersion(session.version);
        window.botControl = webClient(session.version);
        setAuthenticated(session.authenticated);
      })
      .catch(() =>
        setError(
          language === 'ru'
            ? 'Сервер недоступен. Обновите страницу.'
            : 'Server unavailable. Reload this page.',
        ),
      )
      .finally(() => setLoaded(true));
    return () => {
      active = false;
      unauthorized = () => {};
    };
  }, []);
  if (authenticated) return <App />;
  const ru = language === 'ru';
  return (
    <div className="web-login">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api('/api/login', { key });
            setKey('');
            window.botControl = webClient(version);
            setAuthenticated(true);
          } catch {
            setError(
              ru
                ? 'Ключ не подошёл или превышено число попыток. Проверьте ключ и попробуйте позже.'
                : 'Access key invalid or too many attempts. Check the key and try again later.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="web-login-logo">
          <Bot size={29} />
        </div>
        <span>TELEGRAM BOT CONTROL · {version}</span>
        <h1>{ru ? 'Веб-панель ботов' : 'Bot web dashboard'}</h1>
        <p>
          {ru
            ? 'Введите ключ доступа из терминала сервера или настроек настольного приложения.'
            : 'Enter the access key shown in the server terminal or desktop web settings.'}
        </p>
        <label>
          {ru ? 'Ключ доступа' : 'Access key'}
          <input
            data-testid="web-key"
            type="password"
            autoComplete="current-password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            required
            autoFocus
          />
        </label>
        {error && (
          <p className="web-error" role="alert">
            {error}
          </p>
        )}
        <button
          data-testid="web-login"
          className="primary-button"
          type="submit"
          disabled={!loaded || busy}
        >
          <LogIn size={16} />
          {busy ? '…' : ru ? 'Войти' : 'Sign in'}
        </button>
        <div className="web-login-footer">
          <ShieldCheck size={14} />
          <small>
            {ru
              ? 'Ключ веб-доступа — отдельный от токена Telegram.'
              : 'The web access key is separate from the Telegram token.'}
          </small>
        </div>
        <button
          type="button"
          className="web-language"
          onClick={() => {
            const next = ru ? 'en' : 'ru';
            setLanguage(next);
            localStorage.setItem('web-language', next);
          }}
        >
          {ru ? 'English' : 'Русский'}
        </button>
      </form>
    </div>
  );
}
