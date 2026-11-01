import { useEffect, useState } from 'react';
import { Activity, Copy, FileText, RefreshCw } from 'lucide-react';
import type { Bot, LogEntry, ResourcePoint } from './types';
import './diagnostics.css';

export default function BotDiagnostics({
  bot,
  bots,
  language,
  minutes,
  range,
  samplingInterval,
}: {
  bot: Bot;
  bots: Bot[];
  language: 'ru' | 'en';
  minutes: number;
  range: (value: number) => void;
  samplingInterval: number;
}) {
  const ru = language === 'ru';
  const [tab, setTab] = useState<'resources' | 'logs'>('resources');
  const sample = bot.resources?.latest;
  const shared =
    sample &&
    bots.some(
      (other) =>
        other.bot_id !== bot.bot_id &&
        other.sessions.some((s) => s.pid === sample.pid && s.state === 'running'),
    );
  const stale =
    !sample ||
    Date.now() / 1000 - sample.ts > Math.max(30, samplingInterval * 3) ||
    bot.state !== 'running';
  return (
    <section className="panel bot-diagnostics" data-testid="bot-diagnostics">
      <div className="diagnostics-tabs">
        <button
          className={tab === 'resources' ? 'active' : ''}
          data-testid="resource-tab"
          onClick={() => setTab('resources')}
        >
          <Activity size={16} />
          {ru ? 'Ресурсы процесса' : 'Process resources'}
        </button>
        <button
          className={tab === 'logs' ? 'active' : ''}
          data-testid="logs-tab"
          onClick={() => setTab('logs')}
        >
          <FileText size={16} />
          {ru ? 'Логи' : 'Logs'}
        </button>
      </div>
      {tab === 'resources' ? (
        <div className="resource-content">
          <div className="resource-heading">
            <p>
              {ru
                ? 'Только Python-процесс этого бота. Панель и дочерние процессы не учитываются.'
                : 'Only this bot’s Python process. Excludes the dashboard and child processes.'}
            </p>
            <select
              aria-label={ru ? 'Период ресурсов' : 'Resource range'}
              value={minutes}
              onChange={(e) => range(Number(e.target.value))}
            >
              {[15, 60, 1440].map((value) => (
                <option value={value} key={value}>
                  {value === 15
                    ? ru
                      ? '15 минут'
                      : '15 minutes'
                    : value === 60
                      ? ru
                        ? '1 час'
                        : '1 hour'
                      : ru
                        ? '24 часа'
                        : '24 hours'}
                </option>
              ))}
            </select>
          </div>
          {shared && (
            <p className="diagnostic-warning">
              {ru
                ? 'Несколько ботов делят этот процесс: каждый показывает общие CPU и память процесса.'
                : 'Several bots share this process: each shows the same process CPU and memory.'}
            </p>
          )}
          <div className={`resource-values ${stale ? 'stale' : ''}`}>
            <div>
              <small>CPU</small>
              <strong data-testid="resource-cpu">
                {sample?.cpu_percent == null ? '—' : `${sample.cpu_percent.toFixed(1)} %`}
              </strong>
            </div>
            <div>
              <small>{ru ? 'Память · RSS' : 'Memory · RSS'}</small>
              <strong data-testid="resource-memory">
                {sample ? `${(sample.rss_bytes / 1048576).toFixed(1)} MiB` : '—'}
              </strong>
            </div>
            <div>
              <small>PID</small>
              <strong>{sample?.pid ?? '—'}</strong>
            </div>
            <div>
              <small>{ru ? 'Потоки' : 'Threads'}</small>
              <strong>{sample?.threads ?? '—'}</strong>
            </div>
          </div>
          <p className="resource-caption">
            {stale
              ? ru
                ? 'Последний сохранённый замер; актуальные данные пока не поступают.'
                : 'Last recorded measurement; current samples are unavailable.'
              : ru
                ? '100% CPU = одно логическое ядро. RSS — физическая память процесса.'
                : '100% CPU = one logical core. RSS is resident process memory.'}
          </p>
          {!bot.resources?.series.length ? (
            <div className="diagnostics-empty">
              {ru
                ? 'Замеры появятся после запуска бота с обновлённой библиотекой.'
                : 'Measurements appear after starting the bot with the updated SDK.'}
            </div>
          ) : (
            <div className="resource-charts">
              <ResourceChart
                data={bot.resources.series}
                field="cpu_percent"
                title="CPU, %"
                gap={bot.resources.gap_seconds ?? 30}
                language={language}
              />
              <ResourceChart
                data={bot.resources.series}
                field="rss_bytes"
                title={ru ? 'Память, МиБ' : 'Memory, MiB'}
                gap={bot.resources.gap_seconds ?? 30}
                language={language}
              />
            </div>
          )}
        </div>
      ) : (
        <Logs key={bot.bot_id} botId={bot.bot_id} language={language} />
      )}
    </section>
  );
}

