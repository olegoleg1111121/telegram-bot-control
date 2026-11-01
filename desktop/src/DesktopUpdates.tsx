import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, RefreshCw, RotateCw, TriangleAlert, X } from 'lucide-react';
import type { UpdateState } from './types';
import './updates.css';

export function useDesktopUpdates(enabled: boolean) {
  const [state, setState] = useState<UpdateState | null>(null);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const accept = (next: UpdateState) => {
      if (active) setState(next);
    };
    const unsubscribe = window.botControl.onUpdate?.(accept);
    void window.botControl
      .updateStatus?.()
      .then(accept)
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [enabled]);
  async function act(
    action: 'check' | 'download' | 'install',
    preferences?: { autoUpdate?: boolean; includePrereleases?: boolean },
  ) {
    try {
      const api = window.botControl;
      const next = await (preferences
        ? api.saveUpdatePreferences?.(preferences)
        : action === 'check'
          ? api.checkForUpdates?.()
          : action === 'download'
            ? api.downloadUpdate?.()
            : api.installUpdate?.());
      if (next) {
        setState(next);
        if (next.phase === 'error') setProblem(next.error);
      }
    } catch (error) {
      setProblem(String(error));
    }
  }
  return { state, act, problem, close: () => setProblem('') };
}

type Props = {
  state: UpdateState;
  language: 'ru' | 'en';
  act: ReturnType<typeof useDesktopUpdates>['act'];
};

function status(state: UpdateState, ru: boolean) {
  const phases = ru
    ? {
        idle: 'Проверим обновления автоматически',
        unavailable: 'Автоматическая установка недоступна для этой сборки',
        checking: 'Проверяем GitHub Releases…',
        current: 'У вас последняя версия',
        available: `Доступна версия ${state.nextVersion}`,
        downloading: `Загружаем ${state.nextVersion} — ${Math.round(state.progress)}%`,
        downloaded: `Версия ${state.nextVersion} готова к установке`,
        installing: 'Перезапускаем панель…',
        error: 'Не удалось получить обновление',
      }
    : {
        idle: 'Updates will be checked automatically',
        unavailable: 'Automatic installation is unavailable for this build',
        checking: 'Checking GitHub Releases…',
        current: 'You are up to date',
        available: `Version ${state.nextVersion} is available`,
        downloading: `Downloading ${state.nextVersion} — ${Math.round(state.progress)}%`,
        downloaded: `Version ${state.nextVersion} is ready to install`,
        installing: 'Restarting the dashboard…',
        error: 'Could not get the update',
      };
  return phases[state.phase];
}

export function UpdateBanner({ state, language, act, open }: Props & { open: () => void }) {
  if (!['available', 'downloading', 'downloaded', 'installing'].includes(state.phase)) return null;
  const ru = language === 'ru';
  return (
    <div className="update-banner" role="status" data-testid="update-banner">
      <Download size={17} />
      <span>{status(state, ru)}</span>
      <button className="text-button" onClick={open}>
        {ru ? 'Подробнее' : 'Details'}
      </button>
      {state.phase === 'downloaded' && (
        <button
          className="primary-button"
          data-testid="update-restart"
          onClick={() => void act('install')}
        >
          <RotateCw size={15} />
          {ru ? 'Установить и перезапустить' : 'Install and restart'}
        </button>
      )}
    </div>
  );
}

