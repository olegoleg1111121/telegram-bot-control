import { useEffect, useRef, useState } from 'react';
import { Copy, TriangleAlert, X } from 'lucide-react';
import type { ConnectionProblem as Problem } from './types';
import './connection.css';

export default function ConnectionProblem({
  problem,
  language,
  close,
  usePython,
}: {
  problem: Problem;
  language: 'ru' | 'en';
  close: () => void;
  usePython: (value: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const ru = language === 'ru';
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  const messages: Record<string, [string, string]> = {
    python_missing: ru
      ? [
          'Python не найден',
          'Нажмите «Найти Python» или выберите python.exe кнопкой рядом с полем. Для панели нужен Python 3.11 или новее.',
        ]
      : [
          'Python not found',
          'Click Find Python or select python.exe using the browse button. Python 3.11 or newer is required.',
        ],
    python_unsupported: ru
      ? ['Эта версия Python не подходит', 'Выберите Python 3.11 или новее из найденных версий.']
      : ['Unsupported Python version', 'Choose Python 3.11 or newer from the discovered versions.'],
    sdk_missing: ru
      ? [
          'Python найден, библиотека не установлена',
          'Выполните команду ниже в PowerShell или терминале, затем снова нажмите «Подключиться». Команда использует именно выбранный Python.',
        ]
      : [
          'Python found, SDK missing',
          'Run the command below in PowerShell or a terminal, then click Connect again. It uses the selected interpreter.',
        ],
    data_is_python: ru
      ? [
          'Путь к Python попал в «Папку данных»',
          'Верхнее поле — программа Python. Папка данных — отдельное место для статистики; обычно её можно оставить пустой. Нажмите кнопку ниже, чтобы перенести путь.',
        ]
      : [
          'Python was entered as the data directory',
          'The upper field selects Python. The data directory stores statistics and can usually be left empty. Use the button below to move the path.',
        ],
    data_not_directory: ru
      ? ['Вместо папки выбран файл', 'Выберите папку для статистики или оставьте поле пустым.']
      : [
          'A file was selected instead of a folder',
          'Choose a statistics directory or leave the field empty.',
        ],
    data_unavailable: ru
      ? [
          'Нет доступа к папке данных',
          'Выберите доступную папку или оставьте поле пустым для папки текущего пользователя.',
        ]
      : [
          'Data directory is not accessible',
          'Choose an accessible directory or leave it empty for the current user’s default.',
        ],
    ssh_failed: ru
      ? [
          'Не удалось подключиться к серверу',
          'Проверьте адрес, пользователя, SSH-ключ и Python на сервере. Подробности доступны ниже.',
        ]
      : [
          'Server connection failed',
          'Check the host, user, SSH key and server Python. Details are available below.',
        ],
  };
  const [title, body] =
    messages[problem.code] ||
    (ru
      ? [
          'Не удалось подключиться',
          'Проверьте выбранный Python и папку данных. Откройте подробности, чтобы увидеть точную причину.',
        ]
      : [
          'Connection failed',
          'Check the selected Python and data directory. Expand details to see the exact cause.',
        ]);
  return (
    <dialog
      ref={dialog}
      className="connection-problem"
      data-testid="connection-problem"
      aria-labelledby="connection-problem-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <button
        className="icon-button problem-close"
        data-testid="problem-close"
        aria-label={ru ? 'Закрыть' : 'Close'}
        onClick={close}
      >
        <X size={18} />
      </button>
      <TriangleAlert size={26} className="problem-icon" />
      <h2 id="connection-problem-title">{title}</h2>
      <p>{body}</p>
      {problem.python && <code className="problem-python">{problem.python}</code>}
      {problem.installCommand && (
        <>
          <pre data-testid="sdk-install-command">{problem.installCommand}</pre>
          <button
            className="text-button"
            onClick={() =>
              void window.botControl.copyText(problem.installCommand!).then(() => setCopied(true))
            }
          >
            <Copy size={14} />
            {copied ? (ru ? 'Скопировано' : 'Copied') : ru ? 'Копировать команду' : 'Copy command'}
          </button>
        </>
      )}
      {problem.details && (
        <details>
          <summary>{ru ? 'Технические подробности' : 'Technical details'}</summary>
          <pre>{problem.details}</pre>
        </details>
      )}
      <div className="problem-actions">
        {problem.code === 'data_is_python' && problem.python && (
          <button
            className="primary-button"
            data-testid="fix-python-fields"
            onClick={() => {
              usePython(problem.python!);
              close();
            }}
          >
            {ru ? 'Перенести в поле Python' : 'Move to Python field'}
          </button>
        )}
        <button data-testid="problem-dismiss" onClick={close}>
          {ru ? 'Понятно' : 'OK'}
        </button>
      </div>
    </dialog>
  );
}