function ResourceChart({
  data,
  field,
  title,
  gap,
  language,
}: {
  data: ResourcePoint[];
  field: 'cpu_percent' | 'rss_bytes';
  title: string;
  gap: number;
  language: 'ru' | 'en';
}) {
  const [hover, setHover] = useState<number | null>(null);
  const divisor = field === 'rss_bytes' ? 1048576 : 1;
  const max =
    Math.max(field === 'cpu_percent' ? 10 : 1, ...data.map((p) => (p[field] ?? 0) / divisor)) * 1.1;
  const first = data[0].ts;
  const span = Math.max(1, data[data.length - 1].ts - first);
  const x = (p: ResourcePoint) => 46 + ((p.ts - first) / span) * 696;
  const y = (p: ResourcePoint) => 165 - ((p[field] ?? 0) / divisor / max) * 135;
  let path = '';
  data.forEach((point, index) => {
    if (point[field] === null) return;
    const before = data[index - 1];
    const move =
      !before ||
      before[field] === null ||
      before.session_id !== point.session_id ||
      point.ts - before.ts > gap;
    path += `${move ? 'M' : 'L'}${x(point)},${y(point)} `;
  });
  const time = (ts: number) =>
    new Date(ts * 1000).toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  const current = hover === null ? null : data[hover];
  return (
    <div className="resource-chart">
      <h3>{title}</h3>
      <svg
        viewBox="0 0 780 210"
        role="img"
        aria-label={title}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const target =
            first + ((((event.clientX - rect.left) / rect.width) * 780 - 46) / 696) * span;
          let nearest = 0;
          data.forEach((p, index) => {
            if (Math.abs(p.ts - target) < Math.abs(data[nearest].ts - target)) nearest = index;
          });
          setHover(nearest);
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="46"
              x2="742"
              y1={30 + i * 45}
              y2={30 + i * 45}
              stroke="#29313f"
              strokeDasharray="3 5"
            />
            <text x="3" y={34 + i * 45}>
              {(max * (1 - i / 3)).toFixed(0)}
            </text>
          </g>
        ))}
        <path
          d={path}
          fill="none"
          stroke={field === 'cpu_percent' ? '#62d9b4' : '#a899ff'}
          strokeWidth="2.5"
        />
        {data.map((point, index) => {
          if (point[field] === null) return null;
          const before = data[index - 1],
            after = data[index + 1];
          const aloneBefore =
            !before ||
            before[field] === null ||
            before.session_id !== point.session_id ||
            point.ts - before.ts > gap;
          const aloneAfter =
            !after ||
            after[field] === null ||
            after.session_id !== point.session_id ||
            after.ts - point.ts > gap;
          return aloneBefore && aloneAfter ? (
            <circle
              key={`${point.session_id}-${point.ts}`}
              cx={x(point)}
              cy={y(point)}
              r="4"
              fill={field === 'cpu_percent' ? '#62d9b4' : '#a899ff'}
            />
          ) : null;
        })}
        <text x="46" y="198">
          {time(first)}
        </text>
        <text x="742" y="198" textAnchor="end">
          {time(first + span)}
        </text>
        {current && current[field] !== null && (
          <g>
            <line
              x1={x(current)}
              x2={x(current)}
              y1="25"
              y2="170"
              stroke="#8b9bab"
              strokeDasharray="3 4"
            />
            <circle cx={x(current)} cy={y(current)} r="4" fill="#e2e8f0" />
          </g>
        )}
      </svg>
      <div className="resource-tooltip">
        {current
          ? `${time(current.ts)} · ${current[field] === null ? '—' : ((current[field] ?? 0) / divisor).toFixed(2)} · PID ${current.pid}`
          : ' '}
      </div>
    </div>
  );
}