export default function DesktopUpdates({ state, language, act }: Props) {
  const ru = language === 'ru';
  const busy = ['checking', 'downloading', 'installing'].includes(state.phase);
  return (
    <section className="panel settings-panel desktop-updates" data-testid="desktop-updates">
      <div className="update-title">
        <Download size={17} />
        <h2>{ru ? 'Обновления приложения' : 'Application updates'}</h2>
        <code>v{state.version}</code>
      </div>
      <p className="update-description">
        {ru
          ? 'Новые версии поступают из официального репозитория GitHub. После загрузки нажмите «Установить и перезапустить». Боты продолжают работать; настройки и история сохраняются.'
          : 'New versions come from the official GitHub repository. After downloading, click Install and restart. Your bots keep running; settings and history are preserved.'}
      </p>
      {state.mode === 'automatic' ? (
        <div className="update-options">
          <label>
            <input
              type="checkbox"
              data-testid="update-auto"
              checked={state.autoUpdate}
              onChange={(e) => void act('check', { autoUpdate: e.target.checked })}
            />
            {ru
              ? 'Автоматически проверять и загружать обновления'
              : 'Automatically check for and download updates'}
          </label>
          <label>
            <input
              type="checkbox"
              disabled={busy || state.phase === 'downloaded'}
              checked={state.includePrereleases}
              onChange={(e) => void act('check', { includePrereleases: e.target.checked })}
            />
            {ru
              ? 'Получать также предварительные версии (сейчас проект выпускается в этом режиме)'
              : 'Include prereleases (the project currently uses prereleases)'}
          </label>
          <small>
            {ru
              ? 'Проверка при запуске и каждые 6 часов. Установка — по вашей кнопке.'
              : 'Checks on startup and every 6 hours. Installation starts when you click the button.'}
          </small>
        </div>
      ) : (
        <p className="update-description" data-testid="update-manual-hint">
          {ru
            ? state.mode === 'development'
              ? 'Вы запустили исходники. Автообновление работает в установленном Windows-приложении и Linux AppImage.'
              : 'Для Windows установите версию .exe из Releases один раз — затем обновления будут приходить сюда. Распакованная ZIP-версия обновляется вручную. На Linux запускайте файл AppImage.'
            : state.mode === 'development'
              ? 'You are running from source. Auto-updates work in the installed Windows app and Linux AppImage.'
              : 'On Windows, install the .exe from Releases once to receive future updates here. Extracted ZIP builds are updated manually. On Linux, run the AppImage file.'}
        </p>
      )}
      <div className="update-status" role="status" data-testid="update-status">
        {status(state, ru)}
      </div>
      {state.phase === 'downloading' && (
        <progress
          max={100}
          value={state.progress}
          aria-label={ru ? 'Загрузка обновления' : 'Update download'}
        />
      )}
      {state.phase === 'error' && (
        <details className="update-error">
          <summary>{ru ? 'Подробности ошибки' : 'Error details'}</summary>
          <pre>{state.error}</pre>
          <p>
            {ru
              ? 'Проверьте доступ к GitHub и повторите попытку. Текущая версия продолжает работать.'
              : 'Check access to GitHub and try again. Your current version keeps working.'}
          </p>
        </details>
      )}
      <div className="form-footer">
        <span>
          {state.checkedAt
            ? `${ru ? 'Проверено' : 'Last checked'}: ${new Date(state.checkedAt).toLocaleString(ru ? 'ru-RU' : 'en-US')}`
            : 'GitHub Releases'}
        </span>
        <div className="update-buttons">
          <button
            className="text-button"
            onClick={() => void window.botControl.openReleases?.().catch(() => {})}
          >
            <ExternalLink size={14} />
            GitHub Releases
          </button>
          {state.mode === 'automatic' && state.phase !== 'downloaded' && (
            <button
              className="secondary-button"
              disabled={busy}
              data-testid="update-check"
              onClick={() => void act('check')}
            >
              <RefreshCw size={15} className={busy ? 'spin' : ''} />
              {ru ? 'Проверить' : 'Check for updates'}
            </button>
          )}
          {state.phase === 'available' && (
            <button
              className="primary-button"
              data-testid="update-download"
              onClick={() => void act('download')}
            >
              <Download size={15} />
              {ru ? 'Скачать' : 'Download'}
            </button>
          )}
          {state.phase === 'downloaded' && (
            <button
              className="primary-button"
              data-testid="update-install"
              onClick={() => void act('install')}
            >
              <RotateCw size={15} />
              {ru ? 'Установить и перезапустить' : 'Install and restart'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export function UpdateProblem({
  details,
  language,
  close,
}: {
  details: string;
  language: 'ru' | 'en';
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const ru = language === 'ru';
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="connection-problem"
      aria-labelledby="update-problem-title"
      onCancel={close}
    >
      <div className="connection-problem-heading">
        <TriangleAlert size={22} />
        <h2 id="update-problem-title">
          {ru ? 'Не удалось обновить приложение' : 'Could not update the application'}
        </h2>
        <button className="icon-button" onClick={close} aria-label={ru ? 'Закрыть' : 'Close'}>
          <X size={18} />
        </button>
      </div>
      <p>
        {ru
          ? 'Проверьте подключение к интернету и доступ к GitHub. Можно продолжить работу и попробовать позже.'
          : 'Check your internet connection and access to GitHub. You can keep working and try again later.'}
      </p>
      <details>
        <summary>{ru ? 'Подробности' : 'Details'}</summary>
        <pre>{details}</pre>
      </details>
      <div className="connection-problem-actions">
        <button className="primary-button" onClick={close}>
          {ru ? 'Понятно' : 'Got it'}
        </button>
      </div>
    </dialog>
  );
}
