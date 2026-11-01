import { useMemo, useRef, useState } from 'react';
import { Check, Copy, Sparkles } from 'lucide-react';
import type { Bot } from './types';
import { integrationPrompt } from './ai-prompt';
import './actions.css';

export default function AiIntegration({
  language,
  bots,
  dataDir,
}: {
  language: 'ru' | 'en';
  bots: Bot[];
  dataDir?: string;
}) {
  const ru = language === 'ru';
  const [botId, setBotId] = useState('');
  const [environment, setEnvironment] = useState<'system' | 'venv'>('system');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const promptField = useRef<HTMLTextAreaElement>(null);
  const bot = bots.find((b) => b.bot_id === botId);
  const prompt = useMemo(
    () =>
      integrationPrompt(language, {
        dataDir,
        interpreter: bot?.interpreter,
        entrypoint: bot?.entrypoint,
        environment,
      }),
    [language, dataDir, bot, environment],
  );
  async function copy() {
    try {
      await window.botControl.copyText(prompt);
      setCopied(true);
      setError('');
    } catch {
      promptField.current?.focus();
      promptField.current?.select();
      setError(
        ru
          ? 'Браузер не разрешил копирование. Текст выделен: нажмите Ctrl+C или выберите «Копировать».'
          : 'The browser blocked clipboard access. Text is selected: press Ctrl+C or choose Copy.',
      );
    }
  }
  return (
    <div className="integration-page" data-testid="ai-integration">
      <div className="page-heading">
        <div>
          <div className="eyebrow">BOT CONTROL / INTEGRATION</div>
          <h1>{ru ? 'Подключить с ИИ' : 'Connect with AI'}</h1>
          <p>
            {ru
              ? 'Готовое задание для помощника, который работает с кодом вашего бота.'
              : 'A ready-to-copy task for the assistant working on your bot.'}
          </p>
        </div>
        <Sparkles className="heading-icon" size={28} />
      </div>
      <section className="panel integration-guide">
        <ol>
          <li>
            {ru
              ? 'Выберите способ запуска и скопируйте промпт ниже.'
              : 'Choose how the bot runs and copy the prompt below.'}
          </li>
          <li>
            {ru
              ? 'Передайте его ИИ в проекте своего бота. Он должен изучить код, установить SDK и подключить middleware.'
              : 'Give it to an AI in your bot project to inspect the code, install the SDK and attach middleware.'}
          </li>
          <li>
            {ru
              ? 'Проверьте изменения и запустите бота привычной командой. Укажите ту же папку данных, что открыта в панели.'
              : 'Review the changes, run your existing launch command and use the same data directory as the dashboard.'}
          </li>
        </ol>
        <p>
          {ru
            ? 'Обычный Python поддерживается. Создавать venv или активировать окружение для панели не требуется. Важно устанавливать пакет через Python самого бота: python -m pip, а не случайный pip.'
            : 'Regular Python is supported. Creating or activating a venv is unnecessary. Install through the bot’s interpreter with python -m pip.'}
        </p>
        <div className="form-grid">
          <label>
            {ru ? 'Способ запуска бота' : 'Bot runtime'}
            <select
              data-testid="ai-environment"
              value={environment}
              onChange={(e) => {
                setEnvironment(e.target.value as 'system' | 'venv');
                setCopied(false);
              }}
            >
              <option value="system">
                {ru ? 'Обычный Python, без venv' : 'Regular Python, no venv'}
              </option>
              <option value="venv">
                {ru ? 'Существующий venv / virtualenv' : 'Existing venv / virtualenv'}
              </option>
            </select>
          </label>
          <label>
            {ru ? 'Подставить пути подключённого бота' : 'Use a connected bot’s paths'}
            <select
              value={botId}
              onChange={(e) => {
                setBotId(e.target.value);
                setCopied(false);
              }}
            >
              <option value="">
                {ru ? 'Новый проект — ИИ определит пути' : 'New project — let the AI inspect paths'}
              </option>
              {bots.map((b) => (
                <option key={b.bot_id} value={b.bot_id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>
          {ru
            ? 'Промпт содержит инструкции и выбранные пути. Токен и содержимое .env в него не добавляются. Перед отправкой можно отредактировать текст.'
            : 'The prompt contains instructions and selected paths. It does not include the token or .env contents. You can edit it before sending.'}
        </p>
        <button className="primary-button" data-testid="copy-ai-prompt" onClick={() => void copy()}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? (ru ? 'Скопировано' : 'Copied') : ru ? 'Копировать промпт' : 'Copy prompt'}
        </button>
        {error && (
          <p role="alert" data-testid="ai-copy-error">
            {error}
          </p>
        )}
        <textarea
          ref={promptField}
          data-testid="ai-prompt"
          className="ai-prompt"
          aria-label={ru ? 'Промпт для ИИ' : 'AI prompt'}
          readOnly
          value={prompt}
          rows={24}
        />
      </section>
    </div>
  );
}
