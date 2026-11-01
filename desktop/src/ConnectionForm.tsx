import { useEffect, useRef, useState } from 'react';
import { Cable, FolderOpen, Loader2, Search, ShieldCheck } from 'lucide-react';
import type { TranslationKey } from './i18n';
import type { Profile, PythonDiscovery } from './types';
import './connection.css';

export default function ConnectionForm({
  profile,
  change,
  connect,
  saving,
  t,
  directory,
}: {
  profile: Profile;
  change: (next: Profile) => void;
  connect: () => Promise<boolean>;
  saving: boolean;
  t: (key: TranslationKey) => string;
  directory?: string;
}) {
  const ru = t('connect') === 'Подключиться';
  const [discovery, setDiscovery] = useState<PythonDiscovery | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const current = useRef({ profile, change });
  current.current = { profile, change };
  async function discover(force = false) {
    const before = current.current.profile.python;
    setSearching(true);
    setSearchError('');
    try {
      const result = await window.botControl.discoverPython(force);
      setDiscovery(result);
      const state = current.current;
      if (
        state.profile.mode === 'local' &&
        state.profile.python === before &&
        /^(python(?:3)?(?:\.exe)?|py(?:\.exe)?)?$/i.test(before.trim()) &&
        result.recommended
      )
        state.change({ ...state.profile, python: result.recommended });
    } catch {
      setSearchError(
        ru
          ? 'Не удалось выполнить поиск. Выберите python.exe кнопкой рядом с полем.'
          : 'Search failed. Browse to python.exe using the button next to the field.',
      );
    } finally {
      setSearching(false);
    }
  }
  useEffect(() => {
    if (profile.mode === 'local') void discover();
  }, [profile.mode]);
  const selected = discovery?.candidates.find((item) => item.executable === profile.python);
  async function browse(kind: 'python' | 'directory') {
    try {
      const value = await window.botControl.choosePath(kind);
      if (value)
        current.current.change({
          ...current.current.profile,
          [kind === 'python' ? 'python' : 'dataDir']: value,
        });
    } catch {
      setSearchError(
        ru
          ? 'Не удалось открыть выбор файла или папки.'
          : 'Could not open the file or folder picker.',
      );
    }
  }
  return (
    <div className="connection-form">
      <div className="connection-tabs">
        {(['local', 'ssh'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={profile.mode === mode ? 'chosen' : ''}
            aria-pressed={profile.mode === mode}
            onClick={() =>
              change({
                ...profile,
                mode,
                python:
                  profile.mode === mode
                    ? profile.python
                    : mode === 'ssh' || !navigator.platform.startsWith('Win')
                      ? 'python3'
                      : 'python',
              })
            }
          >
            {t(mode === 'local' ? 'localMode' : 'sshMode')}
          </button>
        ))}
      </div>
      {profile.mode === 'local' && (
        <div className="python-discovery" data-testid="python-discovery">
          <button
            type="button"
            className="text-button"
            data-testid="find-python"
            disabled={searching || saving}
            onClick={() => void discover(true)}
          >
            {searching ? <Loader2 size={15} className="spin" /> : <Search size={15} />}{' '}
            {searching
              ? ru
                ? 'Ищем установленный Python…'
                : 'Finding installed Python…'
              : ru
                ? 'Найти Python на компьютере'
                : 'Find Python on this computer'}
          </button>
          {!!discovery?.candidates.length && (
            <label>
              {ru ? 'Найденные версии' : 'Discovered versions'}
              <select
                data-testid="python-candidates"
                value={selected?.executable || ''}
                onChange={(e) => change({ ...profile, python: e.target.value })}
              >
                <option value="" disabled>
                  {ru ? 'Выберите Python' : 'Choose Python'}
                </option>
                {discovery.candidates.map((item) => (
                  <option key={item.executable} value={item.executable} disabled={!item.compatible}>
                    Python {item.version} ·{' '}
                    {item.sdk
                      ? ru
                        ? 'библиотека установлена'
                        : 'SDK installed'
                      : ru
                        ? 'нужна библиотека'
                        : 'SDK missing'}{' '}
                    · {item.executable}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selected && (
            <p
              className={`python-detection-status ${selected.sdk && selected.compatible ? 'ready' : 'missing'}`}
              data-testid="python-status"
            >
              {selected.sdk && selected.compatible
                ? ru
                  ? 'Готов к подключению'
                  : 'Ready to connect'
                : ru
                  ? 'Python найден. При подключении покажем команду установки библиотеки.'
                  : 'Python found. Connect to get the SDK installation command.'}
            </p>
          )}
          {discovery && !discovery.candidates.length && !searching && (
            <p>
              {ru
                ? 'Python не найден автоматически. Выберите python.exe вручную кнопкой ниже.'
                : 'No Python discovered. Browse to python.exe below.'}
            </p>
          )}
          {searchError && <p role="alert">{searchError}</p>}
        </div>
      )}
      <div className="form-grid">
        <label className="wide">
          {t('pythonPath')}
          <div className="connection-python-line">
            <input
              data-testid="connection-python"
              value={profile.python}
              onChange={(e) => change({ ...profile, python: e.target.value })}
              spellCheck={false}
            />
            {profile.mode === 'local' && (
              <button
                type="button"
                data-testid="browse-python"
                aria-label={ru ? 'Выбрать python.exe' : 'Choose python.exe'}
                onClick={() => void browse('python')}
              >
                <FolderOpen size={15} />
                {ru ? 'Выбрать' : 'Browse'}
              </button>
            )}
          </div>
          <small>
            {profile.mode === 'local'
              ? ru
                ? 'Исполняемый файл Python. Найденная версия подставляется автоматически.'
                : 'The Python executable. A discovered runtime is filled in automatically.'
              : t('pythonHelp')}
          </small>
        </label>
        <label className="wide">
          {ru ? 'Папка статистики (необязательно)' : 'Statistics directory (optional)'}
          <div className="connection-python-line">
            <input
              data-testid="connection-data"
              placeholder={t('defaultDir')}
              value={profile.dataDir}
              onChange={(e) => change({ ...profile, dataDir: e.target.value })}
              spellCheck={false}
            />
            {profile.mode === 'local' && (
              <button
                type="button"
                data-testid="browse-data"
                aria-label={ru ? 'Выбрать папку статистики' : 'Choose statistics directory'}
                onClick={() => void browse('directory')}
              >
                <FolderOpen size={15} />
                {ru ? 'Выбрать' : 'Browse'}
              </button>
            )}
          </div>
          <small>
            {ru
              ? 'Оставьте пустой — программа использует стандартную папку. Путь к Python сюда вводить не нужно.'
              : 'Leave empty for the default directory. Do not enter the Python path here.'}
          </small>
        </label>
        {profile.mode === 'ssh' && (
          <>
            <label>
              {t('host')}
              <input
                value={profile.host}
                onChange={(e) => change({ ...profile, host: e.target.value })}
              />
            </label>
            <label>
              {t('user')}
              <input
                value={profile.user}
                onChange={(e) => change({ ...profile, user: e.target.value })}
              />
            </label>
            <label>
              {t('port')}
              <input
                type="number"
                min="1"
                max="65535"
                value={profile.port}
                onChange={(e) => change({ ...profile, port: Number(e.target.value) })}
              />
            </label>
            <label>
              {t('keyPath')}
              <input
                value={profile.keyPath}
                onChange={(e) => change({ ...profile, keyPath: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
      {profile.mode === 'ssh' && (
        <p className="form-note">
          <ShieldCheck size={14} />
          {t('keyHint')}
        </p>
      )}
      <div className="form-footer">
        <code>{directory || profile.dataDir}</code>
        <button
          data-testid="connection-test"
          type="button"
          className="primary-button"
          disabled={saving}
          onClick={() => void connect()}
        >
          {saving ? <Loader2 size={15} className="spin" /> : <Cable size={15} />}
          {t('connect')}
        </button>
      </div>
    </div>
  );
}
