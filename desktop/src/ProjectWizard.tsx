import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, FolderSearch, Loader2, X } from 'lucide-react';
import type { LaunchProfile, ProjectInfo } from './types';
import { processErrors } from './process-i18n';
import './wizard.css';

export default function ProjectWizard({
  language,
  close,
  added,
}: {
  language: 'ru' | 'en';
  close: () => void;
  added: (id: string) => void;
}) {
  const ru = language === 'ru';
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [directory, setDirectory] = useState('');
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [entrypoint, setEntrypoint] = useState('');
  const [python, setPython] = useState('');
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [envFile, setEnvFile] = useState('');
  const [command, setCommand] = useState('[]');
  const [prepare, setPrepare] = useState('[]');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    return () => before?.focus();
  }, []);
  const explain = (failure: unknown) => {
    const code = String(failure).replace(/^.*Error: /, '');
    return processErrors[language][code] || code;
  };
  async function inspect(nextStep: boolean) {
    setBusy(true);
    setError('');
    try {
      const result = await window.botControl.inspectProject(
        directory,
        nextStep ? undefined : entrypoint,
      );
      setInfo(result);
      setDirectory(result.directory);
      setEntrypoint(result.integration?.entrypoint || result.entrypoints[0] || entrypoint);
      if (!python) setPython(result.interpreters[0] || '');
      if (nextStep) setStep(1);
    } catch (failure) {
      setError(explain(failure));
    } finally {
      setBusy(false);
    }
  }
  async function next() {
    if (step === 0) return inspect(true);
    if (step === 1) {
      setBusy(true);
      setError('');
      try {
        const result = await window.botControl.inspectProject(directory, entrypoint);
        if (!result.integration) throw new Error('entrypoint_not_found');
        setInfo(result);
        setEntrypoint(result.integration.entrypoint);
        if (info?.integration?.entrypoint !== result.integration.entrypoint) return;
        setCommand(JSON.stringify([python, result.integration.entrypoint], null, 2));
        setStep(2);
      } catch (failure) {
        setError(explain(failure));
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    setError('');
    try {
      const profile: LaunchProfile = {
        command: JSON.parse(command),
        cwd: directory,
        pre_start: JSON.parse(prepare),
        env_file: envFile,
        environment: {},
        required_env: [],
      };
      const result = await window.botControl.registerProject({
        bot_id: id,
        name,
        entrypoint,
        interpreter: python,
        profile,
      });
      added(result.bot_id);
    } catch (failure) {
      setError(explain(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="project-wizard"
      data-testid="project-wizard"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      aria-labelledby="wizard-title"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
      >
        <div className="wizard-top">
          <span>BOT CONTROL / {ru ? 'ПОДКЛЮЧЕНИЕ' : 'CONNECT PROJECT'}</span>
          <button
            type="button"
            className="icon-button"
            data-testid="wizard-close"
            disabled={busy}
            aria-label={ru ? 'Закрыть' : 'Close'}
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <div className="wizard-steps">
          {(ru
            ? ['Проект', 'Библиотека и логи', 'Способ запуска']
            : ['Project', 'SDK and logs', 'Launch settings']
          ).map((label, index) => (
            <span
              className={step === index ? 'active' : step > index ? 'complete' : ''}
              key={label}
            >
              {index + 1}. {label}
            </span>
          ))}
        </div>
        <h1 id="wizard-title">
          {step === 0
            ? ru
              ? 'Подключим существующего бота'
              : 'Connect an existing bot'
            : step === 1
              ? ru
                ? 'Подключите библиотеку к своему коду'
                : 'Add the SDK to your code'
              : ru
                ? 'Проверьте запуск и сохраните'
                : 'Review launch settings and save'}
        </h1>
        <div className="wizard-body">
          {step === 0 && (
            <>
              <p>
                {ru
                  ? 'Укажите папку проекта на сервере, к которому подключена панель. Мастер проверит имена файлов и найдёт Python; исходники не запускаются.'
                  : 'Enter a project folder on the connected server. The wizard inspects filenames and discovers Python without running your code.'}
              </p>
              <label>
                {ru ? 'Полный путь к папке проекта' : 'Full project directory'}
                <input
                  data-testid="wizard-directory"
                  autoFocus
                  required
                  value={directory}
                  onChange={(e) => setDirectory(e.target.value)}
                  placeholder={
                    ru
                      ? 'C:\\Bots\\my-bot или /home/user/my-bot'
                      : 'C:\\Bots\\my-bot or /home/user/my-bot'
                  }
                />
              </label>
              <div className="wizard-tip">
                <FolderSearch size={18} />
                <p>
                  {ru
                    ? 'Содержимое .env и токен не читаются. Проект останется в своей папке.'
                    : '.env contents and bot tokens are not read. Your project stays in its directory.'}
                </p>
              </div>
            </>
          )}
          {step === 1 && info && (
            <>
              <div className="form-grid">
                <label>
                  {ru ? 'Главный Python-файл' : 'Python entry point'}
                  <input
                    data-testid="wizard-entrypoint"
                    list="wizard-entrypoints"
                    required
                    value={entrypoint}
                    onChange={(e) => {
                      setEntrypoint(e.target.value);
                      setCopied(false);
                      setInfo({ ...info, integration: undefined });
                    }}
                  />
                  <datalist id="wizard-entrypoints">
                    {info.entrypoints.map((p) => (
                      <option value={p} key={p} />
                    ))}
                  </datalist>
                </label>
                <label>
                  {ru ? 'Python окружения бота' : 'Bot Python interpreter'}
                  <input
                    data-testid="wizard-python"
                    required
                    list="wizard-interpreters"
                    value={python}
                    onChange={(e) => setPython(e.target.value)}
                  />
                  <datalist id="wizard-interpreters">
                    {info.interpreters.map((p) => (
                      <option value={p} key={p} />
                    ))}
                  </datalist>
                </label>
              </div>
              <button
                type="button"
                className="wizard-inspect"
                disabled={busy}
                onClick={() => void inspect(false)}
              >
                {ru ? 'Проверить выбранный файл' : 'Inspect selected file'}
              </button>
              <p>
                {ru
                  ? 'Установите wheel telegram-bot-control из релиза в выбранное окружение. Код ниже разместите после создания Bot и Dispatcher, перед запуском polling или webhook.'
                  : 'Install the release wheel into the selected environment. Place this code after creating Bot and Dispatcher, before polling or webhook startup.'}
              </p>
              {info.integration && (
                <>
                  {info.integration.already_imported && (
                    <p className="wizard-tip">
                      {ru
                        ? 'Импорт библиотеки уже найден. Обновите существующее подключение, чтобы не дублировать middleware.'
                        : 'An SDK import already exists. Update that integration instead of adding duplicate middleware.'}
                    </p>
                  )}
                  {!info.integration.names_detected && (
                    <p className="diagnostic-warning">
                      {ru
                        ? 'Не удалось уверенно определить переменные. Замените bot и dp именами из вашего кода.'
                        : 'Variable names could not be determined. Replace bot and dp with your own variables.'}
                    </p>
                  )}
                  <pre data-testid="wizard-snippet">{info.integration.snippet}</pre>
                  <button
                    type="button"
                    onClick={() =>
                      void window.botControl
                        .copyText(info.integration!.snippet)
                        .then(() => setCopied(true))
                        .catch((failure) => setError(explain(failure)))
                    }
                  >
                    <Copy size={14} />
                    {copied ? (ru ? 'Скопировано' : 'Copied') : ru ? 'Копировать код' : 'Copy code'}
                  </button>
                </>
              )}
              <p>
                {ru
                  ? 'capture_logs=True подключает существующий logging, сохраняя его обработчики. Для Loguru используйте logger.add(monitor.loguru_sink). Для собственного логгера с propagate=False — monitor.capture_logs("имя"). Уровень INFO/DEBUG включайте в настройках своего логгера.'
                  : 'capture_logs=True copies existing logging records while preserving handlers. For Loguru use logger.add(monitor.loguru_sink). For a logger with propagate=False use monitor.capture_logs("name"). Enable INFO/DEBUG in your logger configuration.'}
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <div className="form-grid">
                <label>
                  {ru ? 'ID бота' : 'Bot ID'}
                  <input
                    data-testid="wizard-bot-id"
                    required
                    pattern="[0-9]{1,20}"
                    inputMode="numeric"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                  />
                  <small>
                    {ru
                      ? 'Числа перед двоеточием в токене. Сам токен сюда не вставляйте.'
                      : 'The digits before the colon in its token. Do not paste the token.'}
                  </small>
                </label>
                <label>
                  {ru ? 'Название для списка' : 'Display name'}
                  <input
                    data-testid="wizard-bot-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              </div>
              <label>
                {ru
                  ? 'Команда запуска: программа и аргументы'
                  : 'Launch command: program and arguments'}
                <textarea
                  data-testid="wizard-command"
                  required
                  rows={5}
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
                <small>
                  {ru
                    ? 'Каждый аргумент отдельно. Для python -m измените массив, сохранив полный путь к Python.'
                    : 'One argument per item. For python -m, edit the array and keep the full interpreter path.'}
                </small>
              </label>
              <label>
                {ru
                  ? 'Подготовительные команды — необязательно'
                  : 'Preparation commands — optional'}
                <textarea rows={3} value={prepare} onChange={(e) => setPrepare(e.target.value)} />
              </label>
              <label>
                {ru ? 'Файл окружения — необязательно' : 'Environment file — optional'}
                <input
                  data-testid="wizard-env-file"
                  value={envFile}
                  onChange={(e) => setEnvFile(e.target.value)}
                />
                <small>
                  {info?.has_env
                    ? ru
                      ? 'В проекте есть .env. Если бот уже читает его сам, оставьте поле пустым.'
                      : 'A .env exists. Leave this empty if your bot already loads it.'
                    : ru
                      ? 'Оставьте пустым, если бот сам загружает настройки.'
                      : 'Leave empty if the bot loads its own settings.'}
                </small>
              </label>
              <p className="wizard-tip">
                {ru
                  ? 'Сохранение добавит бота в список в ожидании запуска. После подключения кода нажмите «Запустить» на его странице. Токен остаётся в проекте.'
                  : 'Saving adds the bot as awaiting startup. After integrating the SDK, click Start on its page. The token stays in your project.'}
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="diagnostic-warning">
              {error}
            </p>
          )}
        </div>
        <div className="wizard-footer">
          <button
            type="button"
            disabled={busy}
            onClick={() => (step ? (setStep(step - 1), setError('')) : close())}
          >
            <ChevronLeft size={15} />
            {step ? (ru ? 'Назад' : 'Back') : ru ? 'Отмена' : 'Cancel'}
          </button>
          <button
            type="submit"
            className="primary-button"
            data-testid="wizard-next"
            disabled={busy}
          >
            {busy ? (
              <Loader2 size={15} className="spin" />
            ) : step === 2 ? (
              <Check size={15} />
            ) : (
              <ChevronRight size={15} />
            )}
            {step === 2 ? (ru ? 'Добавить бота' : 'Add bot') : ru ? 'Далее' : 'Next'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
