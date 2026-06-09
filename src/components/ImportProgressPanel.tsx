import React from 'react';
import { useImportTasks, type ImportTask } from '@/contexts/ImportTaskContext';

/** Форматирование оставшегося времени */
function formatETA(task: ImportTask): string | null {
  if (!task.startTime || !task.current || !task.total || task.current <= 0) return null;
  const elapsed = Date.now() - task.startTime;
  const remaining = (elapsed / task.current) * (task.total - task.current);
  if (remaining < 1000) return null;
  const sec = Math.ceil(remaining / 1000);
  if (sec < 60) return `≈ ${sec} сек`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `≈ ${min} мин ${s > 0 ? `${s} сек` : ''}`;
}

const isBatchUpdate = (type: ImportTask['type']) => type === 'cian-update' || type === 'avito-update';

const TaskRow: React.FC<{ task: ImportTask }> = ({ task }) => {
  const isRunning = task.status === 'running';
  const isDone = task.status === 'done';
  const isError = task.status === 'error';
  const isBatch = isBatchUpdate(task.type);

  const eta = isRunning ? formatETA(task) : null;

  // Цвета: CIAN — синий, Avito — зелёный, остальное — синий
  const colorCls = task.type === 'avito-update'
    ? 'text-green-600 dark:text-green-400'
    : task.type === 'cian-update'
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-blue-600 dark:text-blue-400';

  const barCls = task.type === 'avito-update'
    ? 'bg-green-600 dark:bg-green-500'
    : 'bg-blue-600 dark:bg-blue-500';

  const borderCls = task.type === 'avito-update'
    ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/50'
    : 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50';

  // Для batch-задач — свой блок с расширенной информацией
  if (isBatch) {
    return (
      <div className={`rounded-md border p-2 space-y-1 ${borderCls}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 truncate">
            {task.label}
          </span>
          <span className={`text-[10px] font-semibold tabular-nums whitespace-nowrap ${
            isDone ? 'text-green-600 dark:text-green-400' :
            isError ? 'text-red-500 dark:text-red-400' :
            colorCls
          }`}>
            {isDone ? 'Готово' : isError ? 'Ошибка' : task.current && task.total ? `${task.current}/${task.total}` : '0%'}
          </span>
        </div>
        {isRunning && (
          <div className="h-1 w-full rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${barCls}`}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        )}
        <div className="flex items-center justify-between">
          {task.detail && (
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
              {task.detail}
            </span>
          )}
          {eta && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 whitespace-nowrap ml-2">
              {eta}
            </span>
          )}
        </div>
        {task.errors && task.errors.length > 0 && (
          <div className="text-[10px] text-red-500 dark:text-red-400">
            {task.errors.slice(0, 2).map((e, i) => (
              <p key={i} className="truncate">{e.error}</p>
            ))}
            {task.errors.length > 2 && <p>...и ещё {task.errors.length - 2}</p>}
          </div>
        )}
      </div>
    );
  }

  // Стандартная задача импорта
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 truncate">
          {task.label}
        </span>
        <span className={`text-[10px] font-semibold tabular-nums whitespace-nowrap ${
          isDone ? 'text-green-600 dark:text-green-400' :
          isError ? 'text-red-500 dark:text-red-400' :
          'text-blue-600 dark:text-blue-400'
        }`}>
          {isDone ? 'Готово' : isError ? 'Ошибка' : `${task.progress}%`}
        </span>
      </div>
      {isRunning && (
        <div className="h-1 w-full rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
            style={{ width: `${task.progress}%` }}
          />
        </div>
      )}
      {task.detail && isRunning && (
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate block">
          {task.detail}
        </span>
      )}
    </div>
  );
};

export const ImportProgressPanel: React.FC = () => {
  const { tasks } = useImportTasks();

  const runningTasks = tasks.filter((t) => t.status === 'running' || t.status === 'done' || t.status === 'error');

  if (runningTasks.length === 0) return null;

  const hasRunning = runningTasks.some(t => t.status === 'running');

  return (
    <div className="mx-2 mb-1 rounded-lg border border-blue-200 bg-blue-50 p-2.5 dark:border-blue-900 dark:bg-blue-950/50">
      <div className="mb-2 flex items-center gap-1.5">
        {hasRunning && (
          <svg className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
          Задачи
        </span>
      </div>
      <div className="space-y-2">
        {runningTasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
};
