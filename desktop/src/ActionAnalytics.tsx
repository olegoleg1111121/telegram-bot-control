import { useEffect, useState } from 'react';
import { Activity, Search } from 'lucide-react';
import type { ActionAnalytics as Analytics, Bot } from './types';
import { periodWindow } from './time';
import './actions.css';

export default function ActionAnalytics({
  language,
  bots,
  selectedId,
  selectBot,
  range,
  from,
  to,
  timezone,
  refresh,
  revision,
}: {
  language: 'ru' | 'en';
  bots: Bot[];
  selectedId: string;
  selectBot: (id: string) => void;
  range: string;
  from: string;
  to: string;
  timezone: string;
  refresh: number;
  revision: number;
}) {
  const ru = language === 'ru';
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [outcome, setOutcome] = useState('');
  const [bucket, setBucket] = useState(0);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Analytics | null>(null);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const locale = ru ? 'ru-RU' : 'en-US';
  const number = (n: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
  const date = (ts: number) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(ts * 1000);
  const outcomeLabel = (value: string) =>
    ({
      success: ru ? 'Успешно' : 'Success',
      error: ru ? 'Ошибка' : 'Error',
      cancelled: ru ? 'Отменено' : 'Cancelled',
      unhandled: ru ? 'Без обработчика' : 'Unhandled',
    })[value] || value;
  const sourceLabel = (value: string) =>
    ({
      custom: ru ? 'Событие' : 'Event',
      function: ru ? 'Функция' : 'Function',
      callback: ru ? 'Кнопка' : 'Button',
    })[value] || value;
  useEffect(() => {
    setOffset(0);
  }, [selectedId, range, from, to, timezone, name, query, source, outcome, bucket]);
  useEffect(() => {
    let active = true,
      pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      if (active) setBusy(true);
      try {
        const result = await window.botControl.actions({
          ...periodWindow(range, from, to, timezone),
          bot_id: selectedId,
          name,
          query,
          source,
          outcome,
          offset,
          bucket_seconds: bucket,
        });
        if (active) {
          setData(result);
          setFailure('');
        }
      } catch (e) {
        if (active) setFailure(String(e));
      } finally {
        pending = false;
        if (active) setBusy(false);
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
    from,
    to,
    timezone,
    name,
    query,
    source,
    outcome,
    bucket,
    offset,
    refresh,
    revision,
  ]);
  const series = data?.series || [];
  const max = Math.max(1, ...series.map((p) => p.count));
  const points = series
    .map(
      (p, i) => `${10 + (i * 980) / Math.max(1, series.length - 1)},${150 - (p.count / max) * 130}`,
    )
    .join(' ');
  return (
    <div className="action-analytics" data-testid="action-analytics" aria-busy={busy}>
      <section className="panel action-filters">
        <label>
          {ru ? 'Бот' : 'Bot'}
          <select
            data-testid="actions-bot"
            value={selectedId}
            onChange={(e) => {
              selectBot(e.target.value);
              setName('');
            }}
          >
            <option value="">{ru ? 'Все боты' : 'All bots'}</option>
            {bots.map((b) => (
              <option value={b.bot_id} key={b.bot_id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {ru ? 'Источник' : 'Source'}
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{ru ? 'Все источники' : 'All sources'}</option>
            {['callback', 'custom', 'function'].map((v) => (
              <option key={v} value={v}>
                {sourceLabel(v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {ru ? 'Результат' : 'Outcome'}
          <select
            data-testid="actions-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="">{ru ? 'Все результаты' : 'All outcomes'}</option>
            {['success', 'error', 'cancelled', 'unhandled'].map((v) => (
              <option key={v} value={v}>
                {outcomeLabel(v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {ru ? 'Шаг графика' : 'Chart interval'}
          <select
            data-testid="actions-bucket"
            value={bucket}
            onChange={(e) => setBucket(Number(e.target.value))}
          >
            {[
              [0, ru ? 'Авто' : 'Auto'],
              [60, ru ? 'Минута' : 'Minute'],
              [300, ru ? '5 минут' : '5 minutes'],
              [3600, ru ? 'Час' : 'Hour'],
              [86400, ru ? 'День' : 'Day'],
            ].map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="action-search">
          {ru ? 'Поиск события' : 'Find an event'}
          <span>
            <Search size={15} />
            <input
              data-testid="actions-query"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setName('');
              }}
              placeholder="order.completed"
            />
          </span>
        </label>
      </section>
      {failure && (
        <div className="connection-error" role="alert">
          {failure}
        </div>
      )}
      {!!data?.warnings.length && <p className="warning">{data.warnings.join(', ')}</p>}
      {name && (
        <button className="text-button" data-testid="actions-clear" onClick={() => setName('')}>
          {ru ? 'Все события' : 'All events'} / {name} ×
        </button>
      )}
      <div className="action-metrics">
        {[
          [ru ? 'Срабатывания' : 'Occurrences', data?.summary.count || 0],
          [ru ? 'Пользователи' : 'Users', data?.summary.users || 0],
          [ru ? 'Ошибки' : 'Errors', data?.summary.errors || 0],
          [ru ? 'Отмены' : 'Cancelled', data?.summary.cancelled || 0],
          [ru ? 'Среднее время, мс' : 'Average time, ms', data?.summary.avg_ms || 0],
        ].map(([label, value]) => (
          <div className="panel" key={String(label)}>
            <small>{label}</small>
            <strong
              data-testid={
                label === (ru ? 'Срабатывания' : 'Occurrences') ? 'actions-count' : undefined
              }
            >
              {number(Number(value))}
            </strong>
          </div>
        ))}
      </div>
      <section className="panel action-chart">
        <div className="panel-title">
          <Activity size={17} />
          <h2>{name || (ru ? 'События во времени' : 'Events over time')}</h2>
        </div>
        <svg
          data-testid="actions-chart"
          viewBox="0 0 1000 165"
          role="img"
          aria-label={ru ? 'График срабатываний событий' : 'Event occurrences timeline'}
          preserveAspectRatio="none"
        >
          {[20, 85, 150].map((y) => (
            <line key={y} x1="10" y1={y} x2="990" y2={y} stroke="currentColor" opacity="0.12" />
          ))}
          <polyline
            points={points}
            fill="none"
            stroke="#5ed9c5"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {series
            .filter((p) => p.count > 0)
            .map((p) => (
              <circle
                key={p.ts}
                cx={10 + (series.indexOf(p) * 980) / Math.max(1, series.length - 1)}
                cy={150 - (p.count / max) * 130}
                r="3"
                fill={p.errors ? '#f6a0a0' : '#5ed9c5'}
              >
                <title>
                  {date(p.ts)}: {p.count} ({outcomeLabel('error')}: {p.errors})
                </title>
              </circle>
            ))}
        </svg>
        <div className="action-chart-caption">
          <span>{series[0] ? date(series[0].ts) : ''}</span>
          <span>
            {ru ? 'Шаг' : 'Interval'}: {number((data?.bucket_seconds || 60) / 60)}{' '}
            {ru ? 'мин' : 'min'} · {timezone}
          </span>
          <span>{series.length ? date(series[series.length - 1].ts) : ''}</span>
        </div>
        <p className="form-note">
          {ru
            ? 'Пустые интервалы показаны нулями. Для длинного периода шаг увеличивается автоматически. Пользователи между ботами суммируются; события без user_id не увеличивают их число.'
            : 'Empty intervals are zero. Long ranges automatically increase the interval. Users are summed across bots; events without user_id do not add users.'}
        </p>
      </section>
      <section className="panel action-ranking">
        <h2>{ru ? 'События' : 'Events'}</h2>
        <div className="action-table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  ru ? 'Название' : 'Name',
                  ru ? 'Раз' : 'Count',
                  ru ? 'Пользователи' : 'Users',
                  ru ? 'Ошибки' : 'Errors',
                  ru ? 'Среднее, мс' : 'Average, ms',
                  ru ? 'Последний раз' : 'Last seen',
                ].map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.actions.map((a) => (
                <tr key={a.name} className={name === a.name ? 'selected-action' : ''}>
                  <td>
                    <button
                      className="text-button"
                      data-testid="action-name"
                      onClick={() => setName(a.name)}
                    >
                      {a.name}
                    </button>
                  </td>
                  <td>{number(a.count)}</td>
                  <td>{number(a.users)}</td>
                  <td>{number(a.errors)}</td>
                  <td>{number(a.avg_ms)}</td>
                  <td>{date(a.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.actions.length && (
          <p className="action-empty">
            {ru
              ? 'За этот период событий нет. Подключите actions, track_action или декоратор — пример есть в разделе «Подключить с ИИ».'
              : 'No events in this period. Add actions, track_action or a decorator; see “Connect with AI”.'}
          </p>
        )}
      </section>
      <section className="panel action-recent">
        <h2>{ru ? 'История срабатываний' : 'Occurrence history'}</h2>
        {data?.recent.map((item) => (
          <details
            className="action-event"
            key={`${item.bot_id}:${item.id}`}
            data-testid="action-event"
          >
            <summary>
              <time dateTime={new Date(item.ts * 1000).toISOString()}>{date(item.ts)}</time>
              <strong>{item.name}</strong>
              <span>{item.bot_name}</span>
              <span className={`action-outcome ${item.outcome}`}>{outcomeLabel(item.outcome)}</span>
              <span>
                {number(item.duration_ms)} {ru ? 'мс' : 'ms'}
              </span>
            </summary>
            <div className="action-event-detail">
              <p>
                {sourceLabel(item.source)} · {new Date(item.ts * 1000).toISOString()}
              </p>
              {item.error_message && (
                <p>
                  {item.error_type}: {item.error_message}
                </p>
              )}
              {item.traceback && <pre>{item.traceback}</pre>}
            </div>
          </details>
        ))}
        {!data?.recent.length && (
          <p className="action-empty">
            {ru
              ? 'Нет срабатываний по выбранным условиям.'
              : 'No occurrences match the current filters.'}
          </p>
        )}
        {!!data?.total && (
          <div className="pagination">
            <button disabled={offset === 0} onClick={() => setOffset((v) => Math.max(0, v - 50))}>
              {ru ? 'Назад' : 'Previous'}
            </button>
            <span>
              {offset + 1}–{Math.min(offset + 50, data.total)} / {number(data.total)}
            </span>
            <button
              disabled={offset + 50 >= data.total || offset >= 10000}
              onClick={() => setOffset((v) => v + 50)}
            >
              {ru ? 'Далее' : 'Next'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
