import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot as BotIcon,
  Cable,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Globe2,
  LayoutDashboard,
  ListFilter,
  Loader2,
  MessageSquare,
  MousePointer2,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Terminal,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { en, ru, type TranslationKey } from './i18n';
import type { Bot, DesktopInfo, ErrorGroup, Profile, Settings, Snapshot } from './types';
import ProcessPanel from './ProcessPanel';
import ConnectionForm from './ConnectionForm';
import Onboarding from './Onboarding';
import WebSettings from './WebSettings';
import BotDiagnostics from './BotDiagnostics';
import ProjectWizard from './ProjectWizard';
import ActionAnalytics from './ActionAnalytics';
import AiIntegration from './AiIntegration';
import ConnectionProblem from './ConnectionProblem';
import type { ConnectionProblem as Problem } from './types';
import { isoDay, periodWindow } from './time';

type Lang = 'ru' | 'en';
type Tab = 'overview' | 'errors' | 'actions' | 'integration' | 'settings';
function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [language, setLanguage] = useState<Lang>(
    stored<string>('language', 'ru') === 'en' ? 'en' : 'ru',
  );
  const t = useCallback((key: TranslationKey) => (language === 'ru' ? ru : en)[key], [language]);
  const [tab, setTab] = useState<Tab>('overview');
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [visible, setVisible] = useState(60);
  const [range, setRange] = useState('7');
  const [zone, setZone] = useState<string>(stored('timezone', 'local'));
  const timezone = zone === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : zone;
  const [customFrom, setCustomFrom] = useState(
    isoDay(new Date(Date.now() - 7 * 86400000), timezone),
  );
  const [customTo, setCustomTo] = useState(isoDay(new Date(), timezone));
  const [refresh, setRefresh] = useState<number>(stored('refresh', 3));
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failure, setFailure] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorSearch, setErrorSearch] = useState('');
  const [errorOffset, setErrorOffset] = useState(0);
  const [expanded, setExpanded] = useState('');
  const [draft, setDraft] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notice, setNotice] = useState('');
  const [connectionProblem, setConnectionProblem] = useState<Problem | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{
    settings: Settings;
    counts: Record<string, number>;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const [desktopInfo, setDesktopInfo] = useState<DesktopInfo | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStart, setGuideStart] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resourceMinutes, setResourceMinutes] = useState(60);
  const isWeb = desktopInfo?.runtime === 'web';
  const transportLabel = isWeb ? t('webTransport') : t('transport');
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const format = (n: number) => new Intl.NumberFormat(locale).format(n);
  const date = (n: number, timeOnly = false) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      ...(timeOnly
        ? ({ hour: '2-digit', minute: '2-digit' } as const)
        : ({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } as const)),
    }).format(n * 1000);
  useEffect(() => {
    localStorage.setItem('language', JSON.stringify(language));
    document.documentElement.lang = language;
    if (desktopInfo) void window.botControl.saveDesktopPreferences({ language }).catch(() => {});
  }, [language, !!desktopInfo]);
  useEffect(() => {
    let active = true;
    window.botControl
      .desktopInfo()
      .then((info) => {
        if (!active) return;
        if (info.language) setLanguage(info.language);
        setDesktopInfo(info);
        setGuideOpen(info.autoGuide && info.guideSeenVersion < 1);
      })
      .catch((error) => setFailure(String(error)));
    const unsubscribe = window.botControl.onOpenGuide(() => {
      setSelectedId('');
      setGuideStart(0);
      setGuideOpen(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  async function closeGuide() {
    await window.botControl.saveDesktopPreferences({ guideSeenVersion: 1, language });
    setGuideOpen(false);
  }
  function addBot() {
    if (snapshot && !failure) setWizardOpen(true);
    else {
      setGuideStart(1);
      setGuideOpen(true);
    }
  }
  useEffect(() => {
    localStorage.setItem('timezone', JSON.stringify(zone));
  }, [zone]);
  useEffect(() => {
    localStorage.setItem('refresh', JSON.stringify(refresh));
  }, [refresh]);
  useEffect(() => {
    window.botControl
      .connection()
      .then(setProfile)
      .catch((e) => setFailure(String(e)));
  }, []);
  useEffect(() => {
    setErrorOffset(0);
  }, [selectedId, errorSearch, range, customFrom, customTo]);
  useEffect(() => {
    let active = true;
    let busy = false;
    setLoading(true);
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const now = Date.now() / 1000;
        const { since, until } = periodWindow(range, customFrom, customTo, timezone);
        const data = await window.botControl.snapshot({
          since,
          until,
          bot_id: selectedId,
          error_offset: errorOffset,
          error_query: errorSearch,
          resource_since: now - resourceMinutes * 60,
        });
        if (active) {
          setSnapshot(data);
          setDraft((current) => current ?? data.settings);
          setFailure('');
        }
      } catch (error) {
        if (active) setFailure(String(error).replace(/^Error: /, ''));
      } finally {
        busy = false;
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(load, Math.max(2, refresh) * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [
    selectedId,
    range,
    timezone,
    customFrom,
    customTo,
    refresh,
    errorOffset,
    errorSearch,
    revision,
    resourceMinutes,
  ]);

  const bots = snapshot?.bots ?? [];
  const selected = bots.find((bot) => bot.bot_id === selectedId);
  const filtered = bots.filter(
    (bot) =>
      `${bot.name} ${bot.username} ${bot.bot_id}`.toLowerCase().includes(search.toLowerCase()) &&
      (!stateFilter || bot.state === stateFilter),
  );
  const online = bots.filter((bot) => bot.state === 'running').length;
  const metrics = selected ? selected.metrics : snapshot?.totals;
  const changeTab = (next: Tab) => {
    setTab(next);
    setNotice('');
    if (next === 'settings' && snapshot) setDraft(snapshot.settings);
  };
  const chooseBot = (id: string) => {
    setSelectedId(id);
    setTab('overview');
    setExpanded('');
  };
  const retry = () => {
    setLoading(true);
    setRevision((x) => x + 1);
  };
  const fields: [keyof Settings, TranslationKey][] = [
    ['statistics_days', 'statisticsDays'],
    ['errors_days', 'errorsDays'],
    ['diagnostics_days', 'diagnosticsDays'],
    ['logs_days', 'logsDays'],
    ['resources_days', 'resourcesDays'],
  ];
  async function applySettings(settings: Settings, confirmed: boolean) {
    setSaving(true);
    setNotice('');
    try {
      await window.botControl.saveSettings(settings, confirmed);
      setConfirm(null);
      setNotice(t('saved'));
      setRevision((x) => x + 1);
    } catch (error) {
      setNotice(String(error));
    } finally {
      setSaving(false);
    }
  }
  async function save() {
    if (!draft || !snapshot) return;
    const reducing = fields.some(
      ([key]) =>
        draft[key] !== null &&
        (snapshot.settings[key] === null || draft[key]! < snapshot.settings[key]!),
    );
    if (reducing) {
      try {
        setConfirm({ settings: draft, counts: await window.botControl.previewRetention(draft) });
      } catch (error) {
        setNotice(String(error));
      }
    } else await applySettings(draft, false);
  }
  async function connect() {
    if (!profile) return false;
    setSaving(true);
    setNotice('');
    try {
      const result = await window.botControl.connect(profile);
      if (!result.ok) {
        setConnectionProblem(result.error);
        return false;
      }
      setProfile(result.profile);
      setNotice(t('saved'));
      retry();
      return true;
    } catch (error) {
      setConnectionProblem({ code: 'bridge_failed', details: String(error) });
      return false;
    } finally {
      setSaving(false);
    }
  }
  const langButton = (
    <button
      className="icon-button language-button"
      aria-label={t('language')}
      onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}
    >
      <Globe2 size={15} />
      {language.toUpperCase()}
    </button>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <BotIcon size={23} />
          </div>
          <div>
            bot<span>control</span>
            <small>TELEGRAM WORKSPACE</small>
          </div>
          <span className="version">{desktopInfo?.version || '…'}</span>
        </div>
        <div className="server-switch">
          <div className="server-icon">
            <Server size={17} />
          </div>
          <div>
            <strong>{snapshot?.meta.hostname || t('workspace')}</strong>
            <small>
              {isWeb ? t('webTransport') : profile?.mode === 'ssh' ? t('remote') : t('local')}
            </small>
          </div>
          <ShieldCheck size={16} className="muted" />
        </div>
        <div className="section-label">{t('monitoring')}</div>
        <nav className="primary-nav">
          <button
            className={tab === 'overview' && !selectedId ? 'active' : ''}
            onClick={() => {
              chooseBot('');
            }}
          >
            <LayoutDashboard size={17} />
            {t('overview')}
          </button>
          <button
            data-testid="nav-errors"
            className={tab === 'errors' ? 'active' : ''}
            onClick={() => changeTab('errors')}
          >
            <TriangleAlert size={17} />
            {t('errors')}
            {!!metrics?.errors && <span className="nav-count">{format(metrics.errors)}</span>}
          </button>
          <button
            data-testid="nav-actions"
            className={tab === 'actions' ? 'active' : ''}
            onClick={() => changeTab('actions')}
          >
            <MousePointer2 size={17} />
            {t('actions')}
          </button>
        </nav>
        <div className="section-label bot-label">
          {t('bots')}
          <span>{bots.length}</span>
        </div>
        <button className="add-bot-button" data-testid="add-bot" onClick={addBot}>
          <Plus size={15} />
          {t('connectBot')}
        </button>
        <div className="search-box">
          <Search size={14} />
          <input
            aria-label={t('search')}
            placeholder={t('search')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisible(60);
            }}
          />
        </div>
        <div className="filter-box">
          <ListFilter size={13} />
          <select
            aria-label={t('status')}
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="">{t('allStates')}</option>
            {(['running', 'stopped', 'disconnected', 'waiting'] as const).map((state) => (
              <option key={state} value={state}>
                {t(state)}
              </option>
            ))}
          </select>
          <ChevronDown size={12} />
        </div>
        <div className="bot-list">
          {filtered.slice(0, visible).map((bot, index) => (
            <button
              key={bot.bot_id}
              data-testid="bot-item"
              data-bot-id={bot.bot_id}
              className={`bot-item ${selectedId === bot.bot_id ? 'selected' : ''}`}
              onClick={() => chooseBot(bot.bot_id)}
            >
              <div className={`bot-avatar color-${index % 4}`}>
                <BotIcon size={17} />
              </div>
              <div className="bot-list-copy">
                <strong>{bot.name}</strong>
                <span>@{bot.username || bot.bot_id}</span>
              </div>
              <span title={t(bot.state)} className={`state-dot ${bot.state}`} />
            </button>
          ))}
          {!filtered.length && (
            <p className="sidebar-empty">{bots.length ? t('noResults') : t('noBots')}</p>
          )}
          {filtered.length > visible && (
            <button className="text-button" onClick={() => setVisible((n) => n + 60)}>
              {t('showMore')}
            </button>
          )}
        </div>
        <div className="sidebar-bottom">
          <button
            data-testid="nav-integration"
            className={tab === 'integration' ? 'active' : ''}
            onClick={() => changeTab('integration')}
          >
            <Terminal size={17} />
            {t('integration')}
          </button>
          <button
            data-testid="open-guide"
            onClick={() => {
              setSelectedId('');
              setGuideStart(0);
              setGuideOpen(true);
            }}
          >
            <CircleHelp size={17} />
            {t('help')}
          </button>
          <button
            data-testid="nav-settings"
            className={tab === 'settings' ? 'active' : ''}
            onClick={() => changeTab('settings')}
          >
            <Settings2 size={17} />
            {t('settings')}
          </button>
          <div className="transport">
            <Cable size={14} />
            {transportLabel}
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <Server size={14} />
            <span>{snapshot?.meta.hostname || 'Bot Control'}</span>
            <ChevronRight size={13} />
            <strong>{selected && tab === 'overview' ? selected.name : t(tab)}</strong>
          </div>
          <div className="topbar-actions">
            {isWeb && (
              <button
                className="text-button"
                data-testid="web-logout"
                onClick={() => void window.botControl.logout?.()}
              >
                {language === 'ru' ? 'Выйти' : 'Sign out'}
              </button>
            )}
            <span className={`live-indicator ${failure ? 'offline' : ''}`}>
              <i />
              {failure ? t('disconnected') : loading ? t('connecting') : t('live')}
            </span>
            {langButton}
            <button className="icon-button" onClick={retry} aria-label={t('reconnect')}>
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </header>
        <main className="main-content">
          {failure && (
            <div className="connection-error" role="alert">
              <TriangleAlert size={20} />
              <div>
                <strong>{t('connectionLost')}</strong>
                <p>{t('connectionHelp')}</p>
                <code>{failure}</code>
              </div>
              <button onClick={() => changeTab('settings')}>{t('connection')}</button>
            </div>
          )}
          {!!snapshot?.meta.warnings.length && (
            <div className="warning">
              <TriangleAlert size={16} />
              {t('warning')}
              <code>{snapshot.meta.warnings.join(', ')}</code>
            </div>
          )}
          {tab === 'integration' ? (
            <AiIntegration
              language={language}
              bots={bots}
              dataDir={snapshot?.meta.data_dir || profile?.dataDir}
            />
          ) : tab === 'settings' ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">BOT CONTROL / PREFERENCES</div>
                  <h1>{t('settings')}</h1>
                </div>
                <Settings2 size={28} className="heading-icon" />
              </div>
              <section className="panel settings-panel">
                <PanelTitle icon={<Globe2 size={17} />} title={t('appearance')} />
                <div className="form-grid">
                  <label>
                    {t('language')}
                    <select
                      data-testid="language-select"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as Lang)}
                    >
                      <option value="ru">Русский</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                  <label>
                    {t('refresh')}
                    <select value={refresh} onChange={(e) => setRefresh(Number(e.target.value))}>
                      {[2, 3, 5, 10, 30, 60].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label className="wide">
                    {t('timezone')}
                    <select value={zone} onChange={(e) => setZone(e.target.value)}>
                      <option value="local">{t('localTimezone')}</option>
                      <option value="UTC">UTC</option>
                      {(Intl as unknown as { supportedValuesOf(key: string): string[] })
                        .supportedValuesOf('timeZone')
                        .map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                    </select>
                  </label>
                </div>
              </section>
              <section className="panel settings-panel">
                <PanelTitle
                  icon={<Database size={17} />}
                  title={t('retention')}
                  hint={t('retentionHint')}
                />
                {draft && (
                  <>
                    <div className="form-grid">
                      {fields.map(([key, label]) => (
                        <label key={key}>
                          {t(label)}
                          <select
                            value={draft[key] ?? 'none'}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                [key]: e.target.value === 'none' ? null : Number(e.target.value),
                              })
                            }
                          >
                            {[1, 7, 30, 90, 180, 365, 730].map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                            {draft[key] !== null &&
                              ![1, 7, 30, 90, 180, 365, 730].includes(draft[key]!) && (
                                <option value={draft[key]!}>{draft[key]}</option>
                              )}
                            <option value="none">{t('unlimited')}</option>
                          </select>
                        </label>
                      ))}
                      <label>
                        {t('heartbeat')}
                        <input
                          type="number"
                          min="1"
                          max="28800"
                          value={draft.heartbeat_seconds}
                          onChange={(e) =>
                            setDraft({ ...draft, heartbeat_seconds: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        {t('resourceInterval')}
                        <input
                          type="number"
                          min="1"
                          max="86400"
                          value={draft.resource_interval_seconds}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              resource_interval_seconds: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        {t('timeout')}
                        <input
                          type="number"
                          min={draft.heartbeat_seconds * 3}
                          max="86400"
                          value={draft.connection_timeout_seconds}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              connection_timeout_seconds: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    {fields.some(([key]) => draft[key] === null) && (
                      <p className="form-note">
                        <CircleHelp size={14} />
                        {t('unlimitedHint')}
                      </p>
                    )}
                    <div className="form-footer">
                      <span>
                        <Database size={14} />
                        {t('size')}: {((snapshot?.meta.db_bytes ?? 0) / 1048576).toFixed(2)} MB
                      </span>
                      <button className="primary-button" disabled={saving} onClick={save}>
                        <Check size={15} />
                        {t('save')}
                      </button>
                    </div>
                  </>
                )}
              </section>
              <section className="panel settings-panel">
                <PanelTitle
                  icon={<Cable size={17} />}
                  title={t('connection')}
                  hint={isWeb ? t('webTransport') : t('connectionHint')}
                />
                {profile && !isWeb && (
                  <ConnectionForm
                    profile={profile}
                    change={setProfile}
                    connect={connect}
                    saving={saving}
                    t={t}
                    directory={snapshot?.meta.data_dir}
                  />
                )}
                {isWeb && (
                  <p className="web-connection-note">
                    {t('webConnection')}
                    <br />
                    <code>{profile?.dataDir}</code>
                  </p>
                )}
              </section>
              {!isWeb && (
                <WebSettings
                  language={language}
                  profile={profile}
                  directory={snapshot?.meta.data_dir}
                />
              )}
              {notice && (
                <div className="notice" role="status">
                  {notice}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {t('workspace')}
                    <span>/</span>
                    {selected ? `@${selected.username || selected.bot_id}` : 'OVERVIEW'}
                  </div>
                  <h1>
                    {tab === 'actions'
                      ? t('actions')
                      : tab === 'errors'
                        ? t('errorsTitle')
                        : selected
                          ? selected.name
                          : t('title')}
                  </h1>
                  <p>
                    {tab === 'actions'
                      ? t('actionsSubtitle')
                      : tab === 'errors'
                        ? t('errorsSubtitle')
                        : selected
                          ? t('sessionHint')
                          : t('subtitle')}
                  </p>
                </div>
                {tab !== 'errors' && (
                  <div className="fleet-pill">
                    <span className="state-dot running" />
                    <strong>{online}</strong> {t('connected')}
                    <span className="pill-divider" />
                    {bots.length} {t('total')}
                  </div>
                )}
              </div>
              <div className="content-toolbar">
                <div className="period-tabs">
                  {[
                    ['today', 'today'],
                    ['7', 'week'],
                    ['30', 'month'],
                    ['custom', 'custom'],
                  ].map(([value, key]) => (
                    <button
                      key={value}
                      className={range === value ? 'chosen' : ''}
                      onClick={() => setRange(value)}
                    >
                      {t(key as TranslationKey)}
                      {value === 'custom' && <ChevronDown size={12} />}
                    </button>
                  ))}
                </div>
                <div className="toolbar-caption">
                  <Clock3 size={13} />
                  {timezone}
                </div>
              </div>
              {range === 'custom' && (
                <div className="custom-period">
                  <label>
                    {t('from')}
                    <input
                      type="date"
                      value={customFrom}
                      max={customTo}
                      onChange={(e) => setCustomFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    {t('to')}
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom}
                      onChange={(e) => setCustomTo(e.target.value)}
                    />
                  </label>
                </div>
              )}
              {loading && !snapshot ? (
                <div className="empty-state">
                  <Loader2 className="spin" size={32} />
                  <h2>{t('connecting')}</h2>
                </div>
              ) : tab === 'actions' ? (
                <ActionAnalytics
                  language={language}
                  bots={bots}
                  selectedId={selectedId}
                  selectBot={setSelectedId}
                  range={range}
                  from={customFrom}
                  to={customTo}
                  timezone={timezone}
                  refresh={refresh}
                  revision={revision}
                />
              ) : tab === 'errors' ? (
                <section className="panel errors-panel">
                  <div className="errors-toolbar">
                    <span className="section-label">
                      {format(snapshot?.error_groups ?? 0)} / {t('errors')}
                    </span>
                    <div className="search-box">
                      <Search size={14} />
                      <input
                        aria-label={t('searchErrors')}
                        placeholder={t('searchErrors')}
                        value={errorSearch}
                        onChange={(e) => setErrorSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  {!snapshot?.errors.length ? (
                    <Empty
                      icon={<ShieldCheck size={29} />}
                      title={t('noErrors')}
                      hint={t('noErrorsHint')}
                    />
                  ) : (
                    snapshot.errors.map((error) => (
                      <ErrorRow
                        key={`${error.bot_id}-${error.fingerprint}`}
                        error={error}
                        expanded={expanded === `${error.bot_id}-${error.fingerprint}`}
                        onClick={() =>
                          setExpanded(
                            expanded === `${error.bot_id}-${error.fingerprint}`
                              ? ''
                              : `${error.bot_id}-${error.fingerprint}`,
                          )
                        }
                        format={format}
                        date={date}
                        t={t}
                      />
                    ))
                  )}
                  {(snapshot?.error_groups ?? 0) > 30 && (
                    <div className="pagination">
                      <button
                        disabled={errorOffset === 0}
                        onClick={() => setErrorOffset((x) => Math.max(0, x - 30))}
                      >
                        {t('previous')}
                      </button>
                      <span>
                        {errorOffset + 1}–{Math.min(errorOffset + 30, snapshot?.error_groups ?? 0)}
                      </span>
                      <button
                        disabled={errorOffset + 30 >= (snapshot?.error_groups ?? 0)}
                        onClick={() => setErrorOffset((x) => x + 30)}
                      >
                        {t('next')}
                      </button>
                    </div>
                  )}
                </section>
              ) : !bots.length ? (
                <section className="panel">
                  <Empty icon={<BotIcon size={32} />} title={t('noBots')} hint={t('emptyHint')} />
                  <div className="empty-bot-actions">
                    <button className="primary-button" data-testid="empty-add-bot" onClick={addBot}>
                      <Plus size={15} />
                      {t('connectBot')}
                    </button>
                    <button
                      className="text-button"
                      data-testid="existing-bot"
                      onClick={() => changeTab('settings')}
                    >
                      {t('existingBot')}
                    </button>
                  </div>
                  <div className="empty-data-location">
                    <small>{t('currentDataDir')}</small>
                    <code>{snapshot?.meta.data_dir || profile?.dataDir || t('defaultDir')}</code>
                  </div>
                </section>
              ) : (
                <>
                  {selected && (
                    <>
                      <ProcessPanel
                        key={selected.bot_id}
                        bot={selected}
                        language={language}
                        changed={() => setRevision((value) => value + 1)}
                      />
                      <BotDiagnostics
                        bot={selected}
                        bots={bots}
                        language={language}
                        minutes={resourceMinutes}
                        range={setResourceMinutes}
                        samplingInterval={snapshot?.settings.resource_interval_seconds ?? 5}
                      />
                    </>
                  )}
                  <div className="metric-grid">
                    <Metric
                      title={t('activeUsers')}
                      value={format(metrics?.users ?? 0)}
                      hint={selected ? t('users') : t('usersHint')}
                      icon={<Users size={17} />}
                      color="violet"
                    />
                    <Metric
                      title={t('messages')}
                      value={format(metrics?.messages ?? 0)}
                      hint={t('messagesHint')}
                      icon={<MessageSquare size={17} />}
                      color="blue"
                    />
                    <Metric
                      title={t('callbacks')}
                      value={format(metrics?.callbacks ?? 0)}
                      hint={t('callbacksHint')}
                      icon={<MousePointer2 size={17} />}
                      color="mint"
                    />
                    <Metric
                      title={t('errors')}
                      value={format(metrics?.errors ?? 0)}
                      hint={t('errorsHint')}
                      icon={<TriangleAlert size={17} />}
                      color="amber"
                    />
                  </div>
                  <section className="panel activity-panel">
                    <PanelTitle
                      title={t('activity')}
                      hint={t('activityHint')}
                      icon={<Activity size={17} />}
                      extra={
                        <div className="chart-legend">
                          <i />
                          {format(metrics?.events ?? 0)} {t('events')}
                        </div>
                      }
                    />
                    <ActivityChart
                      data={snapshot?.series ?? []}
                      date={date}
                      format={format}
                      emptyText={t('noActivity')}
                    />
                  </section>
                  <div className="two-columns">
                    <Ranking
                      title={t('commandTitle')}
                      icon={<Terminal size={16} />}
                      data={snapshot?.commands ?? []}
                      empty={t('noCommands')}
                      format={format}
                    />
                    <Ranking
                      title={t('actionTitle')}
                      icon={<MousePointer2 size={16} />}
                      data={snapshot?.actions ?? []}
                      empty={t('noActions')}
                      format={format}
                    />
                  </div>
                  {selected ? (
                    <section className="panel bot-detail">
                      <PanelTitle
                        title={t('botDetails')}
                        icon={<BotIcon size={17} />}
                        extra={<State bot={selected} t={t} />}
                      />
                      <div className="detail-grid">
                        {[
                          ['entrypoint', selected.entrypoint],
                          ['folder', selected.directory],
                          ['interpreter', selected.interpreter],
                          ['lastContact', date(selected.last_seen)],
                          ['duration', `${selected.metrics.avg_ms} ${t('ms')}`],
                          ['knownUsers', format(selected.metrics.known_users)],
                          ['sessionCount', format(selected.sessions.length)],
                          ['dropped', format(selected.dropped)],
                          ['writeFailures', format(selected.write_failures)],
                        ].map(([key, value]) => (
                          <div key={key}>
                            <small>{t(key as TranslationKey)}</small>
                            <code>{value}</code>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <section className="panel fleet-panel">
                      <PanelTitle
                        title={t('fleetTitle')}
                        icon={<BotIcon size={17} />}
                        extra={<span className="subtle-count">{bots.length}</span>}
                      />
                      <div className="bot-table">
                        <div className="bot-table-head">
                          <span>{t('botName')}</span>
                          <span>{t('status')}</span>
                          <span>{t('users')}</span>
                          <span>{t('messages')}</span>
                          <span>{t('errors')}</span>
                        </div>
                        {filtered.slice(0, visible).map((bot, index) => (
                          <button
                            key={bot.bot_id}
                            className="bot-table-row"
                            onClick={() => chooseBot(bot.bot_id)}
                          >
                            <span className="table-bot">
                              <span className={`bot-avatar color-${index % 4}`}>
                                <BotIcon size={17} />
                              </span>
                              <span>
                                <strong>{bot.name}</strong>
                                <small>@{bot.username || bot.bot_id}</small>
                              </span>
                            </span>
                            <State bot={bot} t={t} />
                            <span>{format(bot.metrics.users)}</span>
                            <span>{format(bot.metrics.messages)}</span>
                            <span className={bot.metrics.errors ? 'error-value' : 'muted'}>
                              {format(bot.metrics.errors)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={13} />
              {transportLabel}
            </span>
            <span>
              {snapshot?.meta.history_start
                ? `${t('historySince')} ${date(snapshot.meta.history_start)}`
                : t('noHistory')}
              <i />
              {snapshot ? `${t('updated')} ${date(snapshot.meta.fetched_at, true)}` : '—'}
            </span>
          </footer>
        </main>
      </div>
      {guideOpen && desktopInfo && (
        <Onboarding
          language={language}
          setLanguage={setLanguage}
          profile={profile}
          setProfile={setProfile}
          connect={connect}
          saving={saving}
          snapshot={snapshot}
          info={desktopInfo}
          refresh={retry}
          close={closeGuide}
          initialStep={guideStart}
        />
      )}
      {wizardOpen && (
        <ProjectWizard
          language={language}
          dataDir={snapshot?.meta.data_dir || profile?.dataDir}
          close={() => setWizardOpen(false)}
          added={(id) => {
            setWizardOpen(false);
            chooseBot(id);
            setRevision((value) => value + 1);
          }}
        />
      )}
      {connectionProblem && (
        <ConnectionProblem
          problem={connectionProblem}
          language={language}
          close={() => setConnectionProblem(null)}
          usePython={(value) =>
            setProfile((current) =>
              current ? { ...current, python: value, dataDir: '' } : current,
            )
          }
        />
      )}
      {confirm && (
        <div className="modal-backdrop">
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <div className="modal-icon">
              <TriangleAlert size={25} />
            </div>
            <h2 id="confirm-title">{t('confirmTitle')}</h2>
            <p>{t('confirmHint')}</p>
            <div className="cleanup-count">
              {t('deleteRows')}
              <strong>{format(Object.values(confirm.counts).reduce((a, b) => a + b, 0))}</strong>
            </div>
            <div className="modal-actions">
              <button onClick={() => setConfirm(null)}>{t('cancel')}</button>
              <button
                className="danger-button"
                disabled={saving}
                onClick={() => applySettings(confirm.settings, true)}
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function State({ bot, t }: { bot: Bot; t: (key: TranslationKey) => string }) {
  return (
    <span className={`state-badge ${bot.state}`}>
      <i />
      {t(bot.state)}
    </span>
  );
}
function PanelTitle({
  title,
  hint,
  icon,
  extra,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>
          {icon}
          {title}
        </h2>
        {hint && <p>{hint}</p>}
      </div>
      {extra}
    </div>
  );
}
function Metric({
  title,
  value,
  hint,
  icon,
  color,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <section className={`metric-card ${color}`}>
      <div className="metric-top">
        <span>{title}</span>
        <div className="metric-icon">{icon}</div>
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </section>
  );
}
function Empty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{hint}</p>
    </div>
  );
}
function Ranking({
  title,
  icon,
  data,
  empty,
  format,
}: {
  title: string;
  icon: React.ReactNode;
  data: { label: string; count: number }[];
  empty: string;
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((x) => x.count));
  return (
    <section className="panel ranking">
      <PanelTitle title={title} icon={icon} />
      {!data.length ? (
        <div className="ranking-empty">{empty}</div>
      ) : (
        data.slice(0, 5).map((row, i) => (
          <div className="rank-row" key={row.label}>
            <span className="rank-number">{String(i + 1).padStart(2, '0')}</span>
            <div className="rank-main">
              <div>
                <code>{row.label}</code>
                <span>{format(row.count)}</span>
              </div>
              <div className="rank-track">
                <i style={{ width: `${(row.count / max) * 100}%` }} />
              </div>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
function ErrorRow({
  error,
  expanded,
  onClick,
  format,
  date,
  t,
}: {
  error: ErrorGroup;
  expanded: boolean;
  onClick: () => void;
  format: (n: number) => string;
  date: (n: number) => string;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className={`error-group ${expanded ? 'expanded' : ''}`}>
      <button className="error-row" onClick={onClick}>
        <div className="error-type-icon">
          <TriangleAlert size={17} />
        </div>
        <div className="error-copy">
          <strong>{error.type}</strong>
          <span>{error.message}</span>
          <small>
            {error.bot_name} <i />
            {date(error.last_seen)}
          </small>
        </div>
        <span className="occurrence-count">×{format(error.count)}</span>
        <ChevronDown size={17} />
      </button>
      {expanded && (
        <div className="traceback">
          <span>{t('traceback')}</span>
          <pre>{error.traceback}</pre>
          <small>
            {t('lastSeen')}: {date(error.last_seen)}
          </small>
        </div>
      )}
    </div>
  );
}
function ActivityChart({
  data,
  date,
  format,
  emptyText,
}: {
  data: { ts: number; count: number; errors: number }[];
  date: (n: number, timeOnly?: boolean) => string;
  format: (n: number) => string;
  emptyText: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const points = useMemo(
    () =>
      data.length > 1
        ? data
        : [
            { ts: 0, count: 0, errors: 0 },
            { ts: 1, count: 0, errors: 0 },
          ],
    [data],
  );
  const max = Math.max(4, ...points.map((p) => p.count));
  const x = (i: number) => 48 + (i / Math.max(1, points.length - 1)) * 920;
  const y = (n: number) => 177 - (n / max) * 140;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.count)}`).join(' ');
  const total = points.reduce((sum, p) => sum + p.count, 0);
  return (
    <div className="chart-container">
      <svg
        viewBox="0 0 1000 218"
        role="img"
        aria-label={total ? `${format(total)} events` : emptyText}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                Math.round(
                  ((((e.clientX - rect.left) / rect.width) * 1000 - 48) / 920) *
                    (points.length - 1),
                ),
              ),
            ),
          );
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#58d6b0" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#58d6b0" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line
              x1="48"
              x2="968"
              y1={37 + i * 35}
              y2={37 + i * 35}
              stroke="#252b35"
              strokeDasharray="3 6"
            />
            <text x="7" y={41 + i * 35}>
              {format(Math.round(max * (1 - i / 4)))}
            </text>
          </g>
        ))}
        <path d={`${line} L968,177 L48,177 Z`} fill="url(#activity-fill)" />
        <path d={line} fill="none" stroke="#62d9b4" strokeWidth="2.3" strokeLinejoin="round" />
        {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i, index) => (
          <text
            key={index}
            x={x(i)}
            y="207"
            textAnchor={index === 0 ? 'start' : index === 2 ? 'end' : 'middle'}
          >
            {points[i].ts ? date(points[i].ts) : ''}
          </text>
        ))}
        {hover !== null && points[hover] && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1="28"
              y2="177"
              stroke="#5d7180"
              strokeDasharray="3 4"
            />
            <circle
              cx={x(hover)}
              cy={y(points[hover].count)}
              r="4"
              fill="#62d9b4"
              stroke="#11151e"
              strokeWidth="2"
            />
            <rect
              x={Math.min(800, Math.max(48, x(hover) - 80))}
              y="4"
              width="168"
              height="27"
              rx="6"
              fill="#272e3c"
            />
            <text
              className="chart-tooltip"
              x={Math.min(800, Math.max(48, x(hover) - 80)) + 84}
              y="22"
              textAnchor="middle"
            >
              {date(points[hover].ts, true)} · {format(points[hover].count)}
            </text>
          </g>
        )}
      </svg>
      {!total && <div className="chart-no-activity">{emptyText}</div>}
    </div>
  );
}