function Logs({ botId, language }: { botId: string; language: 'ru' | 'en' }) {
  const ru = language === 'ru';
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState(0);
  const [offset, setOffset] = useState(0);
  const [live, setLive] = useState(true);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ items: LogEntry[]; total: number }>({
    items: [],
    total: 0,
  });
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true,
      busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const data = await window.botControl.logs({ bot_id: botId, query, level, offset });
        if (active) {
          setResult(data);
          setError('');
        }
      } catch (failure) {
        if (active) setError(String(failure));
      } finally {
        busy = false;
      }
    }
    const start = setTimeout(load, 200);
    const timer = live && offset === 0 ? setInterval(load, 3000) : undefined;
    return () => {
      active = false;
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [botId, query, level, offset, live, revision]);
  return (
    <div className="logs-content" data-testid="logs-content">
      <div className="logs-toolbar">
        <input
          aria-label={ru ? 'Поиск по логам' : 'Search logs'}
          placeholder={ru ? 'Текст или имя логгера…' : 'Text or logger name…'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOffset(0);
          }}
        />
        <select
          aria-label={ru ? 'Уровень логов' : 'Log level'}
          value={level}
          onChange={(e) => {
            setLevel(Number(e.target.value));
            setOffset(0);
          }}
        >
          {[
            [0, ru ? 'Все уровни' : 'All levels'],
            [10, 'DEBUG+'],
            [20, 'INFO+'],
            [30, 'WARNING+'],
            [40, 'ERROR+'],
            [50, 'CRITICAL'],
          ].map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="log-live">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          {ru ? 'Обновлять' : 'Live'}
        </label>
        <button
          className="icon-button"
          aria-label={ru ? 'Обновить логи' : 'Refresh logs'}
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {error && (
        <p role="alert" className="diagnostic-warning">
          {error}
        </p>
      )}
      <details className="log-integration">
        <summary>
          {ru ? 'Как подключить существующий логгер' : 'Connect an existing logger'}
        </summary>
        <p>
          {ru
            ? 'Добавьте после создания monitor. Существующие вывод в файл и консоль сохраняются. Уровень настраивается в вашем логгере.'
            : 'Add after creating monitor. Existing file/console handlers are preserved. Configure levels in your logger.'}
        </p>
        <pre>
          {
            '# Python logging\nmonitor.capture_logs()\n\n# logging with propagate=False\nmonitor.capture_logs("my_bot")\n\n# Loguru (alternative)\nsink_id = logger.add(monitor.loguru_sink, level="INFO")'
          }
        </pre>
        <p>
          {ru
            ? 'Подключайте один способ к одному потоку записей, чтобы избежать дублей. История до подключения из файлов не импортируется. Произвольный текст может содержать личные данные; токены и типичные секреты маскируются.'
            : 'Use one adapter per stream to avoid duplicates. Existing files are not imported. Free-form text may contain personal data; tokens and common secrets are masked.'}
        </p>
      </details>
      {!result.items.length ? (
        <div className="diagnostics-empty">
          {ru
            ? 'Записей пока нет. Подключите обработчик к своему логгеру или измените фильтр.'
            : 'No records yet. Attach a handler to your logger or change the filter.'}
        </div>
      ) : (
        <div className="log-entries">
          {result.items.map((entry) => (
            <div
              className={`log-entry log-level-${entry.level >= 40 ? 'error' : entry.level >= 30 ? 'warning' : 'info'}`}
              key={entry.id}
            >
              <div className="log-meta">
                <time>{new Date(entry.ts * 1000).toLocaleString(ru ? 'ru-RU' : 'en-GB')}</time>
                <b>
                  {(
                    {
                      10: 'DEBUG',
                      20: 'INFO',
                      30: 'WARNING',
                      40: 'ERROR',
                      50: 'CRITICAL',
                    } as Record<number, string>
                  )[entry.level] ?? entry.level}
                </b>
                <code>{entry.logger}</code>
                <small>{entry.source}</small>
                <button
                  className="icon-button"
                  aria-label={ru ? 'Копировать запись' : 'Copy record'}
                  onClick={() =>
                    void window.botControl
                      .copyText(`${entry.message}\n${entry.traceback}`)
                      .catch((failure) => setError(String(failure)))
                  }
                >
                  <Copy size={13} />
                </button>
              </div>
              <pre>{entry.message}</pre>
              {entry.traceback && (
                <details>
                  <summary>Traceback</summary>
                  <pre>{entry.traceback}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="logs-pagination">
        <span>
          {result.total
            ? `${offset + 1}–${Math.min(offset + 100, result.total)} / ${result.total}`
            : '0'}
        </span>
        <button disabled={offset === 0} onClick={() => setOffset((v) => Math.max(0, v - 100))}>
          {ru ? 'Новее' : 'Newer'}
        </button>
        <button disabled={offset + 100 >= result.total} onClick={() => setOffset((v) => v + 100)}>
          {ru ? 'Старее' : 'Older'}
        </button>
      </div>
    </div>
  );
}
