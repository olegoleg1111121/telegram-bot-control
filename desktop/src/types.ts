export type Settings = {
  statistics_days: number | null;
  errors_days: number | null;
  diagnostics_days: number | null;
  logs_days: number | null;
  resources_days: number | null;
  resource_interval_seconds: number;
  heartbeat_seconds: number;
  connection_timeout_seconds: number;
};
export type Profile = {
  mode: 'local' | 'ssh';
  python: string;
  dataDir: string;
  host: string;
  user: string;
  port: number;
  keyPath: string;
};
export type DesktopInfo = {
  runtime?: 'desktop' | 'web';
  guideSeenVersion: number;
  language?: 'ru' | 'en';
  trayAvailable: boolean;
  autoGuide: boolean;
  version: string;
};
export type WebState = {
  running: boolean;
  host?: string;
  port?: number;
  url?: string;
  key?: string;
};
export type Metrics = {
  events: number;
  messages: number;
  users: number;
  callbacks: number;
  commands: number;
  errors: number;
  avg_ms: number;
  known_users: number;
};
export type LaunchProfile = {
  command: string[];
  cwd: string;
  pre_start: string[][];
  env_file: string;
  environment: Record<string, string>;
  required_env: string[];
  restart?: RestartPolicy;
};
export type RestartPolicy = {
  enabled: boolean;
  max_restarts: number;
  delay_seconds: number;
  max_delay_seconds: number;
  reset_after_seconds: number;
};
export type LogEntry = {
  id: string;
  ts: number;
  level: number;
  logger: string;
  message: string;
  traceback: string;
  source: string;
};
export type ResourcePoint = {
  ts: number;
  session_id: string;
  pid: number;
  cpu_percent: number | null;
  rss_bytes: number;
  threads: number;
};
export type ProjectInfo = {
  directory: string;
  entrypoints: string[];
  interpreters: string[];
  has_env: boolean;
  dependencies: string[];
  integration?: {
    entrypoint: string;
    snippet: string;
    already_imported: boolean;
    names_detected: boolean;
  };
};
export type ManagedRun = {
  id: string;
  status: string;
  error: string;
  diagnostics?: string;
  exit_code: number | null;
  pid: number | null;
  restarts?: number;
  next_retry_at?: number | null;
};
export type ControlState = {
  can_start: boolean;
  can_stop: boolean;
  reason: string;
  profile_available: boolean;
  run: ManagedRun | null;
};
export type Bot = {
  bot_id: string;
  name: string;
  username: string;
  directory: string;
  entrypoint: string;
  interpreter: string;
  state: 'waiting' | 'running' | 'stopped' | 'disconnected';
  last_seen: number;
  metrics: Metrics;
  dropped: number;
  write_failures: number;
  integration_pending?: boolean;
  resources?: {
    latest: ResourcePoint | null;
    series: ResourcePoint[];
    gap_seconds?: number;
  } | null;
  sessions: { id: string; pid: number; started_at: number; last_seen: number; state: string }[];
  control?: ControlState;
};
export type ErrorGroup = {
  fingerprint: string;
  type: string;
  message: string;
  traceback: string;
  kind: string;
  count: number;
  first_seen: number;
  last_seen: number;
  bot_id: string;
  bot_name: string;
};
export type Snapshot = {
  meta: {
    hostname: string;
    platform: string;
    transport: string;
    data_dir: string;
    db_bytes: number;
    history_start: number | null;
    warnings: string[];
    fetched_at: number;
  };
  bots: Bot[];
  totals: Metrics;
  series: { ts: number; count: number; errors: number }[];
  commands: { label: string; count: number }[];
  actions: { label: string; count: number }[];
  errors: ErrorGroup[];
  error_groups: number;
  settings: Settings;
};
export type SnapshotParams = {
  since: number;
  until: number;
  bot_id?: string;
  error_offset?: number;
  error_query?: string;
  resource_since?: number;
};
declare global {
  interface Window {
    botControl: {
      logs(params: {
        bot_id: string;
        level?: number;
        query?: string;
        offset?: number;
      }): Promise<{ items: LogEntry[]; total: number }>;
      inspectProject(directory: string, entrypoint?: string): Promise<ProjectInfo>;
      registerProject(params: {
        bot_id: string;
        name: string;
        entrypoint: string;
        interpreter: string;
        profile: LaunchProfile;
      }): Promise<{ bot_id: string }>;
      webStatus(): Promise<WebState>;
      startWeb(options: { host: string; port: number }): Promise<WebState>;
      stopWeb(): Promise<WebState>;
      openWebPanel(): Promise<void>;
      logout?(): Promise<void>;
      desktopInfo(): Promise<DesktopInfo>;
      saveDesktopPreferences(next: {
        guideSeenVersion?: number;
        language?: 'ru' | 'en';
      }): Promise<unknown>;
      copyText(text: string): Promise<void>;
      onOpenGuide(callback: () => void): () => void;
      snapshot(params: SnapshotParams): Promise<Snapshot>;
      connection(): Promise<Profile>;
      connect(profile: Profile): Promise<unknown>;
      previewRetention(settings: Settings): Promise<Record<string, number>>;
      saveSettings(settings: Settings, confirmCleanup: boolean): Promise<unknown>;
      launchProfile(
        botId: string,
      ): Promise<{ profile: LaunchProfile | null; configured: boolean; run: ManagedRun | null }>;
      saveLaunchProfile(botId: string, profile: LaunchProfile): Promise<unknown>;
      controlBot(
        botId: string,
        action: 'start' | 'stop' | 'restart',
        force?: boolean,
      ): Promise<{ status: string }>;
    };
  }
}
