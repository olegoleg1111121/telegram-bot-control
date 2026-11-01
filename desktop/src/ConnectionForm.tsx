import { Cable, Loader2, ShieldCheck } from 'lucide-react';
import type { TranslationKey } from './i18n';
import type { Profile } from './types';

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
      <div className="form-grid">
        <label className="wide">
          {t('pythonPath')}
          <input
            data-testid="connection-python"
            value={profile.python}
            onChange={(e) => change({ ...profile, python: e.target.value })}
            spellCheck={false}
          />
          <small>{t('pythonHelp')}</small>
          <code>python -c "import sys; print(sys.executable)"</code>
        </label>
        <label className="wide">
          {t('dataDir')}
          <input
            data-testid="connection-data"
            placeholder={t('defaultDir')}
            value={profile.dataDir}
            onChange={(e) => change({ ...profile, dataDir: e.target.value })}
            spellCheck={false}
          />
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
